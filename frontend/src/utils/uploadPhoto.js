import { BACKEND_URL } from "../config.js";

// Sube la foto al backend (POST /api/upload, ver backend/src/upload.js),
// que la valida sobre los bytes reales y la guarda en Supabase Storage.
// Se usa solo en multiplayer: el otro jugador de la sala necesita poder
// cargar la misma foto, así que no alcanza con una object URL local.
export async function uploadPhoto(file) {
  const formData = new FormData();
  formData.append("photo", file);

  const res = await fetch(`${BACKEND_URL}/api/upload`, { method: "POST", body: formData });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(uploadErrorMessage(data?.error));
  }

  return { url: data.url, width: data.width, height: data.height };
}

function uploadErrorMessage(code) {
  switch (code) {
    case "UNSUPPORTED_FORMAT":
      return "Formato no soportado — usá JPG, PNG o WEBP.";
    case "FILE_TOO_LARGE":
      return "El archivo es demasiado pesado.";
    case "TOO_SMALL":
      return "La imagen es demasiado chica.";
    case "TOO_LARGE":
      return "La imagen es demasiado grande.";
    default:
      return "No se pudo subir la foto.";
  }
}
