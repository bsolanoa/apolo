import {
  createRoom,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  startGame,
  findPiece,
  isPuzzleComplete,
  publicRoomState,
} from "./rooms.js";
import { isNearCorrectPosition } from "./puzzleUtils.js";
import { saveResult } from "./supabaseClient.js";

// Ruta relativa: la resuelve el navegador de cada jugador contra el origen
// del frontend (donde vive public/foto1.jpg), no contra el del backend.
const DEFAULT_IMAGE = "/foto1.jpg";

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("room:create", ({ name, rows, cols, imageUrl } = {}, cb) => {
      const room = createRoom({
        imageUrl: imageUrl || DEFAULT_IMAGE,
        rows: rows || 6,
        cols: cols || 8,
      });
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

    // Cualquiera de los 2 jugadores puede arrancar la partida, pero solo
    // una vez que ambos están presentes (sala en estado "ready").
    socket.on("game:start", (_payload, cb) => {
      const result = startGame(socket.data.roomId);
      if (result.error) {
        cb?.({ ok: false, error: result.error });
        return;
      }

      io.to(result.room.id).emit("room:state", publicRoomState(result.room));
      cb?.({ ok: true });
    });

    // Un jugador toma una pieza -> se bloquea para el otro jugador.
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

      io.to(room.id).emit("piece:updated", {
        pieceId,
        x: piece.x,
        y: piece.y,
        placed: piece.placed,
      });

      if (isPuzzleComplete(room)) {
        finishGame(io, room);
      }

      cb?.({ ok: true, placed: piece.placed });
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

  const [jugador1, jugador2] = room.players.map((p) => p.name);
  await saveResult({
    partidaId: room.id,
    jugador1,
    jugador2,
    tiempoSegundos,
  });
}
