// Overlay genérico centrado, con fondo oscurecido detrás. Clic afuera del
// contenido (o el botón ×) cierra el modal si se pasa `onClose`; clic
// adentro no propaga para no cerrarlo por accidente al interactuar con lo
// que haya dentro.
export default function Modal({ onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {onClose && (
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
