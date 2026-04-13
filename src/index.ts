import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { whatsappSessions } from "./services/WhatsAppSessionManager.js";
import sessionRoutes from "./routes/session.js";
import validationRoutes from "./routes/validation.js";
import campaignRoutes from "./routes/campaign.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// Middleware — allow all origins
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// API Routes (all require auth, scoped to userId)
app.use("/api", sessionRoutes);
app.use("/api", validationRoutes);
app.use("/api", campaignRoutes);

// Health check (public — no auth)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", ...whatsappSessions.getStats() });
});

// Serve frontend static files if available (local unified server mode)
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  console.log(`[Server] Serving frontend from: ${frontendDist}`);
} else {
  console.log(`[Server] API-only mode (no frontend dist found)`);
}

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Multi-user mode (per-user WhatsApp sessions)`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log("[Server] Shutting down — destroying all sessions...");
  await whatsappSessions.destroyAll();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
