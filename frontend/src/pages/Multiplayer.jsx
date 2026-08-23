import { useEffect, useRef, useState } from "react";
import PuzzleBoard from "../components/PuzzleBoard.jsx";
import PuzzlePreview from "../components/PuzzlePreview.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { formatTime } from "../utils/formatTime.js";

const MOVE_THROTTLE_MS = 40;

// El estado de una sala puede llegar con piezas ya bloqueadas (por ejemplo,
// si el otro jugador está sosteniendo una pieza justo cuando te unís) — hay
// que reflejarlo desde el primer render, no solo a partir del próximo evento.
function deriveLockedPieces(puzzle) {
  const map = new Map();
  for (const piece of puzzle?.pieces ?? []) {
    if (piece.locked && piece.lockedBy) map.set(piece.id, piece.lockedBy);
  }
  return map;
}

export default function Multiplayer() {
  const { socketRef, connected, socketId } = useSocket();
  const [name, setName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [room, setRoom] = useState(null); // room state from server
  const [lockedPieces, setLockedPieces] = useState(new Map());
  const [elapsed, setElapsed] = useState(0);
  const [completedTime, setCompletedTime] = useState(null);
  const lastMoveEmitRef = useRef(0);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    function onRoomState(nextRoom) {
      setRoom(nextRoom);
      setLockedPieces(deriveLockedPieces(nextRoom.puzzle));
    }

    function onPieceLocked({ pieceId, lockedBy }) {
      setLockedPieces((prev) => new Map(prev).set(pieceId, lockedBy));
    }

    function onPieceMoved({ pieceId, x, y }) {
      setRoom((prev) => updatePiece(prev, pieceId, { x, y }));
    }

    function onPieceUpdated({ pieceId, x, y, placed }) {
      setRoom((prev) => updatePiece(prev, pieceId, { x, y, placed }));
      setLockedPieces((prev) => {
        const next = new Map(prev);
        next.delete(pieceId);
        return next;
      });
    }

    function onGameCompleted({ tiempoSegundos }) {
      setCompletedTime(tiempoSegundos);
    }

    function onPlayerLeft() {
      setLockedPieces(new Map());
    }

    socket.on("room:state", onRoomState);
    socket.on("piece:locked", onPieceLocked);
    socket.on("piece:moved", onPieceMoved);
    socket.on("piece:updated", onPieceUpdated);
    socket.on("game:completed", onGameCompleted);
    socket.on("player:left", onPlayerLeft);

    return () => {
      socket.off("room:state", onRoomState);
      socket.off("piece:locked", onPieceLocked);
      socket.off("piece:moved", onPieceMoved);
      socket.off("piece:updated", onPieceUpdated);
      socket.off("game:completed", onGameCompleted);
      socket.off("player:left", onPlayerLeft);
    };
  }, [socketRef]);

  useEffect(() => {
    if (room?.status !== "playing" || completedTime !== null) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - room.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [room?.status, room?.startedAt, completedTime]);

  function handleCreateRoom() {
    socketRef.current?.emit("room:create", { name, rows: 6, cols: 8 }, (res) => {
      if (res?.ok) {
        setRoom(res.room);
        setLockedPieces(deriveLockedPieces(res.room.puzzle));
      }
    });
  }

  function handleJoinRoom() {
    socketRef.current?.emit("room:join", { roomId: joinRoomId.trim().toUpperCase(), name }, (res) => {
      if (res?.ok) {
        setRoom(res.room);
        setLockedPieces(deriveLockedPieces(res.room.puzzle));
      } else {
        alert(`No se pudo unir a la sala: ${res?.error}`);
      }
    });
  }

  function handleStartGame() {
    socketRef.current?.emit("game:start", {}, (res) => {
      if (!res?.ok) alert(`No se pudo iniciar la partida: ${res?.error}`);
    });
  }

  function handleDragStart(pieceId) {
    socketRef.current?.emit("piece:pick", { pieceId });
  }

  function handleDragMove(pieceId, x, y) {
    const now = Date.now();
    if (now - lastMoveEmitRef.current < MOVE_THROTTLE_MS) return;
    lastMoveEmitRef.current = now;
    socketRef.current?.emit("piece:move", { pieceId, x, y });
  }

  function handleDragEnd(pieceId, x, y) {
    socketRef.current?.emit("piece:release", { pieceId, x, y });
  }

  if (!room) {
    return (
      <div className="page lobby">
        <h2>Multiplayer</h2>
        <p>{connected ? "Conectado al servidor" : "Conectando..."}</p>
        <input placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="lobby-actions">
          <button onClick={handleCreateRoom}>Crear sala</button>
          <div className="join-row">
            <input
              placeholder="Código de sala"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
            />
            <button onClick={handleJoinRoom}>Unirse</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hud">
        <h2>Sala {room.id}</h2>
        <p>Jugadores: {room.players.map((p) => p.name).join(", ") || "esperando..."}</p>
        <PuzzlePreview
          imageUrl={room.puzzle.imageUrl}
          boardWidth={room.puzzle.boardWidth}
          boardHeight={room.puzzle.boardHeight}
        />
        {room.status === "waiting" && <div className="banner">Esperando al segundo jugador...</div>}
        {room.status === "ready" && (
          <div className="banner">
            Los 2 jugadores están listos.
            <button onClick={handleStartGame}>Comenzar</button>
          </div>
        )}
        {completedTime !== null && (
          <div className="banner success">¡Completado en {formatTime(completedTime)}!</div>
        )}
        {room.status === "playing" && completedTime === null && <div className="timer">⏱ {formatTime(elapsed)}</div>}
      </div>

      <PuzzleBoard
        puzzle={room.puzzle}
        lockedPieces={lockedPieces}
        mySocketId={socketId}
        interactive={room.status === "playing"}
        onPieceDragStart={handleDragStart}
        onPieceDragMove={handleDragMove}
        onPieceDragEnd={handleDragEnd}
      />
    </div>
  );
}

function updatePiece(room, pieceId, patch) {
  if (!room) return room;
  return {
    ...room,
    puzzle: {
      ...room.puzzle,
      pieces: room.puzzle.pieces.map((p) => (p.id === pieceId ? { ...p, ...patch } : p)),
    },
  };
}
