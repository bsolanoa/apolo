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
    return "Formato no soportado — usa JPG, PNG o WEBP.";
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

// El tablero nunca necesita más de ~1600px de lado (ni pensando en pantallas
// retina) — dejar pasar fotos de hasta 6000px sin tocar significa que cada
// pieza tiene que decodificar/recortar esa imagen gigante como textura, lo
// que en tablets se nota mucho (además del peso extra al subir la foto para
// el resto de la sala en multiplayer). Si la foto ya entra, se deja como
// está para no perder calidad ni recomprimir gratis.
const MAX_PUZZLE_DIMENSION = 1600;

// No se reduce el lado corto por debajo de MIN_DIMENSION: una foto muy
// panorámica (ej. 6000x300) podría terminar rechazada por el backend
// después de reescalar si se dejara encoger libremente los dos lados.
function resizeScale(width, height) {
  const longSide = Math.max(width, height);
  if (longSide <= MAX_PUZZLE_DIMENSION) return 1;
  const shortSide = Math.min(width, height);
  const desired = MAX_PUZZLE_DIMENSION / longSide;
  const minToStayValid = MIN_DIMENSION / shortSide;
  return Math.max(desired, minToStayValid);
}

// Reescala vía canvas si hace falta; si la foto ya entra en el máximo,
// devuelve el mismo file/url sin reprocesar.
export function shrinkForPuzzle(file, width, height, url) {
  const scale = resizeScale(width, height);
  if (scale >= 1) return Promise.resolve({ file, width, height, url });

  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.getContext("2d").drawImage(img, 0, 0, targetWidth, targetHeight);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("No se pudo procesar la imagen."));
            return;
          }
          resolve({
            file: new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }),
            width: targetWidth,
            height: targetHeight,
            url: URL.createObjectURL(blob),
          });
        },
        "image/jpeg",
        0.9
      );
    };
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = url;
  });
}
