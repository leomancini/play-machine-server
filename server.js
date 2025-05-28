import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const wsPort = 3204;
const wssPort = 3103;

// Validate API key
const validateApiKey = (message) => {
  if (!message.apiKey) {
    throw new Error("API key is required");
  }
  if (message.apiKey !== process.env.API_KEY) {
    throw new Error("Invalid API key");
  }
  return true;
};

const wsServer = createServer(app);
const ws = new WebSocketServer({ server: wsServer });

const wssServer = createServer(app);
const wss = new WebSocketServer({ server: wssServer });

const handleConnection = (ws) => {
  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);

      // Validate API key before processing the message
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
      // Send error message back to client
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
