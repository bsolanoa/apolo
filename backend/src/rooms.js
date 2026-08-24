import { generatePuzzle } from "./puzzleUtils.js";

// Estado de salas en memoria. Se pierde si el proceso se reinicia (aceptable
// dado el free tier de Render con cold starts / posibles restarts).
const rooms = new Map();

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function createRoom({ imageUrl, imageWidth, imageHeight, rows, cols }) {
  let roomId = makeRoomId();
  while (rooms.has(roomId)) roomId = makeRoomId();

  const room = {
    id: roomId,
    players: [], // { socketId, name }
    puzzle: generatePuzzle({ rows, cols, imageUrl, imageWidth, imageHeight }),
    status: "waiting", // waiting (falta un jugador) | ready (2-4 jugadores, esperando "Comenzar") | playing | finished
    startedAt: null,
    finishedAt: null,
  };
  rooms.set(roomId, room);
  return room;
}

export function getRoom(roomId) {
  return rooms.get(roomId);
}

export function deleteRoom(roomId) {
  rooms.delete(roomId);
}

const MAX_PLAYERS = 4;
const MIN_PLAYERS_TO_START = 2;

export function addPlayerToRoom(roomId, socketId, name) {
  const room = getRoom(roomId);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (room.players.length >= MAX_PLAYERS) return { error: "ROOM_FULL" };
  if (room.players.some((p) => p.socketId === socketId)) {
    return { room };
  }

  room.players.push({ socketId, name: name || `Jugador ${room.players.length + 1}` });

  // Con el mínimo de jugadores presentes la sala queda "lista": el juego no
  // arranca solo, hace falta que alguno presione "Comenzar" (game:start).
  // No hace falta llegar al máximo de 4 — el que crea la sala decide si
  // espera más gente o arranca ya.
  if (room.players.length >= MIN_PLAYERS_TO_START && room.status === "waiting") {
    room.status = "ready";
  }

  return { room };
}

// Arranca la partida: solo válido si ya está el mínimo de jugadores presente.
export function startGame(roomId) {
  const room = getRoom(roomId);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (room.players.length < MIN_PLAYERS_TO_START) return { error: "NOT_ENOUGH_PLAYERS" };
  if (room.status !== "ready") return { error: "INVALID_STATE" };

  room.status = "playing";
  room.startedAt = Date.now();
  return { room };
}

// Arma un puzzle nuevo (misma foto o una distinta) reutilizando la sala y
// los jugadores ya presentes — así se puede seguir jugando sin recrear la
// sala. Solo tiene sentido llamarla con la partida terminada.
export function restartGame({ roomId, imageUrl, imageWidth, imageHeight, rows, cols }) {
  const room = getRoom(roomId);
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (room.status !== "finished") return { error: "INVALID_STATE" };

  room.puzzle = generatePuzzle({ rows, cols, imageUrl, imageWidth, imageHeight });
  room.status = room.players.length >= MIN_PLAYERS_TO_START ? "ready" : "waiting";
  room.startedAt = null;
  room.finishedAt = null;

  return { room };
}

export function removePlayerFromRoom(roomId, socketId) {
  const room = getRoom(roomId);
  if (!room) return null;

  room.players = room.players.filter((p) => p.socketId !== socketId);

  // Libera cualquier pieza que este jugador tuviera bloqueada.
  for (const piece of room.puzzle.pieces) {
    if (piece.lockedBy === socketId) {
      piece.locked = false;
      piece.lockedBy = null;
    }
  }

  if (room.players.length === 0) {
    deleteRoom(roomId);
    return null;
  }

  // Si la partida ya está en curso, sigue con los jugadores que queden (aunque
  // sea uno solo) — no tiene sentido cortarla a mitad de camino. Pero si
  // todavía no arrancó ("ready") y cae por debajo del mínimo, vuelve a faltar
  // gente para poder arrancar.
  if (room.status === "ready" && room.players.length < MIN_PLAYERS_TO_START) {
    room.status = "waiting";
  }

  return room;
}

export function findPiece(room, pieceId) {
  return room.puzzle.pieces.find((p) => p.id === pieceId);
}

export function isPuzzleComplete(room) {
  return room.puzzle.pieces.every((p) => p.placed);
}

export function publicRoomState(room) {
  return {
    id: room.id,
    players: room.players.map((p) => ({ socketId: p.socketId, name: p.name })),
    puzzle: room.puzzle,
    status: room.status,
    startedAt: room.startedAt,
  };
}
