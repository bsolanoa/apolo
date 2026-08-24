import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./socketHandlers.js";
import { uploadMiddleware, handleUpload, uploadErrorHandler } from "./upload.js";

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

const app = express();
app.use(cors({ origin: CLIENT_ORIGINS }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/api/upload", uploadMiddleware, handleUpload, uploadErrorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGINS },
});

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`[server] escuchando en puerto ${PORT}`);
});
