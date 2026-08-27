import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import SinglePlayer from "./pages/SinglePlayer.jsx";
import Multiplayer from "./pages/Multiplayer.jsx";
import MusicPlayer from "./components/MusicPlayer.jsx";
import { APP_VERSION } from "./version.js";

export default function App() {
  return (
    <BrowserRouter>
      <header className="topbar">
        <Link to="/" className="brand">
          🧩 Jupiter Puzzle <span className="version-tag">v{APP_VERSION}</span>
        </Link>
        <MusicPlayer />
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/single" element={<SinglePlayer />} />
        <Route path="/multiplayer" element={<Multiplayer />} />
      </Routes>
    </BrowserRouter>
  );
}
