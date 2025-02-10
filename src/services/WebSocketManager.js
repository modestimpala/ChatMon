import { WebSocketServer, WebSocket } from "ws";
import { TwitchChatManager } from "./TwitchChatManager.js";

export class WebSocketManager {
  constructor(server) {
    console.log("[WebSocketManager] Initializing...");
    this.wss = new WebSocketServer({ server });
    this.channelClients = new Map();
    this.chatManager = new TwitchChatManager();
    
    // Connection tracking for rate limiting
    this.connectionTracker = new Map();
    
    // Configuration
    this.config = {
      maxConnectionsPerIP: 3,
      connectionTimeWindow: 70000, // ~1 minute
      connectionTimeout: 300000,   // 5 minutes
      maxReconnectAttempts: 10,
      reconnectTimeWindow: 60000,  // 1 minute
    };

    this.chatManager.initialize().then(() => {
      console.log("[WebSocketManager] Chat manager initialized successfully");
    }).catch(err => {
      console.error("[WebSocketManager] Failed to initialize chat manager:", err);
    });

    // Set up periodic cleanup
    setInterval(() => this.cleanupStaleConnections(), 60000);
  }

  initialize() {
    console.log("[WebSocketManager] Setting up WebSocket server...");

    this.wss.on("connection", async (ws, req) => {
      const ip = this.getClientIP(req);
      
      // Check rate limiting
      if (!this.checkRateLimit(ip)) {
        console.log("[WebSocketManager] Rate limit exceeded for IP:", ip);
        ws.close(1008, "Rate limit exceeded");
        return;
      }

      // Validate path and channel
      const { isValid, channel } = this.validateRequest(req);
      if (!isValid) {
        ws.close(1008, "Invalid request");
        return;
      }

      try {
        // Set up connection timeout
        ws.isAlive = true;
        ws.lastActivity = Date.now();
        
        // Set up ping-pong for connection health check
        ws.on('pong', () => {
          ws.isAlive = true;
          ws.lastActivity = Date.now();
        });

        await this.handleNewConnection(channel, ws, ip);
        console.log("[WebSocketManager] Successfully handled new connection for channel:", channel);
      } catch (error) {
        console.error("[WebSocketManager] Error handling new connection:", error);
        this.cleanupConnection(channel, ws, ip);
        ws.close(1011, "Internal error");
      }
    });

    // Set up server-wide ping interval
    this.heartbeat = setInterval(() => {
      this.wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log("[WebSocketManager] WebSocket server setup complete");
  }

  validateRequest(req) {
    const pathParts = req.url.split("/");
    console.log("[WebSocketManager] Connection URL parts:", pathParts);

    if (pathParts[1] !== "chatmon") {
      console.log("[WebSocketManager] Invalid path:", req.url);
      return { isValid: false };
    }

    const channel = pathParts[3];
    if (!channel || !/^[a-zA-Z0-9_]{4,25}$/.test(channel)) {
      console.log("[WebSocketManager] Invalid channel name:", channel);
      return { isValid: false };
    }

    return { isValid: true, channel };
  }

  checkRateLimit(ip) {
    const now = Date.now();
    const connectionData = this.connectionTracker.get(ip) || { 
      count: 0, 
      firstConnection: now,
      reconnects: 0,
      lastReconnect: 0
    };

    // Reset connection count if outside time window
    if (now - connectionData.firstConnection > this.config.connectionTimeWindow) {
      connectionData.count = 0;
      connectionData.firstConnection = now;
    }

    // Reset reconnect count if outside reconnect window
    if (now - connectionData.lastReconnect > this.config.reconnectTimeWindow) {
      connectionData.reconnects = 0;
    }

    // Check limits
    if (connectionData.count >= this.config.maxConnectionsPerIP || 
        connectionData.reconnects >= this.config.maxReconnectAttempts) {
      return false;
    }

    // Update connection data
    connectionData.count++;
    connectionData.reconnects++;
    connectionData.lastReconnect = now;
    this.connectionTracker.set(ip, connectionData);

    return true;
  }

  async handleNewConnection(channel, ws, ip) {
    if (!this.channelClients.has(channel)) {
      this.channelClients.set(channel, new Set());
    }

    this.channelClients.get(channel).add(ws);
    
    try {
      await this.chatManager.joinChannel(channel, (messageData) => {
        this.broadcastToChannel(channel, messageData);
      });
    } catch (error) {
      console.error("[WebSocketManager] Error joining channel:", channel, error);
      throw error;
    }

    ws.on("message", (data) => {
      // Log attempted message and IP for monitoring
      console.warn("[WebSocketManager] Received unexpected message from client:", {
          ip: ip,
          channel: channel,
          length: data.length
      });
      
      // Immediately close connection if they try to send data
      console.log("[WebSocketManager] Closing connection due to unexpected message");
      ws.close(1008, "Message not allowed");
      this.cleanupConnection(channel, ws, ip);
  });
  

    ws.on("close", () => {
      this.cleanupConnection(channel, ws, ip);
    });

    ws.on("error", (error) => {
      console.error("[WebSocketManager] WebSocket error for channel:", channel, error);
      this.cleanupConnection(channel, ws, ip);
    });
  }

  cleanupConnection(channel, ws, ip) {
    // Remove from channel clients
    const clients = this.channelClients.get(channel);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.chatManager.leaveChannel(channel);
        this.channelClients.delete(channel);
      }
    }

    // Update connection tracking
    const connectionData = this.connectionTracker.get(ip);
    if (connectionData) {
      connectionData.count = Math.max(0, connectionData.count - 1);
      if (connectionData.count === 0) {
        this.connectionTracker.delete(ip);
      }
    }
  }

  cleanupStaleConnections() {
    const now = Date.now();
    
    this.wss.clients.forEach(ws => {
      if (now - ws.lastActivity > this.config.connectionTimeout) {
        ws.terminate();
      }
    });

    // Cleanup old connection tracking data
    for (const [ip, data] of this.connectionTracker.entries()) {
      if (now - data.firstConnection > this.config.connectionTimeWindow) {
        this.connectionTracker.delete(ip);
      }
    }
  }

  broadcastToChannel(channel, messageData) {
    const clients = this.channelClients.get(channel);
    if (!clients) return;

    const messageStr = JSON.stringify(messageData);

    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error("[WebSocketManager] Error sending to client:", error);
          this.cleanupConnection(channel, client);
        }
      }
    });
  }

  getClientIP(req) {
    return req.headers['cf-connecting-ip'] || 
           req.headers['x-forwarded-for']?.split(',')[0].trim() || 
           req.connection.remoteAddress;
  }

  destroy() {
    clearInterval(this.heartbeat);
    this.wss.close();
    // Cleanup all connections
    this.channelClients.clear();
    this.connectionTracker.clear();
  }
}