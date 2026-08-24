import { PIECE_LEVELS } from "../utils/pieceLevels.js";

// Selector de cantidad de piezas, siempre en múltiplos de 12 (Fácil 48 /
// Medio 96 / Difícil 192) — ver utils/pieceLevels.js.
export default function PieceLevelPicker({ selectedId, onSelect, disabled = false }) {
  return (
    <div className="piece-level-picker">
      {PIECE_LEVELS.map((level) => (
        <button
          key={level.id}
          type="button"
          className={`piece-level-item${level.id === selectedId ? " selected" : ""}`}
          onClick={() => onSelect(level.id)}
          disabled={disabled}
        >
          <span>{level.label}</span>
          <span className="piece-level-count">{level.count} piezas</span>
        </button>
      ))}
    </div>
  );
}
