import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

const app = express();
const wsPort = 3204;
const wssPort = 3103;

const wsServer = createServer(app);
const ws = new WebSocketServer({ server: wsServer });

const wssServer = createServer(app);
const wss = new WebSocketServer({ server: wssServer });

const handleConnection = (ws) => {
  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);

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
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message.toString());
        }
      });
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
