import { useLayoutEffect, useRef } from "react";
import { Shape } from "react-konva";

// Pieza con recorte tipo jigsaw real: se dibuja el contorno con curvas
// Bézier (piece.outline) y se recorta la imagen completa sobre ese trazo.
//
// La posición NO se pasa como prop controlado x/y: en multiplayer, cada
// evento de socket (por ejemplo cuando el otro jugador toma una pieza)
// re-renderiza el tablero, y si x/y fueran props normales, React le
// reimpondría a Konva la posición "vieja" del estado mientras el usuario
// está arrastrando esta misma pieza — cortando el drag en seco (se sentía
// como si la pieza estuviera "trabada"). En cambio, la posición se
// sincroniza a mano vía ref, y se salta mientras hay un drag local en curso.
export default function PuzzlePiece({
  piece,
  image,
  boardOffsetX,
  boardOffsetY,
  boardWidth,
  boardHeight,
  stageWidth,
  stageHeight,
  isLockedByOther,
  isMine,
  draggable,
  onDragStart,
  onDragMove,
  onDragEnd,
}) {
  const shapeRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Sin este límite, un arrastre rápido puede soltar la pieza más allá del
  // lienzo (el Stage de Konva no lo impide solo): queda fuera de los píxeles
  // dibujados, invisible e inalcanzable con el mouse para siempre. `pos` acá
  // es el offset interno del Shape (piece.x - piece.correctX, ver el
  // useLayoutEffect de abajo), no la posición absoluta — por eso el margen
  // se calcula relativo a piece.correctX/Y. El margen extra (tabMargin)
  // deja lugar a que los "tabs" que sobresalen del rectángulo nominal de la
  // pieza no se corten contra el borde.
  function dragBoundFunc(pos) {
    const tabMargin = Math.max(piece.width, piece.height) * 0.4;
    const minX = -piece.correctX - tabMargin;
    const maxX = stageWidth - piece.width - piece.correctX + tabMargin;
    const minY = -piece.correctY - tabMargin;
    const maxY = stageHeight - piece.height - piece.correctY + tabMargin;
    return {
      x: Math.min(Math.max(pos.x, minX), maxX),
      y: Math.min(Math.max(pos.y, minY), maxY),
    };
  }

  useLayoutEffect(() => {
    if (isDraggingRef.current) return;
    shapeRef.current?.position({ x: piece.x - piece.correctX, y: piece.y - piece.correctY });
  }, [piece.x, piece.y, piece.correctX, piece.correctY]);

  function sceneFunc(context, shape) {
    const { start, edges } = piece.outline;
    context.beginPath();
    context.moveTo(start.x, start.y);
    for (const edge of edges) {
      if (edge.type === "line") {
        context.lineTo(edge.to.x, edge.to.y);
      } else {
        const p = edge.p;
        context.bezierCurveTo(p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y);
        context.bezierCurveTo(p[4].x, p[4].y, p[5].x, p[5].y, p[6].x, p[6].y);
        context.bezierCurveTo(p[7].x, p[7].y, p[8].x, p[8].y, p[9].x, p[9].y);
      }
    }
    context.closePath();

    if (image) {
      context.save();
      context.clip();
      context.drawImage(image, boardOffsetX, boardOffsetY, boardWidth, boardHeight);
      context.restore();
    }

    context.fillStrokeShape(shape);
  }

  return (
    <Shape
      ref={shapeRef}
      sceneFunc={sceneFunc}
      stroke={isMine ? "#2563eb" : isLockedByOther ? "#ef4444" : "rgba(15,23,42,0.4)"}
      strokeWidth={isMine || isLockedByOther ? 2.5 : 1}
      opacity={isLockedByOther ? 0.55 : 1}
      shadowColor="black"
      shadowBlur={isMine ? 14 : 5}
      shadowOffsetY={isMine ? 4 : 2}
      shadowOpacity={isMine ? 0.4 : 0.18}
      // Nunca se le quita draggable a una pieza mientras Konva la está
      // arrastrando de verdad (isDraggingRef): apagarlo a mitad de un drag
      // deja el drag interno de Konva en un estado corrupto y la pieza queda
      // "trabada" (no responde a nuevos intentos) aunque visualmente se vea
      // normal. Puede pasar si un evento de socket que llega en pleno drag
      // (por una reconexión, por ejemplo) recalcula isLockedByOther/placed
      // con un valor transitoriamente erróneo.
      draggable={isDraggingRef.current || (draggable && !isLockedByOther && !piece.placed)}
      dragBoundFunc={dragBoundFunc}
      onDragStart={() => {
        isDraggingRef.current = true;
        onDragStart?.(piece.id);
      }}
      onDragMove={(e) => onDragMove?.(piece.id, e.target.x() + piece.correctX, e.target.y() + piece.correctY)}
      onDragEnd={(e) => {
        isDraggingRef.current = false;
        onDragEnd?.(piece.id, e.target.x() + piece.correctX, e.target.y() + piece.correctY);
      }}
    />
  );
}
