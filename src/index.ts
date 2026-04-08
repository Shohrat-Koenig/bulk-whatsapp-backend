import express from "express";
import cors from "cors";
import { whatsappService } from "./services/WhatsAppService.js";
import sessionRoutes from "./routes/session.js";
import validationRoutes from "./routes/validation.js";
import campaignRoutes from "./routes/campaign.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Middleware
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api", sessionRoutes);
app.use("/api", validationRoutes);
app.use("/api", campaignRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", whatsapp: whatsappService.getStatus().status });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] CORS origin: ${FRONTEND_URL}`);

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
