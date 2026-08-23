import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import SinglePlayer from "./pages/SinglePlayer.jsx";
import Multiplayer from "./pages/Multiplayer.jsx";

const MUSIC_SRC = "/music.m4a";
const MUSIC_VOLUME = 0.35;
const PLAYING_STORAGE_KEY = "musicPlaying";

export default function App() {
  const audioRef = useRef(null);
  // Arranca detenida por defecto: los navegadores bloquean el autoplay con
  // sonido sin gesto del usuario, así que el primer play siempre lo dispara
  // el botón. Playing/paused real (no solo mute), y se recuerda entre visitas.
  const [playing, setPlaying] = useState(() => localStorage.getItem(PLAYING_STORAGE_KEY) === "true");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = MUSIC_VOLUME;
    localStorage.setItem(PLAYING_STORAGE_KEY, String(playing));
    if (playing) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [playing]);

  return (
    <BrowserRouter>
      <audio ref={audioRef} src={MUSIC_SRC} loop />
      <header className="topbar">
        <Link to="/" className="brand">🧩 Preciosa Puzzle</Link>
        <button
          type="button"
          className="music-toggle"
          onClick={() => setPlaying((p) => !p)}
          title={playing ? "Detener música" : "Reproducir música"}
        >
          {playing ? "⏹️" : "▶️"}
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
