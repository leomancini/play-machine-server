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

app.use((req, res, next) => {
  req.url = req.url.replace(/\/+/g, "/");
  next();
});

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

app.get("/api/themes", (req, res) => {
  try {
    const themesPath = path.join(process.cwd(), "config", "Themes.json");
    const themesData = fs.readFileSync(themesPath, "utf8");
    const themes = JSON.parse(themesData);
    res.json(themes);
  } catch (error) {
    console.error("Error reading themes config:", error);
    res.status(500).json({ error: "Failed to load themes configuration" });
  }
});

const saveBase64Image = (base64Data, folderPath, filename) => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Image, "base64");

  const filePath = path.join(folderPath, `${filename}.jpg`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

app.post("/api/save-screenshot", (req, res) => {
  try {
    const { id, index, data, apiKey } = req.body;

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

    const relativePath = path.join("screenshots", id, `${index}.jpg`);

    res.json({ success: true, path: relativePath });
  } catch (error) {
    console.error("Error saving image:", error);
    res.status(500).json({ error: "Failed to save image" });
  }
});

app.delete("/api/delete-screenshots/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { apiKey } = req.query;

    if (!apiKey) {
      return res.status(401).json({ error: "API key is required" });
    }

    if (apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    if (!id) {
      return res.status(400).json({ error: "ID parameter is required" });
    }

    const folderPath = path.join(process.cwd(), "screenshots", id);

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: "Screenshot folder not found" });
    }

    fs.rmSync(folderPath, { recursive: true, force: true });

    res.json({
      success: true
    });
  } catch (error) {
    console.error("Error deleting screenshots:", error);
    res.status(500).json({ error: "Failed to delete screenshots" });
  }
});

const httpServer = createServer(app);
const wsServer = createServer();
const wssServer = createServer();

const ws = new WebSocketServer({ server: wsServer });
const wss = new WebSocketServer({ server: wssServer });

// Track serial data requests: requestId -> requesting client
const serialDataRequests = new Map();

const handleConnection = (ws) => {
  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);

      if (parsedMessage.apiKey !== process.env.API_KEY) {
        throw new Error("Invalid API key");
      }

      // Handle getSerialData requests - store the requesting client
      if (parsedMessage.action === "getSerialData") {
        const requestId = parsedMessage.requestId || Date.now().toString();
        serialDataRequests.set(requestId, ws);

        // Broadcast the request to other clients (like device controllers)
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ ...parsedMessage, requestId }));
          }
        });
      }
      // Handle serialData responses - route only to requesting client
      else if (
        parsedMessage.serialData !== undefined &&
        parsedMessage.requestId
      ) {
        const requestingClient = serialDataRequests.get(
          parsedMessage.requestId
        );
        if (
          requestingClient &&
          requestingClient.readyState === WebSocket.OPEN
        ) {
          const messageWithFlag = {
            ...parsedMessage,
            isFromSelf: true
          };
          requestingClient.send(JSON.stringify(messageWithFlag));
        }
        // Clean up the request tracking
        serialDataRequests.delete(parsedMessage.requestId);
      }
      // Handle screenshot data responses - route only to requesting client
      else if (
        parsedMessage.screenshotData !== undefined &&
        parsedMessage.requestId
      ) {
        const requestingClient = serialDataRequests.get(
          parsedMessage.requestId
        );
        if (
          requestingClient &&
          requestingClient.readyState === WebSocket.OPEN
        ) {
          const messageWithFlag = {
            ...parsedMessage,
            isFromSelf: true
          };
          requestingClient.send(JSON.stringify(messageWithFlag));
        }
        // Clean up the request tracking
        serialDataRequests.delete(parsedMessage.requestId);
      }
      // Handle screenshot data without requestId (legacy behavior)
      else if (parsedMessage.screenshotData !== undefined) {
        const messageWithFlag = {
          ...parsedMessage,
          isFromSelf: true
        };
        ws.send(JSON.stringify(messageWithFlag));
      }
      // Handle other serialData (not a response to getSerialData)
      else if (parsedMessage.serialData !== undefined) {
        const messageWithFlag = {
          ...parsedMessage,
          isFromSelf: true
        };
        ws.send(JSON.stringify(messageWithFlag));

        // Broadcast to other clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(parsedMessage));
          }
        });
      }
      // Handle all other messages
      else {
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

  // Clean up any pending requests when client disconnects
  ws.on("close", () => {
    // Remove any pending requests from this client
    for (const [requestId, client] of serialDataRequests.entries()) {
      if (client === ws) {
        serialDataRequests.delete(requestId);
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
