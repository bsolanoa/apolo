import { useEffect, useMemo, useRef, useState } from "react";
import PuzzleBoard from "../components/PuzzleBoard.jsx";
import PuzzlePreview from "../components/PuzzlePreview.jsx";
import PhotoUploader from "../components/PhotoUploader.jsx";
import PieceLevelPicker from "../components/PieceLevelPicker.jsx";
import ChatPanel from "../components/ChatPanel.jsx";
import Modal from "../components/Modal.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { formatTime } from "../utils/formatTime.js";
import { playNotificationSound } from "../utils/notificationSound.js";
import { readImageDimensions, validateDimensions, shrinkForPuzzle } from "../utils/photoValidation.js";
import { uploadPhoto } from "../utils/uploadPhoto.js";
import { DEFAULT_PIECE_LEVEL } from "../utils/pieceLevels.js";

const MOVE_THROTTLE_MS = 40;

// Iconos dibujados a mano (no bajados de ningún banco de imágenes) para no
// sumar otro asset con tema de licencia — mismo criterio que el resto de
// los assets del juego (piezas del jigsaw reimplementadas, sonido de chat
// sintetizado en vez de un mp3).
function CreateRoomIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function JoinRoomIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

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
  // null: todavía no eligió si crear o unirse. El botón "Comenzar" real de
  // la sala aparece recién más adelante (cuando hay 2+ jugadores) — esto es
  // solo el paso previo de "qué querés hacer".
  const [lobbyMode, setLobbyMode] = useState(null); // null | "create" | "join"
  const [room, setRoom] = useState(null); // room state from server
  const [lockedPieces, setLockedPieces] = useState(new Map());
  const [elapsed, setElapsed] = useState(0);
  const [completedTime, setCompletedTime] = useState(null);
  // Separado de `completedTime`: cerrar el popup no debe perder el tiempo
  // final (todavía hace falta para el banner con el picker de siguiente
  // ronda, que sigue visible detrás del modal).
  const [showResultModal, setShowResultModal] = useState(false);
  const [messages, setMessages] = useState([]);
  const lastMoveEmitRef = useRef(0);
  // El handler de chat se registra una sola vez (efecto con [socketRef] como
  // dependencia), así que no puede leer `socketId` directo del render —
  // quedaría pegado al valor (probablemente null) que tenía al montar. El
  // ref se mantiene al día en cada render sin tener que re-registrar el
  // listener.
  const mySocketIdRef = useRef(socketId);
  mySocketIdRef.current = socketId;

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    function onRoomState(nextRoom) {
      setRoom(nextRoom);
      setLockedPieces(deriveLockedPieces(nextRoom.puzzle));
      // Un room:state siempre implica "no estamos en la pantalla de
      // completado" (arranque, alguien se unió, o se reinició la partida).
      setCompletedTime(null);
      setShowResultModal(false);
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
      setShowResultModal(true);
    }

    function onPlayerLeft() {
      setLockedPieces(new Map());
    }

    function onChatMessage(message) {
      setMessages((prev) => [...prev, message]);
      // No suena por tu propio mensaje, solo por los que manda el resto.
      if (message.socketId !== mySocketIdRef.current) playNotificationSound();
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

  // Jugador (o jugadores, si hay empate) que más piezas aportó. Si todos
  // aportaron lo mismo no hay "ganador" que destacar.
  const contributionLeaders = useMemo(() => {
    if (contributions.length === 0) return [];
    const max = Math.max(...contributions.map((c) => c.count));
    return contributions.filter((c) => c.count === max);
  }, [contributions]);

  async function handleFile(file) {
    const { width, height, url: localUrl } = await readImageDimensions(file);
    const dimError = validateDimensions(width, height);
    if (dimError) {
      URL.revokeObjectURL(localUrl);
      throw new Error(dimError);
    }
    // Se sube la versión reescalada, no el archivo original: así el otro
    // jugador tampoco tiene que descargar/decodificar una foto de hasta
    // 6000px como textura del rompecabezas.
    const resized = await shrinkForPuzzle(file, width, height, localUrl);
    try {
      const uploaded = await uploadPhoto(resized.file);
      setPendingPhoto(uploaded);
    } finally {
      URL.revokeObjectURL(localUrl);
      if (resized.url !== localUrl) URL.revokeObjectURL(resized.url);
    }
  }

  function handleCreateRoom() {
    if (!pendingPhoto) {
      alert("Sube una foto antes de crear la sala.");
      return;
    }
    socketRef.current?.emit(
      "room:create",
      {
        name: name.trim(),
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
    socketRef.current?.emit("room:join", { roomId: joinRoomId.trim().toUpperCase(), name: name.trim() }, (res) => {
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
      alert("Sube una foto para la siguiente ronda.");
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
    const canJoin = Boolean(name.trim() && joinRoomId.trim());
    const canCreate = Boolean(name.trim() && pendingPhoto);

    return (
      <div className="page lobby">
        <h2>Multiplayer</h2>
        <p>{connected ? "Conectado al servidor" : "Conectando..."}</p>

        {lobbyMode === null && (
          <div className="lobby-mode-choice">
            <button onClick={() => setLobbyMode("create")}>
              <CreateRoomIcon />
              <span>Crear sala</span>
            </button>
            <button onClick={() => setLobbyMode("join")}>
              <JoinRoomIcon />
              <span>Unirse a una sala</span>
            </button>
          </div>
        )}

        {lobbyMode === "join" && (
          <div className="lobby-step">
            <button className="lobby-back" onClick={() => setLobbyMode(null)}>
              ← Volver
            </button>
            <input placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              placeholder="Código de sala"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
            />
            {!canJoin && <p className="lobby-hint">Completa tu nombre y el código de sala.</p>}
            <button onClick={handleJoinRoom} disabled={!canJoin}>
              Unirse
            </button>
          </div>
        )}

        {lobbyMode === "create" && (
          <div className="lobby-step">
            <button className="lobby-back" onClick={() => setLobbyMode(null)}>
              ← Volver
            </button>
            <input placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
            <div>
              <p className="preview-label" style={{ textAlign: "center" }}>
                Sube la foto (la arma quien crea la sala)
              </p>
              <PhotoUploader previewUrl={pendingPhoto?.url} busyLabel="Subiendo..." onFile={handleFile} />
              <PieceLevelPicker selectedId={pieceLevel} onSelect={setPieceLevel} />
            </div>
            {!canCreate && <p className="lobby-hint">Completa tu nombre y sube una foto para crear la sala.</p>}
            <button onClick={handleCreateRoom} disabled={!canCreate}>
              Crear sala
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      {completedTime !== null && showResultModal && (
        <Modal onClose={() => setShowResultModal(false)}>
          <h3>🎉 ¡Completado en {formatTime(completedTime)}!</h3>
          {contributions.length > 0 && (
            <div className="contributions">
              {contributions.map((c) => (
                <span key={c.socketId}>
                  {c.name}: {c.count} piezas
                </span>
              ))}
              {contributionLeaders.length > 0 && contributionLeaders.length < contributions.length && (
                <div className="contribution-winner">
                  🏆 {contributionLeaders.map((c) => c.name).join(" y ")} aportó más piezas
                </div>
              )}
            </div>
          )}
          <div className="modal-actions">
            <button onClick={handleRestartGame}>Jugar de nuevo</button>
            <button className="modal-secondary" onClick={() => setShowResultModal(false)}>
              Ver tablero
            </button>
          </div>
        </Modal>
      )}

      <div className="hud">
        <h2>Sala {room.id}</h2>
        <p>Jugadores: {room.players.map((p) => p.name).join(", ") || "esperando..."}</p>
        <PuzzlePreview
          imageUrl={room.puzzle.imageUrl}
          boardWidth={room.puzzle.boardWidth}
          boardHeight={room.puzzle.boardHeight}
        />
        {room.status === "waiting" && (
          <div className="banner">Esperando jugadores... (hace falta al menos 1 más)</div>
        )}
        {room.status === "ready" && (
          <div className="banner">
            {room.players.length}/4 jugadores listos. Puedes esperar a más gente o comenzar ya.
            <button onClick={handleStartGame}>Comenzar</button>
          </div>
        )}
        {completedTime !== null && (
          <div className="banner success completion-banner">
            <div>¡Completado en {formatTime(completedTime)}!</div>
            {contributions.length > 0 && (
              <div className="contributions">
                {contributions.map((c) => (
                  <span key={c.socketId}>
                    {c.name}: {c.count} piezas
                  </span>
                ))}
                {contributionLeaders.length > 0 && contributionLeaders.length < contributions.length && (
                  <div className="contribution-winner">
                    🏆 {contributionLeaders.map((c) => c.name).join(" y ")} aportó más piezas
                  </div>
                )}
              </div>
            )}
            <div className="restart-controls">
              <p className="preview-label">Sube otra foto para la siguiente ronda (o deja la misma)</p>
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
