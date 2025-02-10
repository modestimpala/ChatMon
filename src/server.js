import express from "express";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { WebSocketManager } from "./services/WebSocketManager.js";
import { config } from "./config/default.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Initialize WebSocket Manager
const wsManager = new WebSocketManager(server);
wsManager.initialize();  

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// Handle all routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

server.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
