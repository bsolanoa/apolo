import {
  createRoom,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  startGame,
  restartGame,
  findPiece,
  isPuzzleComplete,
  publicRoomState,
} from "./rooms.js";
import { isNearCorrectPosition } from "./puzzleUtils.js";
import { saveResult, SUPABASE_URL } from "./supabaseClient.js";
import { findPieceLevel, gridForPieceCount } from "./pieceLevels.js";

// La foto ya no viene de un catálogo fijo: el jugador la sube antes por
// POST /api/upload (ver upload.js), que devuelve una URL de Supabase
// Storage + el width/height medidos de los bytes reales. Acá solo se
// valida que la URL efectivamente apunte a ese bucket (para no reenviar al
// otro jugador una URL arbitraria) y que las dimensiones sean coherentes;
// la cantidad de piezas se resuelve contra `pieceLevels.js` igual que antes
// se resolvía la foto contra imageCatalog.js — el cliente nunca decide
// directamente filas/columnas.
function resolvePuzzleInput({ imageUrl, imageWidth, imageHeight, level }) {
  const expectedPrefix = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/puzzle-photos/` : null;
  if (
    typeof imageUrl !== "string" ||
    !expectedPrefix ||
    !imageUrl.startsWith(expectedPrefix) ||
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return { error: "INVALID_IMAGE" };
  }

  const { count } = findPieceLevel(level);
  const { rows, cols } = gridForPieceCount(count, imageWidth / imageHeight);

  return { imageUrl, imageWidth, imageHeight, rows, cols };
}

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("room:create", ({ name, imageUrl, imageWidth, imageHeight, level } = {}, cb) => {
      const resolved = resolvePuzzleInput({ imageUrl, imageWidth, imageHeight, level });
      if (resolved.error) {
        cb?.({ ok: false, error: resolved.error });
        return;
      }

      const room = createRoom(resolved);
      const { room: updated } = addPlayerToRoom(room.id, socket.id, name);

      socket.join(room.id);
      socket.data.roomId = room.id;
      socket.data.name = name;

      cb?.({ ok: true, room: publicRoomState(updated) });
    });

    socket.on("room:join", ({ roomId, name } = {}, cb) => {
      const result = addPlayerToRoom(roomId, socket.id, name);
      if (result.error) {
        cb?.({ ok: false, error: result.error });
        return;
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.name = name;

      cb?.({ ok: true, room: publicRoomState(result.room) });
      io.to(roomId).emit("room:state", publicRoomState(result.room));
    });

    // Cualquiera de los jugadores presentes puede arrancar la partida, una
    // vez que hay al menos 2 (sala en estado "ready") — no hace falta
    // esperar al máximo de 4.
    socket.on("game:start", (_payload, cb) => {
      const result = startGame(socket.data.roomId);
      if (result.error) {
        cb?.({ ok: false, error: result.error });
        return;
      }

      io.to(result.room.id).emit("room:state", publicRoomState(result.room));
      cb?.({ ok: true });
    });

    // Un jugador toma una pieza -> se bloquea para el resto de jugadores.
    socket.on("piece:pick", ({ pieceId } = {}) => {
      const room = getRoom(socket.data.roomId);
      if (!room || room.status !== "playing") return;

      const piece = findPiece(room, pieceId);
      if (!piece || piece.placed) return;

      // Si ya está bloqueada por otro jugador, se ignora el pedido.
      if (piece.locked && piece.lockedBy !== socket.id) return;

      piece.locked = true;
      piece.lockedBy = socket.id;

      io.to(room.id).emit("piece:locked", { pieceId, lockedBy: socket.id });
    });

    // Movimiento en vivo mientras se arrastra (throttled desde el cliente).
    socket.on("piece:move", ({ pieceId, x, y } = {}) => {
      const room = getRoom(socket.data.roomId);
      if (!room) return;

      const piece = findPiece(room, pieceId);
      if (!piece || piece.lockedBy !== socket.id) return;

      piece.x = x;
      piece.y = y;

      socket.to(room.id).emit("piece:moved", { pieceId, x, y });
    });

    // Se suelta la pieza -> se evalúa snap y se libera el lock.
    socket.on("piece:release", ({ pieceId, x, y } = {}, cb) => {
      const room = getRoom(socket.data.roomId);
      if (!room) return;

      const piece = findPiece(room, pieceId);
      if (!piece || piece.lockedBy !== socket.id) return;

      const snapped = isNearCorrectPosition(piece, x, y);
      piece.x = snapped ? piece.correctX : x;
      piece.y = snapped ? piece.correctY : y;
      piece.placed = snapped;
      piece.locked = false;
      piece.lockedBy = null;
      // Quién la encajó, para poder mostrar al final cuántas piezas aportó
      // cada jugador. Solo se registra la primera vez que queda bien puesta.
      if (snapped && !piece.placedBy) piece.placedBy = socket.id;

      io.to(room.id).emit("piece:updated", {
        pieceId,
        x: piece.x,
        y: piece.y,
        placed: piece.placed,
        placedBy: piece.placedBy,
      });

      if (isPuzzleComplete(room)) {
        finishGame(io, room);
      }

      cb?.({ ok: true, placed: piece.placed });
    });

    // Rearma el rompecabezas en la misma sala (misma foto u otra elegida)
    // una vez terminada la partida, sin tener que crear una sala nueva.
    socket.on("game:restart", ({ imageUrl, imageWidth, imageHeight, level } = {}, cb) => {
      const roomId = socket.data.roomId;
      const room = getRoom(roomId);
      if (!room) {
        cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
        return;
      }

      const resolved = resolvePuzzleInput({ imageUrl, imageWidth, imageHeight, level });
      if (resolved.error) {
        cb?.({ ok: false, error: resolved.error });
        return;
      }

      const result = restartGame({ roomId, ...resolved });
      if (result.error) {
        cb?.({ ok: false, error: result.error });
        return;
      }

      io.to(roomId).emit("room:state", publicRoomState(result.room));
      cb?.({ ok: true });
    });

    // Chat simple entre los jugadores de la sala: solo se reenvía en vivo,
    // no se persiste ni se guarda historial (se pierde al refrescar, igual
    // que el resto del estado de la sala).
    socket.on("chat:message", ({ text } = {}) => {
      const roomId = socket.data.roomId;
      const trimmed = typeof text === "string" ? text.trim().slice(0, 300) : "";
      if (!roomId || !trimmed) return;

      io.to(roomId).emit("chat:message", {
        text: trimmed,
        from: socket.data.name || "Jugador",
        socketId: socket.id,
        ts: Date.now(),
      });
    });

    socket.on("disconnect", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = removePlayerFromRoom(roomId, socket.id);
      if (room) {
        io.to(roomId).emit("room:state", publicRoomState(room));
        io.to(roomId).emit("player:left", { socketId: socket.id });
      }
    });
  });
}

async function finishGame(io, room) {
  room.status = "finished";
  room.finishedAt = Date.now();
  const tiempoSegundos = Math.round((room.finishedAt - room.startedAt) / 1000);

  io.to(room.id).emit("game:completed", { tiempoSegundos });

  await saveResult({
    partidaId: room.id,
    jugadores: room.players.map((p) => p.name),
    tiempoSegundos,
  });
}
