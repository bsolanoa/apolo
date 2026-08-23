import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import SinglePlayer from "./pages/SinglePlayer.jsx";
import Multiplayer from "./pages/Multiplayer.jsx";

const MUSIC_SRC = "/music.m4a";
const MUSIC_VOLUME = 0.35;
const MUTE_STORAGE_KEY = "musicMuted";

export default function App() {
  const audioRef = useRef(null);
  // Arranca silenciada por defecto: los navegadores bloquean el autoplay con
  // sonido sin gesto del usuario. El botón de silenciar es ese gesto.
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_STORAGE_KEY) !== "false");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = MUSIC_VOLUME;
    audio.muted = muted;
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
    if (!muted) audio.play().catch(() => {});
  }, [muted]);

  return (
    <BrowserRouter>
      <audio ref={audioRef} src={MUSIC_SRC} loop autoPlay muted={muted} />
      <header className="topbar">
        <Link to="/" className="brand">🧩 Preciosa Puzzle</Link>
        <button
          type="button"
          className="music-toggle"
          onClick={() => setMuted((m) => !m)}
          title={muted ? "Activar música" : "Silenciar música"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/single" element={<SinglePlayer />} />
        <Route path="/multiplayer" element={<Multiplayer />} />
      </Routes>
    </BrowserRouter>
  );
}
