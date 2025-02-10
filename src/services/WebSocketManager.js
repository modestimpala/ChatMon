import { WebSocketServer } from "ws";
import { TwitchChatManager } from "./TwitchChatManager.js";

export class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocketServer({ server });
    this.channelClients = new Map();
    this.chatManager = new TwitchChatManager();

    this.initialize();
  }
  initialize() {
    this.wss.on("connection", (ws, req) => {
      const channel = req.url.split("/")[2];
      if (!channel) {
        ws.close();
        return;
      }

      this.handleNewConnection(channel, ws);
    });
  }

  handleNewConnection(channel, ws) {
    if (!this.channelClients.has(channel)) {
      this.channelClients.set(channel, []);
    }
    this.channelClients.get(channel).push(ws);

    // Setup chat client for this channel
    this.chatManager.joinChannel(channel, (messageData) => {
      this.broadcastToChannel(channel, messageData);
    });

    ws.on("close", () => this.handleDisconnection(channel, ws));
  }

  handleDisconnection(channel, ws) {
    const clients = this.channelClients.get(channel);
    const index = clients.indexOf(ws);
    if (index !== -1) {
      clients.splice(index, 1);
    }
    if (clients.length === 0) {
      this.chatManager.leaveChannel(channel);
      this.channelClients.delete(channel);
    }
  }

  broadcastToChannel(channel, messageData) {
    const clients = this.channelClients.get(channel) || [];
    const messageStr = JSON.stringify(messageData);

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }
}
