import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { whatsappService } from "./services/WhatsAppService.js";
import sessionRoutes from "./routes/session.js";
import validationRoutes from "./routes/validation.js";
import campaignRoutes from "./routes/campaign.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// Middleware — allow all origins (Vercel frontend, localhost, etc.)
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// API Routes
app.use("/api", sessionRoutes);
app.use("/api", validationRoutes);
app.use("/api", campaignRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", whatsapp: whatsappService.getStatus().status });
});

// Serve frontend static files if available (local unified server mode)
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  console.log(`[Server] Serving frontend from: ${frontendDist}`);
} else {
  console.log(`[Server] API-only mode (no frontend dist found)`);
}

// Start server (bind to 0.0.0.0 so Railway/Render can reach it)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Server] Running on port ${PORT}`);

  // Initialize WhatsApp client
  whatsappService.initialize().catch((err) => {
    console.error("[WhatsApp] Failed to initialize:", err);
  });
});

// Graceful shutdown
const shutdown = async () => {
  console.log("[Server] Shutting down...");
  await whatsappService.destroy();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
