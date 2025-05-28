import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

if (!process.env.API_KEY) {
  process.exit(1);
}

const app = express();
const httpPort = 3205;
const wsPort = 3204;
const wssPort = 3103;

app.use(cors());
app.use(express.json());

// Add URL normalization middleware
app.use((req, res, next) => {
  req.url = req.url.replace(/\/+/g, "/");
  next();
});

app.get("/api/validate-api-key", (req, res) => {
  const apiKey = req.query.apiKey;
  if (!apiKey) {
    return res.status(400).json({ valid: false, error: "API key is required" });
  }
  const isValid = apiKey === process.env.API_KEY;
  return res.json({ valid: isValid });
});

const httpServer = createServer(app);
const wsServer = createServer();
const wssServer = createServer();

const ws = new WebSocketServer({ server: wsServer });
const wss = new WebSocketServer({ server: wssServer });

const handleConnection = (ws) => {
  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);

      if (parsedMessage.apiKey !== process.env.API_KEY) {
        throw new Error("Invalid API key");
      }

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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ error: e.message }));
      }
    }
  });
};

ws.on("connection", handleConnection);
wss.on("connection", handleConnection);

httpServer.listen(httpPort, () => {
  console.log(`HTTP server running at http://localhost:${httpPort}`);
});
wsServer.listen(wsPort, () => {
  console.log(`WebSocket server running at ws://localhost:${wsPort}`);
});
wssServer.listen(wssPort, () => {
  console.log(
    `WebSocket server running at ws://localhost:${wssPort} (will be secured by Apache)`
  );
});
