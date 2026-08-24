// Niveles de dificultad disponibles para armar el rompecabezas, siempre en
// múltiplos de 12 (a pedido: el corte de piezas debe ser en múltiplos de 12).
// Duplicado en el frontend (frontend/src/utils/pieceLevels.js) siguiendo el
// mismo patrón de duplicación que imageCatalog.js / puzzleUtils.js: el
// cliente manda un `level` (id), nunca la cantidad de piezas directamente —
// el server resuelve contra esta misma tabla, así la cantidad de piezas
// (y por lo tanto la grilla del tablero) siempre la decide el backend.
export const PIECE_LEVELS = [
  { id: "facil", label: "Fácil", count: 48 },
  { id: "medio", label: "Medio", count: 96 },
  { id: "dificil", label: "Difícil", count: 192 },
];

export const DEFAULT_PIECE_LEVEL = PIECE_LEVELS[1];

export function findPieceLevel(id) {
  return PIECE_LEVELS.find((level) => level.id === id) || DEFAULT_PIECE_LEVEL;
}

// Busca, entre los divisores de `count`, el par filas x columnas cuyo aspect
// ratio (cols/rows) más se acerca al aspect ratio de la foto — así la pieza
// queda lo más cuadrada posible sin importar si la foto es horizontal o
// vertical, igual que antes con la grilla fija de 8x8.
export function gridForPieceCount(count, aspect = 1) {
  let best = null;
  for (let rows = 1; rows <= count; rows++) {
    if (count % rows !== 0) continue;
    const cols = count / rows;
    const diff = Math.abs(Math.log(cols / rows) - Math.log(aspect));
    if (!best || diff < best.diff) best = { rows, cols, diff };
  }
  return { rows: best.rows, cols: best.cols };
}
