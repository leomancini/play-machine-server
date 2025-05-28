import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

const app = express();
const wsPort = 3204; // New port for non-secure WS
const wssPort = 3103; // Existing port for WSS

// Create HTTP server for non-secure WS
const wsServer = createServer(app);
const ws = new WebSocketServer({ server: wsServer });

// Create HTTP server for WSS (existing setup)
const wssServer = createServer(app);
const wss = new WebSocketServer({ server: wssServer });

// Shared connection handling logic
const handleConnection = (ws) => {
  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      console.log(parsedMessage);

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
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message.toString());
        }
      });
    }
  });

  // Handle disconnection
  ws.on("close", () => {
    console.log("Client disconnected");
    // Notify other clients about the disconnection
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "disconnect",
            timestamp: new Date().toISOString()
          })
        );
      }
    });
  });

  // Handle errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
};

// Apply connection handling to both servers
ws.on("connection", handleConnection);
wss.on("connection", handleConnection);

// Start both servers
wsServer.listen(wsPort, () => {
  console.log(`WebSocket server running at ws://localhost:${wsPort}`);
});

wssServer.listen(wssPort, () => {
  console.log(
    `WebSocket server running at ws://localhost:${wssPort} (will be secured by Apache)`
  );
});
