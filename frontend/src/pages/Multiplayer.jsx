import { useEffect, useMemo, useRef, useState } from "react";
import PuzzleBoard from "../components/PuzzleBoard.jsx";
import PuzzlePreview from "../components/PuzzlePreview.jsx";
import PhotoUploader from "../components/PhotoUploader.jsx";
import PieceLevelPicker from "../components/PieceLevelPicker.jsx";
import ChatPanel from "../components/ChatPanel.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { formatTime } from "../utils/formatTime.js";
import { readImageDimensions, validateDimensions } from "../utils/photoValidation.js";
import { uploadPhoto } from "../utils/uploadPhoto.js";
import { DEFAULT_PIECE_LEVEL } from "../utils/pieceLevels.js";

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
  const [pendingPhoto, setPendingPhoto] = useState(null); // { url, width, height }, ya subida al backend
  const [pieceLevel, setPieceLevel] = useState(DEFAULT_PIECE_LEVEL.id);
  const [room, setRoom] = useState(null); // room state from server
  const [lockedPieces, setLockedPieces] = useState(new Map());
  const [elapsed, setElapsed] = useState(0);
  const [completedTime, setCompletedTime] = useState(null);
  const [messages, setMessages] = useState([]);
  const lastMoveEmitRef = useRef(0);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    function onRoomState(nextRoom) {
      setRoom(nextRoom);
      setLockedPieces(deriveLockedPieces(nextRoom.puzzle));
      // Un room:state siempre implica "no estamos en la pantalla de
      // completado" (arranque, alguien se unió, o se reinició la partida).
      setCompletedTime(null);
      setElapsed(0);
    }

    function onPieceLocked({ pieceId, lockedBy }) {
      setLockedPieces((prev) => new Map(prev).set(pieceId, lockedBy));
    }

    function onPieceMoved({ pieceId, x, y }) {
      setRoom((prev) => updatePiece(prev, pieceId, { x, y }));
    }

    function onPieceUpdated({ pieceId, x, y, placed, placedBy }) {
      setRoom((prev) => updatePiece(prev, pieceId, { x, y, placed, placedBy }));
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

    function onChatMessage(message) {
      setMessages((prev) => [...prev, message]);
    }

    socket.on("room:state", onRoomState);
    socket.on("piece:locked", onPieceLocked);
    socket.on("piece:moved", onPieceMoved);
    socket.on("piece:updated", onPieceUpdated);
    socket.on("game:completed", onGameCompleted);
    socket.on("player:left", onPlayerLeft);
    socket.on("chat:message", onChatMessage);

    return () => {
      socket.off("room:state", onRoomState);
      socket.off("piece:locked", onPieceLocked);
      socket.off("piece:moved", onPieceMoved);
      socket.off("piece:updated", onPieceUpdated);
      socket.off("game:completed", onGameCompleted);
      socket.off("player:left", onPlayerLeft);
      socket.off("chat:message", onChatMessage);
    };
  }, [socketRef]);

  useEffect(() => {
    if (room?.status !== "playing" || completedTime !== null) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - room.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [room?.status, room?.startedAt, completedTime]);

  // Si todavía no subiste ninguna foto (por ejemplo, te uniste a la sala en
  // vez de crearla) usamos la que ya está jugándose como base para "jugar de
  // nuevo" sin forzar a subir una si no se quiere cambiar. boardWidth/Height
  // sirve como stand-in del width/height original: el aspect ratio es el
  // mismo, y es lo único que necesita el server para repartir la grilla.
  useEffect(() => {
    if (!pendingPhoto && room?.puzzle) {
      setPendingPhoto({
        url: room.puzzle.imageUrl,
        width: room.puzzle.boardWidth,
        height: room.puzzle.boardHeight,
      });
    }
  }, [room?.puzzle, pendingPhoto]);

  const contributions = useMemo(() => {
    if (!room || completedTime === null) return [];
    const counts = new Map();
    for (const piece of room.puzzle.pieces) {
      if (piece.placed && piece.placedBy) {
        counts.set(piece.placedBy, (counts.get(piece.placedBy) || 0) + 1);
      }
    }
    return room.players.map((p) => ({
      socketId: p.socketId,
      name: p.name,
      count: counts.get(p.socketId) || 0,
    }));
  }, [room, completedTime]);

  async function handleFile(file) {
    const { width, height, url: localUrl } = await readImageDimensions(file);
    const dimError = validateDimensions(width, height);
    if (dimError) {
      URL.revokeObjectURL(localUrl);
      throw new Error(dimError);
    }
    try {
      const uploaded = await uploadPhoto(file);
      setPendingPhoto(uploaded);
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  }

  function handleCreateRoom() {
    if (!pendingPhoto) {
      alert("Subí una foto antes de crear la sala.");
      return;
    }
    socketRef.current?.emit(
      "room:create",
      {
        name,
        imageUrl: pendingPhoto.url,
        imageWidth: pendingPhoto.width,
        imageHeight: pendingPhoto.height,
        level: pieceLevel,
      },
      (res) => {
        if (res?.ok) {
          setRoom(res.room);
          setLockedPieces(deriveLockedPieces(res.room.puzzle));
        } else {
          alert(`No se pudo crear la sala: ${res?.error}`);
        }
      }
    );
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

  function handleSendMessage(text) {
    socketRef.current?.emit("chat:message", { text });
  }

  function handleRestartGame() {
    if (!pendingPhoto) {
      alert("Subí una foto para la siguiente ronda.");
      return;
    }
    socketRef.current?.emit(
      "game:restart",
      {
        imageUrl: pendingPhoto.url,
        imageWidth: pendingPhoto.width,
        imageHeight: pendingPhoto.height,
        level: pieceLevel,
      },
      (res) => {
        if (!res?.ok) alert(`No se pudo reiniciar: ${res?.error}`);
      }
    );
  }

  if (!room) {
    return (
      <div className="page lobby">
        <h2>Multiplayer</h2>
        <p>{connected ? "Conectado al servidor" : "Conectando..."}</p>
        <input placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <p className="preview-label" style={{ textAlign: "center" }}>
            Subí la foto (la arma quien crea la sala)
          </p>
          <PhotoUploader previewUrl={pendingPhoto?.url} busyLabel="Subiendo..." onFile={handleFile} />
          <PieceLevelPicker selectedId={pieceLevel} onSelect={setPieceLevel} />
        </div>
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
          <div className="banner success completion-banner">
            <div>¡Completado en {formatTime(completedTime)}!</div>
            {contributions.length === 2 && (
              <div className="contributions">
                <span>
                  {contributions[0].name}: {contributions[0].count} piezas
                </span>
                <span>
                  {contributions[1].name}: {contributions[1].count} piezas
                </span>
                {contributions[0].count !== contributions[1].count && (
                  <div className="contribution-winner">
                    🏆{" "}
                    {contributions[0].count > contributions[1].count
                      ? contributions[0].name
                      : contributions[1].name}{" "}
                    aportó más piezas
                  </div>
                )}
              </div>
            )}
            <div className="restart-controls">
              <p className="preview-label">Subí otra foto para la siguiente ronda (o dejá la misma)</p>
              <PhotoUploader previewUrl={pendingPhoto?.url} busyLabel="Subiendo..." onFile={handleFile} />
              <PieceLevelPicker selectedId={pieceLevel} onSelect={setPieceLevel} />
              <button onClick={handleRestartGame}>Jugar de nuevo</button>
            </div>
          </div>
        )}
        {room.status === "playing" && completedTime === null && <div className="timer">⏱ {formatTime(elapsed)}</div>}
      </div>

      <div className="game-layout">
        <PuzzleBoard
          puzzle={room.puzzle}
          lockedPieces={lockedPieces}
          mySocketId={socketId}
          interactive={room.status === "playing"}
          onPieceDragStart={handleDragStart}
          onPieceDragMove={handleDragMove}
          onPieceDragEnd={handleDragEnd}
        />
        <ChatPanel messages={messages} mySocketId={socketId} onSend={handleSendMessage} />
      </div>
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
