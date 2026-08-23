// Genera piezas de rompecabezas con recorte tipo jigsaw real (tabs/blancos
// que encastran entre piezas vecinas), no rectángulos simples.
//
// Cada borde interior de la grilla se dibuja una sola vez como una curva
// Bézier de 3 tramos (aproximación -> protuberancia redondeada -> retorno),
// y las dos piezas que lo comparten reutilizan los MISMOS puntos absolutos
// recorriéndolos en direcciones opuestas — así encastran perfectamente
// aunque cada pieza se renderice de forma independiente.

// Proporción 856x600 (~1.43:1) elegida para calzar con el aspect ratio de
// foto1.jpg (1200x840) sin estirarla de forma notoria, y ser divisible
// limpiamente por una grilla de 8x6 = 48 piezas.
const BOARD_WIDTH = 856;
const BOARD_HEIGHT = 600;
const SNAP_THRESHOLD = 22; // px de tolerancia para considerar una pieza "bien puesta"

function uniform(min, max) {
  return min + Math.random() * (max - min);
}

// 10 puntos (p0..p9) de un borde con tab/blank, en coordenadas locales del
// borde: `l` = a lo largo (0..len), `w` = perpendicular (0 = plano).
// p0..p9 se agrupan como: p0 (inicio) + 3 curvas cúbicas (p1,p2,p3) (p4,p5,p6) (p7,p8,p9).
function buildKnob(len, transverse) {
  const dir = Math.random() < 0.5 ? 1 : -1;
  // Tab clásico de rompecabezas infantil (botón redondo sobre un cuello
  // angosto, como en sources/ejemplo.png): cuello bien fino, cabeza grande
  // y circular, tamaño uniforme (poco jitter).
  const depth = transverse * uniform(0.27, 0.31) * dir;
  const center = len * uniform(0.48, 0.52);
  const neck = len * uniform(0.075, 0.095);

  return [
    { l: 0, w: 0 },
    { l: center - neck * 2.4, w: 0 },
    { l: center - neck * 1.5, w: depth * 0.05 },
    { l: center - neck * 0.85, w: depth * 0.55 },
    { l: center - neck * 1.45, w: depth * 1.32 },
    { l: center + neck * 1.45, w: depth * 1.32 },
    { l: center + neck * 0.85, w: depth * 0.55 },
    { l: center + neck * 1.5, w: depth * 0.05 },
    { l: center + neck * 2.4, w: 0 },
    { l: len, w: 0 },
  ];
}

function buildEdgeGrids({ rows, cols, boardWidth, boardHeight, boardOffsetX, boardOffsetY }) {
  const pw = boardWidth / cols;
  const ph = boardHeight / rows;

  // horizontalEdges[r][c]: borde compartido entre pieza(r-1,c) y pieza(r,c)
  const horizontalEdges = [];
  for (let r = 1; r < rows; r++) {
    horizontalEdges[r] = [];
    for (let c = 0; c < cols; c++) {
      horizontalEdges[r][c] = buildKnob(pw, ph).map((p) => ({
        x: boardOffsetX + c * pw + p.l,
        y: boardOffsetY + r * ph + p.w,
      }));
    }
  }

  // verticalEdges[c][r]: borde compartido entre pieza(r,c-1) y pieza(r,c)
  const verticalEdges = [];
  for (let c = 1; c < cols; c++) {
    verticalEdges[c] = [];
    for (let r = 0; r < rows; r++) {
      verticalEdges[c][r] = buildKnob(ph, pw).map((p) => ({
        x: boardOffsetX + c * pw + p.w,
        y: boardOffsetY + r * ph + p.l,
      }));
    }
  }

  return { horizontalEdges, verticalEdges, pw, ph };
}

function assemblePieces({ rows, cols, boardOffsetX, boardOffsetY, horizontalEdges, verticalEdges, pw, ph }) {
  const reversed = (pts) => pts.slice().reverse();
  const curveEdge = (pts) => ({ type: "curve", p: pts });
  const pieces = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = boardOffsetX + col * pw;
      const y0 = boardOffsetY + row * ph;
      const x1 = boardOffsetX + (col + 1) * pw;
      const y1 = boardOffsetY + (row + 1) * ph;

      const top = row === 0 ? { type: "line", to: { x: x1, y: y0 } } : curveEdge(horizontalEdges[row][col]);
      const right =
        col === cols - 1 ? { type: "line", to: { x: x1, y: y1 } } : curveEdge(verticalEdges[col + 1][row]);
      const bottom =
        row === rows - 1
          ? { type: "line", to: { x: x0, y: y1 } }
          : curveEdge(reversed(horizontalEdges[row + 1][col]));
      const left = col === 0 ? { type: "line", to: { x: x0, y: y0 } } : curveEdge(reversed(verticalEdges[col][row]));

      pieces.push({
        row,
        col,
        width: pw,
        height: ph,
        correctX: x0,
        correctY: y0,
        outline: { start: { x: x0, y: y0 }, edges: [top, right, bottom, left] },
      });
    }
  }

  return pieces;
}

function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Dispersa cada pieza en una de las 4 franjas alrededor del tablero (arriba,
// abajo, izquierda, derecha). Se permite que las piezas se superpongan entre
// sí dentro de una franja — es lo esperado en un rompecabezas real: para
// llegar a una pieza tapada hay que primero mover la que está encima.
function scatterPieces(pieces, { stageWidth, stageHeight, boardOffsetX, boardOffsetY, boardWidth, boardHeight }) {
  const zones = [
    { x: [0, stageWidth], y: [0, boardOffsetY] }, // arriba
    { x: [0, stageWidth], y: [boardOffsetY + boardHeight, stageHeight] }, // abajo
    { x: [0, boardOffsetX], y: [0, stageHeight] }, // izquierda
    { x: [boardOffsetX + boardWidth, stageWidth], y: [0, stageHeight] }, // derecha
  ];

  const order = shuffle(pieces.map((_, i) => i));
  order.forEach((pieceIndex, i) => {
    const zone = zones[i % zones.length];
    const piece = pieces[pieceIndex];
    const maxX = Math.max(zone.x[0], zone.x[1] - piece.width);
    const maxY = Math.max(zone.y[0], zone.y[1] - piece.height);
    piece.x = uniform(zone.x[0], maxX);
    piece.y = uniform(zone.y[0], maxY);
  });
}

export function generatePuzzle({ rows = 4, cols = 4, imageUrl }) {
  const pw = BOARD_WIDTH / cols;
  const ph = BOARD_HEIGHT / rows;
  const margin = Math.max(220, pw * 0.75, ph * 0.75);
  const boardOffsetX = margin;
  const boardOffsetY = margin;
  const stageWidth = BOARD_WIDTH + margin * 2;
  const stageHeight = BOARD_HEIGHT + margin * 2;

  const { horizontalEdges, verticalEdges } = buildEdgeGrids({
    rows,
    cols,
    boardWidth: BOARD_WIDTH,
    boardHeight: BOARD_HEIGHT,
    boardOffsetX,
    boardOffsetY,
  });

  const pieces = assemblePieces({
    rows,
    cols,
    boardOffsetX,
    boardOffsetY,
    horizontalEdges,
    verticalEdges,
    pw,
    ph,
  });

  pieces.forEach((piece, i) => {
    piece.id = `p${i}`;
    piece.placed = false;
    piece.locked = false;
    piece.lockedBy = null;
  });

  scatterPieces(pieces, {
    stageWidth,
    stageHeight,
    boardOffsetX,
    boardOffsetY,
    boardWidth: BOARD_WIDTH,
    boardHeight: BOARD_HEIGHT,
  });

  return {
    imageUrl,
    rows,
    cols,
    boardWidth: BOARD_WIDTH,
    boardHeight: BOARD_HEIGHT,
    boardOffsetX,
    boardOffsetY,
    stageWidth,
    stageHeight,
    pieceWidth: pw,
    pieceHeight: ph,
    pieces,
  };
}

export function isNearCorrectPosition(piece, x, y) {
  return (
    Math.abs(x - piece.correctX) <= SNAP_THRESHOLD && Math.abs(y - piece.correctY) <= SNAP_THRESHOLD
  );
}

export { SNAP_THRESHOLD };
