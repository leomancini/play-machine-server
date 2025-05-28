import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.API_KEY) {
  console.error("API_KEY environment variable is not set");
  process.exit(1);
}

const app = express();
const wsPort = 3204;
const wssPort = 3103;

// Trust proxy since we're behind Apache
app.set("trust proxy", true);

// CORS middleware
app.use((req, res, next) => {
  // For debugging, allow all origins temporarily
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

const validateApiKey = (message) => {
  if (!message.apiKey) {
    console.warn("API key validation failed: No API key provided");
    throw new Error("API key is required");
  }
  if (message.apiKey !== process.env.API_KEY) {
    console.warn("API key validation failed: Invalid API key provided");
    throw new Error("Invalid API key");
  }
  return true;
};

app.get("/validate-api-key", (req, res) => {
  const apiKey = req.query.apiKey;

  if (!apiKey) {
    console.warn("API key validation failed: No API key provided");
    return res.status(400).json({ valid: false, error: "API key is required" });
  }

  const isValid = apiKey === process.env.API_KEY;
  if (!isValid) {
    console.warn("API key validation failed: Invalid API key provided");
  }
  return res.json({ valid: isValid });
});

const wsServer = createServer(app);
const ws = new WebSocketServer({ server: wsServer });

const wssServer = createServer(app);
const wss = new WebSocketServer({ server: wssServer });

const handleConnection = (ws) => {
  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);

      validateApiKey(parsedMessage);

      if (parsedMessage.serialData !== undefined) {
        const messageWithFlag = {
          ...parsedMessage,
          isFromSelf: true
        };
        ws.send(JSON.stringify(messageWithFlag));

        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(parsedMessage));
          }
        });
      } else {
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(parsedMessage));
          }
        });
      }
    } catch (e) {
      console.error("Error processing message:", e);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ error: e.message }));
      }
    }
  });
};

ws.on("connection", handleConnection);
wss.on("connection", handleConnection);

wsServer.listen(wsPort, () => {
  console.log(`WebSocket server running at ws://localhost:${wsPort}`);
});

wssServer.listen(wssPort, () => {
  console.log(
    `WebSocket server running at ws://localhost:${wssPort} (will be secured by Apache)`
  );
});
