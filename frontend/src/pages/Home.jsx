import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="page home">
      <h1>Jupiter Puzzle</h1>
      <div className="mode-cards">
        <Link className="mode-card" to="/single">
          <h2>Single Player</h2>
          <p>Arma el rompecabezas solo y mide tu tiempo.</p>
        </Link>
        <Link className="mode-card" to="/multiplayer">
          <h2>Multiplayer (2 jugadores)</h2>
          <p>Crea o únete a una sala y armen el rompecabezas juntos en tiempo real.</p>
        </Link>
      </div>
    </div>
  );
}
