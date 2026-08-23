import { useEffect, useMemo, useRef, useState } from "react";
import PuzzleBoard from "../components/PuzzleBoard.jsx";
import PuzzlePreview from "../components/PuzzlePreview.jsx";
import ImagePicker from "../components/ImagePicker.jsx";
import { generatePuzzle, isNearCorrectPosition } from "../utils/puzzleGenerator.js";
import { formatTime } from "../utils/formatTime.js";
import { saveSinglePlayerResult } from "../supabaseClient.js";
import { DEFAULT_IMAGE, findImage } from "../imageCatalog.js";

function buildPuzzle(imageId) {
  const image = findImage(imageId);
  return generatePuzzle({
    rows: 8,
    cols: 8,
    imageUrl: image.src,
    imageWidth: image.width,
    imageHeight: image.height,
  });
}

export default function SinglePlayer() {
  const [selectedImageId, setSelectedImageId] = useState(DEFAULT_IMAGE.id);
  const [puzzle, setPuzzle] = useState(() => buildPuzzle(DEFAULT_IMAGE.id));
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [completed, setCompleted] = useState(false);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!started || completed) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [started, completed]);

  const allPlaced = useMemo(() => puzzle.pieces.every((p) => p.placed), [puzzle]);

  useEffect(() => {
    if (started && allPlaced && !completed) {
      setCompleted(true);
      const finalTime = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(finalTime);
      saveSinglePlayerResult({
        partidaId: `solo-${Date.now()}`,
        jugador1: "Jugador",
        tiempoSegundos: finalTime,
      });
    }
  }, [started, allPlaced, completed]);

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

  function handleSelectImage(imageId) {
    setSelectedImageId(imageId);
    setPuzzle(buildPuzzle(imageId));
    setElapsed(0);
    setCompleted(false);
    setStarted(false);
  }

  function handleStart() {
    startRef.current = Date.now();
    setStarted(true);
  }

  function handleRestart() {
    setPuzzle(buildPuzzle(selectedImageId));
    setElapsed(0);
    setCompleted(false);
    setStarted(false);
  }

  return (
    <div className="page">
      <div className="hud">
        <h2>Single Player</h2>
        <ImagePicker selectedId={selectedImageId} onSelect={handleSelectImage} disabled={started && !completed} />
        <PuzzlePreview imageUrl={puzzle.imageUrl} boardWidth={puzzle.boardWidth} boardHeight={puzzle.boardHeight} />
        {!started && <button onClick={handleStart}>Comenzar</button>}
        {started && <div className="timer">⏱ {formatTime(elapsed)}</div>}
        {completed && <div className="banner success">¡Completado en {formatTime(elapsed)}!</div>}
        {started && <button onClick={handleRestart}>Reiniciar</button>}
      </div>

      <PuzzleBoard puzzle={puzzle} interactive={started} onPieceDragEnd={handleDragEnd} />
    </div>
  );
}
