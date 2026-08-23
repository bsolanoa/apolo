import { useEffect, useRef, useState } from "react";
import { MUSIC_CATALOG } from "../musicCatalog.js";

const VOLUME = 0.35;
const TRACK_STORAGE_KEY = "musicTrackId";
const PLAYING_STORAGE_KEY = "musicPlaying";

// Reproductor simple en el topbar: anterior/reproducir/siguiente + nombre
// del track. Arranca detenido por defecto (autoplay con sonido bloqueado
// por los navegadores) y recuerda el track y si estaba sonando.
export default function MusicPlayer() {
  const audioRef = useRef(null);
  const [trackId, setTrackId] = useState(
    () => MUSIC_CATALOG.find((t) => t.id === localStorage.getItem(TRACK_STORAGE_KEY))?.id ?? MUSIC_CATALOG[0].id
  );
  const [playing, setPlaying] = useState(() => localStorage.getItem(PLAYING_STORAGE_KEY) === "true");

  const index = MUSIC_CATALOG.findIndex((t) => t.id === trackId);
  const track = MUSIC_CATALOG[index] ?? MUSIC_CATALOG[0];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = VOLUME;
    localStorage.setItem(PLAYING_STORAGE_KEY, String(playing));
    if (playing) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [playing, trackId]);

  useEffect(() => {
    localStorage.setItem(TRACK_STORAGE_KEY, trackId);
  }, [trackId]);

  function go(offset) {
    const nextIndex = (index + offset + MUSIC_CATALOG.length) % MUSIC_CATALOG.length;
    setTrackId(MUSIC_CATALOG[nextIndex].id);
  }

  return (
    <div className="music-player">
      {/* key={trackId}: fuerza un <audio> nuevo por track. Sin esto, cambiar
          `src` en el mismo elemento puede interrumpir un play() en curso del
          track anterior (el navegador tira "play() request was interrupted"),
          el catch de más abajo apaga `playing`, y el siguiente track queda
          cargado pero mudo — se siente como que "Siguiente" no responde. */}
      <audio key={trackId} ref={audioRef} src={track.src} onEnded={() => go(1)} />
      <button type="button" className="music-btn" onClick={() => go(-1)} title="Anterior">
        ⏮
      </button>
      <button
        type="button"
        className="music-btn music-btn-play"
        onClick={() => setPlaying((p) => !p)}
        title={playing ? "Pausar" : "Reproducir"}
      >
        {playing ? "⏸️" : "▶️"}
      </button>
      <button type="button" className="music-btn" onClick={() => go(1)} title="Siguiente">
        ⏭
      </button>
      <span className="music-track-name">{track.title}</span>
    </div>
  );
}
