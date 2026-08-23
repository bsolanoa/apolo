import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import SinglePlayer from "./pages/SinglePlayer.jsx";
import Multiplayer from "./pages/Multiplayer.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <header className="topbar">
        <Link to="/" className="brand">🧩 Preciosa Puzzle</Link>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/single" element={<SinglePlayer />} />
        <Route path="/multiplayer" element={<Multiplayer />} />
      </Routes>
    </BrowserRouter>
  );
}
