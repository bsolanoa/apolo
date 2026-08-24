// Restricciones para las fotos que suben los jugadores (reemplaza al
// catálogo fijo de 4 fotos). Duplicado en el frontend
// (frontend/src/utils/photoValidation.js) para dar feedback inmediato antes
// de subir el archivo — el server siempre revalida sobre los bytes reales.
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_SIZE_MB = 8;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MIN_DIMENSION = 300;
export const MAX_DIMENSION = 6000;
