import { IMAGE_CATALOG } from "../imageCatalog.js";

// Selector de miniaturas para elegir qué foto armar. Se usa en single player
// (antes de "Comenzar") y en el lobby de multiplayer (solo lo ve quien crea
// la sala; el que se une arma la foto que ya eligió el creador).
export default function ImagePicker({ selectedId, onSelect, disabled = false }) {
  return (
    <div className="image-picker">
      {IMAGE_CATALOG.map((img) => (
        <button
          key={img.id}
          type="button"
          className={`image-picker-item${img.id === selectedId ? " selected" : ""}`}
          onClick={() => onSelect(img.id)}
          disabled={disabled}
        >
          <img src={img.src} alt={img.label} />
        </button>
      ))}
    </div>
  );
}
