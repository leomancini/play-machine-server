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

let socketIdCounter = 0;

const handleConnection = (connection, serverType = "unknown") => {
  const socketId = `${serverType}-${++socketIdCounter}-${Date.now()}`;
  connection.socketId = socketId;

  connection.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);

      if (parsedMessage.apiKey !== process.env.API_KEY) {
        throw new Error("Invalid API key");
      }

      // Handle messages with socketId - send only to specific client
      if (parsedMessage.socketId) {
        let targetClient = null;

        // Search in both WS and WSS clients (now using the correct server instances)
        ws.clients.forEach((client) => {
          if (
            client.socketId === parsedMessage.socketId &&
            client.readyState === WebSocket.OPEN
          ) {
            targetClient = client;
          }
        });

        if (!targetClient) {
          [...ws.clients, ...wss.clients].forEach((client) => {
            if (
              client.socketId === parsedMessage.socketId &&
              client.readyState === WebSocket.OPEN
            ) {
              targetClient = client;
            }
          });
        }

        if (targetClient) {
          targetClient.send(JSON.stringify(parsedMessage));
        } else {
          // Log all available socket IDs for debugging
          const availableSocketIds = [];
          [...ws.clients, ...wss.clients].forEach((client) => {
            if (client.socketId && client.readyState === WebSocket.OPEN) {
              availableSocketIds.push(client.socketId);
            }
          });
        }

        // Return early to prevent further processing
        return;
      }
      // Handle getCurrentTheme requests - broadcast to other clients with socketId
      else if (parsedMessage.action === "getCurrentTheme") {
        const messageWithSocketId = {
          ...parsedMessage,
          socketId: socketId
        };
        // Broadcast to both WS and WSS clients, excluding the sender
        [...ws.clients, ...wss.clients].forEach((client) => {
          if (client !== connection && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(messageWithSocketId));
          }
        });
      }
      // Handle getCurrentApp requests - broadcast to other clients with socketId
      else if (parsedMessage.action === "getCurrentApp") {
        const messageWithSocketId = {
          ...parsedMessage,
          socketId: socketId
        };

        [...ws.clients, ...wss.clients].forEach((client) => {
          if (client !== connection && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(messageWithSocketId));
          }
        });
      }
      // Handle getSerialData requests - broadcast to other clients with socketId
      else if (parsedMessage.action === "getSerialData") {
        const messageWithSocketId = {
          ...parsedMessage,
          socketId: socketId
        };

        [...ws.clients, ...wss.clients].forEach((client) => {
          if (client !== connection && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(messageWithSocketId));
          }
        });
      }
      // Handle serialData responses and other serialData
      else if (parsedMessage.serialData !== undefined) {
        const messageWithFlag = {
          ...parsedMessage
        };
        connection.send(JSON.stringify(messageWithFlag));

        [...ws.clients, ...wss.clients].forEach((client) => {
          if (client !== connection && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(parsedMessage));
          }
        });
      }
      // Handle screenshot data
      else if (parsedMessage.screenshotData !== undefined) {
        const messageWithFlag = {
          ...parsedMessage
        };
        connection.send(JSON.stringify(messageWithFlag));
      }
      // Handle all other messages
      else {
        [...ws.clients, ...wss.clients].forEach((client) => {
          if (client !== connection && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(parsedMessage));
          }
        });
      }
    } catch (e) {
      console.error(
        `[${serverType}] Error processing message from ${socketId}:`,
        e.message
      );
      if (connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify({ error: e.message }));
      }
    }
  });

  connection.on("error", (error) => {
    console.error(`[${serverType}] WebSocket error for ${socketId}:`, error);
  });
};

ws.on("connection", (websocket) => handleConnection(websocket, "WS"));
wss.on("connection", (websocket) => handleConnection(websocket, "WSS"));

httpServer.listen(httpPort, () => {
  console.log(`HTTP server running at http://localhost:${httpPort}`);
});
wsServer.listen(wsPort, () => {
  console.log(`WebSocket server running at ws://localhost:${wsPort}`);
});
wssServer.listen(wssPort, () => {
  console.log(
    `WebSocket server running at wss://localhost:${wssPort} (will be secured by Apache)`
  );
});
