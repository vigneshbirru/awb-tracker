require("dotenv").config();
const fs = require("fs");
const path = require("path");
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

// Serve the built frontend (same image / same origin) when present.
const frontendDist = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io")) {
      return next();
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

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
