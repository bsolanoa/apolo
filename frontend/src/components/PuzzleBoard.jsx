import { useCallback, useState } from "react";
import { Stage, Layer, Rect } from "react-konva";
import useImage from "use-image";
import PuzzlePiece from "./PuzzlePiece.jsx";

// Tablero genérico reutilizado por single player y multiplayer.
// `lockedPieces`: Map<pieceId, socketId-del-que-la-tiene> (vacío en single player).
export default function PuzzleBoard({
  puzzle,
  lockedPieces = new Map(),
  mySocketId = null,
  interactive = true,
  onPieceDragStart,
  onPieceDragMove,
  onPieceDragEnd,
}) {
  const [image] = useImage(puzzle.imageUrl, "anonymous");

  // Orden en que se "tocó" cada pieza por última vez, para desempatar el
  // z-order entre piezas sueltas superpuestas (la última tocada queda arriba,
  // así se puede "destapar" la que quedó debajo, como en un rompecabezas real).
  const [recentOrder, setRecentOrder] = useState([]);

  const bringToFront = useCallback((pieceId) => {
    setRecentOrder((prev) => [...prev.filter((id) => id !== pieceId), pieceId]);
  }, []);

  const handleDragStart = useCallback(
    (pieceId) => {
      bringToFront(pieceId);
      onPieceDragStart?.(pieceId);
    },
    [bringToFront, onPieceDragStart]
  );

  // Orden de dibujo: piezas ya colocadas van al fondo, piezas actualmente
  // tomadas por alguien siempre arriba de todo, y entre el resto gana la
  // última tocada.
  const orderedPieces = [...puzzle.pieces].sort((a, b) => {
    const rankOf = (p) => (p.placed ? 0 : lockedPieces.has(p.id) ? 2 : 1);
    const rankDiff = rankOf(a) - rankOf(b);
    if (rankDiff !== 0) return rankDiff;
    return recentOrder.indexOf(a.id) - recentOrder.indexOf(b.id);
  });

  return (
    <Stage width={puzzle.stageWidth} height={puzzle.stageHeight}>
      <Layer>
        {/* Contorno del tablero destino */}
        <Rect
          x={puzzle.boardOffsetX}
          y={puzzle.boardOffsetY}
          width={puzzle.boardWidth}
          height={puzzle.boardHeight}
          stroke="#94a3b8"
          dash={[6, 4]}
          fill="#f8fafc"
        />

        {image &&
          orderedPieces.map((piece) => {
            const lockedBy = lockedPieces.get(piece.id);
            return (
              <PuzzlePiece
                key={piece.id}
                piece={piece}
                image={image}
                boardOffsetX={puzzle.boardOffsetX}
                boardOffsetY={puzzle.boardOffsetY}
                boardWidth={puzzle.boardWidth}
                boardHeight={puzzle.boardHeight}
                draggable={interactive}
                isMine={Boolean(lockedBy) && lockedBy === mySocketId}
                isLockedByOther={Boolean(lockedBy) && lockedBy !== mySocketId}
                onDragStart={handleDragStart}
                onDragMove={onPieceDragMove}
                onDragEnd={onPieceDragEnd}
              />
            );
          })}
      </Layer>
    </Stage>
  );
}
