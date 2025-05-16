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
    try {
      // Parse the message to check if it's JSON
      const parsedMessage = JSON.parse(message);
      console.log("Received:", parsedMessage);

      // Check if it's getSerialData or serialData
      if (parsedMessage.action === "getSerialData") {
        console.log(
          "Received getSerialData request, broadcasting to other clients"
        );
        // Broadcast the getSerialData request to all clients except the sender
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(message.toString());
          }
        });
      } else if (parsedMessage.serialData !== undefined) {
        console.log("Received serialData, forwarding to other clients");
        // Forward serialData to all clients except the sender
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(message.toString());
          }
        });
      } else {
        // Handle other JSON messages - broadcast to all including sender
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message.toString());
          }
        });
      }
    } catch (e) {
      // Not a JSON message, handle as plain text - broadcast to all including sender
      console.log(`Received plain text: ${message}`);

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message.toString());
        }
      });
    }
  });

  // Handle client disconnection
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
