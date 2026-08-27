import { useEffect, useMemo, useRef, useState } from "react";
import PuzzleBoard from "../components/PuzzleBoard.jsx";
import PuzzlePreview from "../components/PuzzlePreview.jsx";
import PhotoUploader from "../components/PhotoUploader.jsx";
import PieceLevelPicker from "../components/PieceLevelPicker.jsx";
import Modal from "../components/Modal.jsx";
import { generatePuzzle, isNearCorrectPosition } from "../utils/puzzleGenerator.js";
import { formatTime } from "../utils/formatTime.js";
import { saveSinglePlayerResult } from "../supabaseClient.js";
import { readImageDimensions, validateDimensions, shrinkForPuzzle } from "../utils/photoValidation.js";
import { DEFAULT_PIECE_LEVEL, findPieceLevel, gridForPieceCount } from "../utils/pieceLevels.js";

// Todo corre en el cliente: la foto que sube el jugador no necesita pasar
// por el backend (a diferencia de multiplayer, acá nadie más la tiene que
// ver), así que se usa directo como object URL.
function buildPuzzle(photo, levelId) {
  const { count } = findPieceLevel(levelId);
  const { rows, cols } = gridForPieceCount(count, photo.width / photo.height);
  return generatePuzzle({ rows, cols, imageUrl: photo.url, imageWidth: photo.width, imageHeight: photo.height });
}

export default function SinglePlayer() {
  const [photo, setPhoto] = useState(null); // { url, width, height }
  const [pieceLevel, setPieceLevel] = useState(DEFAULT_PIECE_LEVEL.id);
  const [puzzle, setPuzzle] = useState(null);
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [completed, setCompleted] = useState(false);
  // Separado de `completed`: `completed` también controla si ya se guardó
  // el resultado (no se puede resetear al cerrar el popup sin duplicar el
  // guardado), así que la visibilidad del modal se maneja aparte.
  const [showResultModal, setShowResultModal] = useState(false);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!started || completed) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [started, completed]);

  const allPlaced = useMemo(() => (puzzle ? puzzle.pieces.every((p) => p.placed) : false), [puzzle]);

  useEffect(() => {
    if (started && allPlaced && !completed) {
      setCompleted(true);
      setShowResultModal(true);
      const finalTime = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(finalTime);
      saveSinglePlayerResult({
        partidaId: `solo-${Date.now()}`,
        jugador1: "Jugador",
        tiempoSegundos: finalTime,
      });
    }
  }, [started, allPlaced, completed]);

  function resetGame(nextPhoto, nextLevel) {
    setPuzzle(buildPuzzle(nextPhoto, nextLevel));
    setElapsed(0);
    setCompleted(false);
    setShowResultModal(false);
    setStarted(false);
  }

  async function handleFile(file) {
    const { width, height, url } = await readImageDimensions(file);
    const dimError = validateDimensions(width, height);
    if (dimError) {
      URL.revokeObjectURL(url);
      throw new Error(dimError);
    }
    const resized = await shrinkForPuzzle(file, width, height, url);
    if (resized.url !== url) URL.revokeObjectURL(url);
    const nextPhoto = { url: resized.url, width: resized.width, height: resized.height };
    setPhoto(nextPhoto);
    resetGame(nextPhoto, pieceLevel);
  }

  function handleLevelChange(levelId) {
    setPieceLevel(levelId);
    if (photo) resetGame(photo, levelId);
  }

  function handleDragEnd(pieceId, x, y) {
    setPuzzle((prev) => {
      const pieces = prev.pieces.map((piece) => {
        if (piece.id !== pieceId) return piece;
        const snapped = isNearCorrectPosition(piece, x, y);
        return {
          ...piece,
          x: snapped ? piece.correctX : x,
          y: snapped ? piece.correctY : y,
          placed: snapped,
        };
      });
      return { ...prev, pieces };
    });
  }

  function handleStart() {
    startRef.current = Date.now();
    setStarted(true);
  }

  function handleRestart() {
    resetGame(photo, pieceLevel);
  }

  return (
    <div className="page">
      <div className="hud">
        <h2>Single Player</h2>
        <PhotoUploader previewUrl={photo?.url} onFile={handleFile} disabled={started && !completed} />
        <PieceLevelPicker selectedId={pieceLevel} onSelect={handleLevelChange} disabled={started && !completed} />
        {puzzle && (
          <PuzzlePreview imageUrl={puzzle.imageUrl} boardWidth={puzzle.boardWidth} boardHeight={puzzle.boardHeight} />
        )}
        {!puzzle && <p className="preview-label">Sube una foto para poder armar el rompecabezas.</p>}
        {puzzle && !started && <button onClick={handleStart}>Comenzar</button>}
        {started && <div className="timer">⏱ {formatTime(elapsed)}</div>}
        {completed && <div className="banner success">¡Completado en {formatTime(elapsed)}!</div>}
        {started && <button onClick={handleRestart}>Reiniciar</button>}
      </div>

      {puzzle && <PuzzleBoard puzzle={puzzle} interactive={started} onPieceDragEnd={handleDragEnd} />}

      {completed && showResultModal && (
        <Modal onClose={() => setShowResultModal(false)}>
          <h3>🎉 ¡Completado!</h3>
          <p>Tiempo: {formatTime(elapsed)}</p>
          <div className="modal-actions">
            <button onClick={handleRestart}>Reiniciar</button>
            <button className="modal-secondary" onClick={() => setShowResultModal(false)}>
              Ver tablero
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
