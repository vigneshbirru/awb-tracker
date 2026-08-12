require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const { getAllAwbStatuses, getAnalysisSummary } = require("./cache");
const { startWorker } = require("./worker");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_ORIGIN || "*" },
});

// --- REST: paginated snapshot for initial table load / reconnects ---
app.get("/api/awbs", async (req, res) => {
  try {
    const { cursor = "0", count = 200 } = req.query;
    const result = await getAllAwbStatuses({ cursor, count: Number(count) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- REST: current analysis summary ---
app.get("/api/analysis", async (req, res) => {
  try {
    const summary = await getAnalysisSummary();
    res.json(summary || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

io.on("connection", (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`[socket] client disconnected: ${socket.id}`));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
  startWorker(io).catch((err) => {
    console.error("[worker] fatal error, worker stopped:", err);
  });
});
