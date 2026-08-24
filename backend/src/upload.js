import multer from "multer";
import { imageSize } from "image-size";
import { supabase } from "./supabaseClient.js";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MIN_DIMENSION,
  MAX_DIMENSION,
} from "./photoLimits.js";

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// `image-size` detecta el formato mirando los primeros bytes del buffer,
// sin importar el mimetype declarado por el cliente — y tiene parsers de
// otros formatos (ICNS/JXL/HEIF) vulnerables a DoS por loop infinito
// (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq, sin fix disponible). Por eso
// se valida la firma real del archivo acá mismo, restringida a JPEG/PNG/WEBP,
// antes de pasarle el buffer: así nunca llega a esos parsers un archivo con
// una firma distinta, sea cual sea el mimetype que haya mandado el cliente.
function matchesAllowedSignature(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true; // JPEG
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true; // PNG
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return true; // WEBP
  }
  return false;
}

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error("UNSUPPORTED_FORMAT"));
      return;
    }
    cb(null, true);
  },
});

export const uploadMiddleware = multerUpload.single("photo");

// La foto de un jugador se sube acá (no llega por Socket.io): así el server
// puede medir el ancho/alto real de los bytes recibidos con `image-size` en
// vez de confiar en lo que reporte el cliente, y guardarla en Supabase
// Storage para que el otro jugador de la sala pueda cargarla también.
export async function handleUpload(req, res) {
  if (!req.file) {
    res.status(400).json({ ok: false, error: "NO_FILE" });
    return;
  }

  if (!matchesAllowedSignature(req.file.buffer)) {
    res.status(400).json({ ok: false, error: "UNSUPPORTED_FORMAT" });
    return;
  }

  let dims;
  try {
    dims = imageSize(req.file.buffer);
  } catch {
    res.status(400).json({ ok: false, error: "INVALID_IMAGE" });
    return;
  }

  if (dims.width < MIN_DIMENSION || dims.height < MIN_DIMENSION) {
    res.status(400).json({ ok: false, error: "TOO_SMALL" });
    return;
  }
  if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
    res.status(400).json({ ok: false, error: "TOO_LARGE" });
    return;
  }

  if (!supabase) {
    res.status(503).json({ ok: false, error: "STORAGE_NOT_CONFIGURED" });
    return;
  }

  const ext = EXT_BY_MIME[req.file.mimetype] || "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("puzzle-photos")
    .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

  if (uploadError) {
    console.error("[upload] error subiendo a storage:", uploadError.message);
    res.status(502).json({ ok: false, error: "STORAGE_ERROR" });
    return;
  }

  const { data } = supabase.storage.from("puzzle-photos").getPublicUrl(path);

  res.json({ ok: true, url: data.publicUrl, width: dims.width, height: dims.height });
}

export function uploadErrorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ ok: false, error: "FILE_TOO_LARGE" });
    return;
  }
  if (err?.message === "UNSUPPORTED_FORMAT") {
    res.status(400).json({ ok: false, error: "UNSUPPORTED_FORMAT" });
    return;
  }
  console.error("[upload] error:", err);
  res.status(500).json({ ok: false, error: "UPLOAD_FAILED" });
}
