import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import cors from "cors";

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

// Debug middleware to log all request details
app.use((req, res, next) => {
  console.log("=== Request Details ===");
  console.log("URL:", req.url);
  console.log("Method:", req.method);
  console.log("Headers:", req.headers);
  console.log("Origin:", req.headers.origin);
  console.log("=====================");
  next();
});

// CORS configuration - must be first middleware after debug logging
app.use(
  cors({
    origin: function (origin, callback) {
      console.log("CORS middleware - Request origin:", origin);
      console.log("CORS middleware - All headers:", this.req.headers);

      const allowedOrigins = [
        "https://play-machine-companion-app.leo.gd",
        "https://play-machine-os.leo.gd"
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        console.log("CORS middleware - Allowing origin:", origin);
        callback(null, origin || true);
      } else {
        console.log("CORS middleware - Blocking origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

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
