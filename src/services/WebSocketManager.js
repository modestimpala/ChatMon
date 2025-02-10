import { WebSocketServer, WebSocket } from "ws";

import { TwitchChatManager } from "./TwitchChatManager.js";

export class WebSocketManager {
  constructor(server) {
    console.log("[WebSocketManager] Initializing...");
    this.wss = new WebSocketServer({ server });
    this.channelClients = new Map();
    this.chatManager = new TwitchChatManager();

    // Add initialization logging
    this.chatManager.initialize().then(() => {
      console.log("[WebSocketManager] Chat manager initialized successfully");
    }).catch(err => {
      console.error("[WebSocketManager] Failed to initialize chat manager:", err);
    });
  }
  initialize() {
    console.log("[WebSocketManager] Setting up WebSocket server...");

    this.wss.on("connection", async (ws, req) => {
      const ip = this.getClientIP(req);
      console.log("[WebSocketManager] New connection from:", ip);

      const pathParts = req.url.split("/");
      console.log("[WebSocketManager] Connection URL parts:", pathParts);

      if (pathParts[1] !== "chatmon") {
        console.log("[WebSocketManager] Invalid path:", req.url);
        ws.close();
        return;
      }

      const channel = pathParts[3];
      console.log("[WebSocketManager] Requested channel:", channel);

      if (!channel || !/^[a-zA-Z0-9_]{4,25}$/.test(channel)) {
        console.log("[WebSocketManager] Invalid channel name:", channel);
        ws.close();
        return;
      }

      try {
        await this.handleNewConnection(channel, ws);
        console.log("[WebSocketManager] Successfully handled new connection for channel:", channel);
      } catch (error) {
        console.error("[WebSocketManager] Error handling new connection:", error);
        ws.close();
      }
    });

    console.log("[WebSocketManager] WebSocket server setup complete");
  }


  async handleNewConnection(channel, ws) {
    console.log("[WebSocketManager] Handling new connection for channel:", channel);

    if (!this.channelClients.has(channel)) {
      console.log("[WebSocketManager] Creating new client list for channel:", channel);
      this.channelClients.set(channel, []);
    }

    this.channelClients.get(channel).push(ws);
    console.log("[WebSocketManager] Current clients for channel:", channel, ":", this.channelClients.get(channel).length);

    try {
      // Setup chat client for this channel
      await this.chatManager.joinChannel(channel, (messageData) => {
        console.log("[WebSocketManager] Received message for channel:", channel);
        this.broadcastToChannel(channel, messageData);
      });

      console.log("[WebSocketManager] Successfully joined channel:", channel);
    } catch (error) {
      console.error("[WebSocketManager] Error joining channel:", channel, error);
      throw error;
    }

    ws.on("close", () => {
      console.log("[WebSocketManager] Client disconnected from channel:", channel);
      this.handleDisconnection(channel, ws);
    });

    ws.on("error", (error) => {
      console.error("[WebSocketManager] WebSocket error for channel:", channel, error);
    });
  }


  handleDisconnection(channel, ws) {
    console.log("[WebSocketManager] Handling disconnection for channel:", channel);

    const clients = this.channelClients.get(channel);
    if (!clients) {
      console.log("[WebSocketManager] No clients found for channel:", channel);
      return;
    }

    const index = clients.indexOf(ws);
    if (index !== -1) {
      clients.splice(index, 1);
      console.log("[WebSocketManager] Removed client from channel:", channel, "Remaining:", clients.length);
    }

    if (clients.length === 0) {
      console.log("[WebSocketManager] No more clients for channel:", channel, "- cleaning up");
      this.chatManager.leaveChannel(channel);
      this.channelClients.delete(channel);
    }
  }


  broadcastToChannel(channel, messageData) {
    const clients = this.channelClients.get(channel) || [];
    console.log("[WebSocketManager] Broadcasting to", clients.length, "clients in channel:", channel);

    const messageStr = JSON.stringify(messageData);

    clients.forEach((client, index) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error("[WebSocketManager] Error sending to client", index, ":", error);
        }
      } else {
        console.log("[WebSocketManager] Client", index, "not ready. State:", client.readyState);
      }
    });
  }


  getClientIP(req) {
    const cfConnectingIP = req.headers['cf-connecting-ip'];
    if (cfConnectingIP) {
      return cfConnectingIP;
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }

    return req.connection.remoteAddress;
  }
}
