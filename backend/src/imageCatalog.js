// Catálogo de fotos disponibles para armar. Duplicado del frontend
// (frontend/src/imageCatalog.js) porque el server no sirve estos archivos
// estáticos (viven en frontend/public/) y necesita igual el width/height de
// cada una para calcular las dimensiones del tablero — mismo patrón de
// duplicación que puzzleUtils.js / puzzleGenerator.js (ver CLAUDE.md).
export const IMAGE_CATALOG = [
  { id: "foto1", src: "/foto1.jpg", width: 1200, height: 840 },
  { id: "foto2", src: "/foto2.jpg", width: 1121, height: 1400 },
  { id: "foto3", src: "/foto3.jpg", width: 1149, height: 1400 },
  { id: "foto4", src: "/foto4.jpg", width: 1045, height: 1400 },
];

export const DEFAULT_IMAGE = IMAGE_CATALOG[0];

export function findImage(id) {
  return IMAGE_CATALOG.find((img) => img.id === id) || DEFAULT_IMAGE;
}
