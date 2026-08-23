// Misma lógica que el backend (backend/src/puzzleUtils.js), pero corre 100%
// en el cliente para el modo single player (no necesita el server).
//
// Genera piezas con recorte tipo jigsaw real (tabs/blancos que encastran
// entre piezas vecinas) y las dispersa alrededor del tablero permitiendo
// superposición, como en un rompecabezas real.

// El tablero mantiene siempre la misma área aproximada (la de la proporción
// original 856x600, elegida para foto1.jpg) pero adapta ancho/alto al aspect
// ratio de la foto elegida, para no estirarla — ver imageCatalog.js. La
// grilla queda fija en 8x8 = 64 piezas para cualquier foto.
const BOARD_AREA = 856 * 600;
const DEFAULT_ASPECT = 856 / 600;
export const SNAP_THRESHOLD = 22;

function boardDimsForAspect(aspect = DEFAULT_ASPECT) {
  const width = Math.sqrt(BOARD_AREA * aspect);
  const height = BOARD_AREA / width;
  return { width, height };
}

function uniform(min, max) {
  return min + Math.random() * (max - min);
}

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

function scatterPieces(pieces, { stageWidth, stageHeight, boardOffsetX, boardOffsetY, boardWidth, boardHeight }) {
  const zones = [
    { x: [0, stageWidth], y: [0, boardOffsetY] },
    { x: [0, stageWidth], y: [boardOffsetY + boardHeight, stageHeight] },
    { x: [0, boardOffsetX], y: [0, stageHeight] },
    { x: [boardOffsetX + boardWidth, stageWidth], y: [0, stageHeight] },
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

export function generatePuzzle({ rows = 8, cols = 8, imageUrl, imageWidth, imageHeight }) {
  const aspect = imageWidth && imageHeight ? imageWidth / imageHeight : DEFAULT_ASPECT;
  const { width: BOARD_WIDTH, height: BOARD_HEIGHT } = boardDimsForAspect(aspect);

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
