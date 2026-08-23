import { useState } from "react";

// Chat simple entre los 2 jugadores de la sala. No persiste historial (se
// pierde al refrescar, igual que el resto del estado de la partida).
export default function ChatPanel({ messages, mySocketId, onSend }) {
  const [text, setText] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && <p className="chat-empty">Sin mensajes todavía</p>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-message${m.socketId === mySocketId ? " mine" : ""}`}>
            <span className="chat-author">{m.from}</span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          placeholder="Escribí un mensaje..."
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit">Enviar</button>
      </form>
    </div>
  );
}
