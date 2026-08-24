import { useRef, useState } from "react";
import { validateFile, MAX_FILE_SIZE_MB, MIN_DIMENSION, MAX_DIMENSION } from "../utils/photoValidation.js";

// Reemplaza al viejo selector de catálogo (ImagePicker): ahora la foto la
// sube el jugador. `onFile` recibe el File ya validado en formato/peso y
// hace lo que corresponda (single player: leerla local; multiplayer: además
// subirla al backend) — acá solo se maneja el input, la vista previa y los
// mensajes de error.
export default function PhotoUploader({ previewUrl, busyLabel, onFile, disabled }) {
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;

    const fileError = validateFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await onFile(file);
    } catch (err) {
      setError(err.message || "No se pudo procesar la imagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="photo-uploader">
      {previewUrl && <img src={previewUrl} alt="Foto elegida" className="photo-uploader-preview" />}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || busy}>
        {busy ? busyLabel || "Procesando..." : previewUrl ? "Cambiar foto" : "Subir foto"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        style={{ display: "none" }}
      />
      {error && <p className="photo-uploader-error">{error}</p>}
      <p className="photo-uploader-hint">
        JPG, PNG o WEBP · máx {MAX_FILE_SIZE_MB}MB · entre {MIN_DIMENSION} y {MAX_DIMENSION}px de lado
      </p>
    </div>
  );
}
