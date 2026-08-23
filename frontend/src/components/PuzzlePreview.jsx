// Miniatura de referencia: muestra la imagen completa (sin recortar en
// piezas) para que los jugadores sepan qué van a armar. Usa el mismo
// aspect-ratio "estirado" que el tablero real (boardWidth x boardHeight)
// para que la previsualización coincida con el resultado final.
export default function PuzzlePreview({ imageUrl, boardWidth, boardHeight }) {
  return (
    <div className="preview">
      <span className="preview-label">Vista previa</span>
      <img
        src={imageUrl}
        alt="Vista previa del rompecabezas"
        style={{ aspectRatio: `${boardWidth} / ${boardHeight}` }}
      />
    </div>
  );
}
