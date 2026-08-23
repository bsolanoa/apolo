import { useEffect, useMemo, useRef, useState } from "react";
import PuzzleBoard from "../components/PuzzleBoard.jsx";
import PuzzlePreview from "../components/PuzzlePreview.jsx";
import { generatePuzzle, isNearCorrectPosition } from "../utils/puzzleGenerator.js";
import { formatTime } from "../utils/formatTime.js";
import { saveSinglePlayerResult } from "../supabaseClient.js";

const DEFAULT_IMAGE = "/foto1.jpg";

export default function SinglePlayer() {
  const [puzzle, setPuzzle] = useState(() => generatePuzzle({ rows: 6, cols: 8, imageUrl: DEFAULT_IMAGE }));
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

  function handleStart() {
    startRef.current = Date.now();
    setStarted(true);
  }

  function handleRestart() {
    setPuzzle(generatePuzzle({ rows: 6, cols: 8, imageUrl: DEFAULT_IMAGE }));
    setElapsed(0);
    setCompleted(false);
    setStarted(false);
  }

  return (
    <div className="page">
      <div className="hud">
        <h2>Single Player</h2>
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
