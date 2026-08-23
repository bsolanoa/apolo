import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { BACKEND_URL } from "../config.js";

// Conexión de socket compartida por los componentes de multiplayer.
// Se crea una vez por montaje de la sala y se cierra al desmontar.
export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  // El id del socket se expone como estado (no solo socketRef.current.id):
  // así cualquier componente que lo use para comparar "es mío" vuelve a
  // renderizar en el momento exacto en que cambia (por ejemplo, tras una
  // reconexión), en vez de quedarse con un valor leído en un render viejo.
  const [socketId, setSocketId] = useState(null);

  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setSocketId(socket.id);
    });
    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.disconnect();
    };
  }, []);

  return { socketRef, connected, socketId };
}
