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

app.set("trust proxy", true);

app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Forwarded-Proto",
      "X-Forwarded-Ssl"
    ],
    exposedHeaders: ["Access-Control-Allow-Origin"]
  })
);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  if (req.headers.origin) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  }
  console.log("Incoming request:", {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    url: req.url,
    headers: req.headers
  });
  next();
});

const validateApiKey = (message) => {
  if (!message.apiKey) {
    throw new Error("API key is required");
  }
  if (message.apiKey !== process.env.API_KEY) {
    throw new Error("Invalid API key");
  }
  return true;
};

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

app.get("/api/validate-api-key", (req, res) => {
  console.log("API Key validation request:", {
    path: req.path,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    url: req.url,
    query: req.query
  });

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

app.use((req, res) => {
  console.log("Unhandled request:", {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    url: req.url
  });
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});
