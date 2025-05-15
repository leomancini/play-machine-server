import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3103;
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(join(__dirname, "public")));

// Express route
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

// WebSocket connection handling
wss.on("connection", (ws) => {
  console.log("Client connected");

  // Handle incoming messages
  ws.on("message", (message) => {
    console.log(`Received: ${message}`);

    // Broadcast message to all clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(`${message}`);
      }
    });
  });

  // Handle client disconnection
  ws.on("close", () => {
    console.log("Client disconnected");
  });

  // Send welcome message to the client
  ws.send("Welcome to the WebSocket server!");
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
