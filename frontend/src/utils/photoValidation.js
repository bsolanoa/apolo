// Restricciones para la foto que sube el jugador (reemplaza al catálogo fijo
// de 4 fotos). Valida rápido en el cliente para dar feedback inmediato; el
// backend (backend/src/photoLimits.js, mismos valores) siempre revalida
// sobre los bytes reales antes de guardar nada.
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_SIZE_MB = 8;
export const MIN_DIMENSION = 300;
export const MAX_DIMENSION = 6000;

export function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Formato no soportado — usá JPG, PNG o WEBP.";
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `El archivo pesa más de ${MAX_FILE_SIZE_MB}MB.`;
  }
  return null;
}

export function validateDimensions(width, height) {
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return `La imagen debe medir al menos ${MIN_DIMENSION}x${MIN_DIMENSION}px.`;
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return `La imagen no puede superar los ${MAX_DIMENSION}x${MAX_DIMENSION}px.`;
  }
  return null;
}

// Lee dimensiones y genera una object URL local — usado tanto para mostrar
// una vista previa instantánea como (en single player) para jugar directo
// sin pasar por el backend.
export function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}
