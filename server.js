import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";

dotenv.config();

if (!process.env.API_KEY) {
  process.exit(1);
}

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(process.cwd(), "screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const app = express();
const httpPort = 3205;
const wsPort = 3204;
const wssPort = 3103;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Add URL normalization middleware
app.use((req, res, next) => {
  req.url = req.url.replace(/\/+/g, "/");
  next();
});

// Serve static files from screenshots directory
app.use(
  "/api/screenshots",
  express.static(path.join(process.cwd(), "screenshots"))
);

app.get("/api/validate-api-key", (req, res) => {
  const apiKey = req.query.apiKey;
  if (!apiKey) {
    return res.status(400).json({ valid: false, error: "API key is required" });
  }
  const isValid = apiKey === process.env.API_KEY;
  return res.json({ valid: isValid });
});

// Function to save base64 image
const saveBase64Image = (base64Data, folderPath, filename) => {
  // Create folder if it doesn't exist
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // Remove the data URL prefix if present
  const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Image, "base64");

  const filePath = path.join(folderPath, `${filename}.jpg`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

app.post("/api/save-screenshot", (req, res) => {
  try {
    const { id, index, data, apiKey } = req.body;

    // Validate API key first
    if (!apiKey) {
      return res.status(401).json({ error: "API key is required" });
    }

    if (apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    if (!id || !index || !data) {
      return res
        .status(400)
        .json({ error: "Missing required fields: id, index, or data" });
    }

    const folderPath = path.join(process.cwd(), "screenshots", id);
    saveBase64Image(data, folderPath, index);

    // Return relative path instead of absolute path
    const relativePath = path.join("screenshots", id, `${index}.jpg`);

    res.json({ success: true, path: relativePath });
  } catch (error) {
    console.error("Error saving image:", error);
    res.status(500).json({ error: "Failed to save image" });
  }
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
