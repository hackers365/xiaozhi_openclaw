import WebSocket from "ws";
import type { XiaozhiAccount, XiaozhiConnection, XiaozhiInboundMessage, WebSocketMessage } from "./types.js";
import { sendPing, sendPong, sendClose } from "./send.js";
import { generateUUID } from "./uuid.js";

function readString(data: Record<string, unknown> | undefined, key: string): string {
  if (!data) {
    return "";
  }
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

export type XiaozhiClientOptions = {
  account: XiaozhiAccount;
  onMessage: (message: XiaozhiInboundMessage) => void;
  onConnect: () => void;
  onDisconnect: (error?: Error) => void;
  log?: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
  };
};

export class XiaozhiClient {
  private account: XiaozhiAccount;
  private ws: WebSocket | null = null;
  private connection: XiaozhiConnection | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private pingSeq = 0;
  private missedPings = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private started = false;
  private handshakeComplete = false;

  private onMessage: (message: XiaozhiInboundMessage) => void;
  private onConnect: () => void;
  private onDisconnect: (error?: Error) => void;
  private log: XiaozhiClientOptions["log"];

  constructor(options: XiaozhiClientOptions) {
    this.account = options.account;
    this.onMessage = options.onMessage;
    this.onConnect = options.onConnect;
    this.onDisconnect = options.onDisconnect;
    this.log = options.log || console;
  }

  start(): void {
    if (this.started && !this.isShuttingDown) {
      this.log?.warn(`[xiaozhi:${this.account.accountId}] start ignored: client already started`);
      return;
    }
    this.started = true;
    this.isShuttingDown = false;
    this.clearReconnect();
    this.connect();
  }

  stop(): void {
    this.started = false;
    this.isShuttingDown = true;
    this.clearHeartbeat();
    this.clearReconnect();
    if (this.connection && this.ws && this.ws.readyState === WebSocket.OPEN) {
      sendClose(this.connection, "Client shutdown", 1000);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.connection) {
      this.connection.ws = null;
    }
  }

  private connect(): void {
    if (this.isShuttingDown) {
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      this.log?.warn(`[xiaozhi:${this.account.accountId}] skip connect: websocket already active`, {
        readyState: this.ws.readyState,
      });
      return;
    }

    this.log?.info(`[xiaozhi:${this.account.accountId}] connecting to ${this.account.url}`);

    try {
      const ws = new WebSocket(`${this.account.url}?token=${this.account.token}`);
      this.ws = ws;

      this.setupWebSocketHandlers(ws);
    } catch (error) {
      this.log?.error(`[xiaozhi:${this.account.accountId}] connection failed`, error);
      this.scheduleReconnect("connect_exception");
    }
  }

  private setupWebSocketHandlers(ws: WebSocket): void {
    ws.onopen = () => {
      if (ws !== this.ws) {
        this.log?.warn(`[xiaozhi:${this.account.accountId}] ignore stale onopen event`);
        return;
      }
      this.log?.info(`[xiaozhi:${this.account.accountId}] connected`);
      this.clearReconnect();
      if (this.connection && this.ws) {
        this.connection.ws = this.ws;
        this.connection.connectedAt = Date.now();
        this.connection.lastPongAt = Date.now();
      }
      this.missedPings = 0;
      this.handshakeComplete = false;
    };

    ws.onmessage = (event) => {
      if (ws !== this.ws) {
        this.log?.warn(`[xiaozhi:${this.account.accountId}] ignore stale onmessage event`);
        return;
      }
      this.handleMessage(event.data.toString());
    };

    ws.onerror = (error) => {
      if (ws !== this.ws) {
        this.log?.warn(`[xiaozhi:${this.account.accountId}] ignore stale onerror event`);
        return;
      }
      this.log?.error(`[xiaozhi:${this.account.accountId}] websocket error`, error);
    };

    ws.onclose = (event) => {
      if (ws !== this.ws) {
        this.log?.warn(`[xiaozhi:${this.account.accountId}] ignore stale onclose event`, {
          code: event.code,
          reason: event.reason,
        });
        return;
      }
      this.log?.info(`[xiaozhi:${this.account.accountId}] disconnected`, {
        code: event.code,
        reason: event.reason,
      });
      this.ws = null;
      if (this.connection) {
        this.connection.ws = null;
      }
      this.clearHeartbeat();
      this.onDisconnect(new Error(`WebSocket closed: ${event.code} ${event.reason}`));

      if (!this.isShuttingDown) {
        this.scheduleReconnect(`onclose code=${event.code} reason=${event.reason || ""}`);
      }
    };
  }

  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);

      switch (message.type) {
        case "handshake_ack":
          this.handleHandshakeAck(message);
          break;
        case "message":
          this.handleUserMessage(message);
          break;
        case "ping":
          this.handlePing(message);
          break;
        case "pong":
          this.handlePong(message);
          break;
        case "error":
          this.handleError(message);
          break;
        case "close":
          this.handleClose(message);
          break;
        default:
          this.log?.warn(`[xiaozhi:${this.account.accountId}] unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.log?.error(`[xiaozhi:${this.account.accountId}] failed to parse message`, error);
    }
  }

  private handleHandshakeAck(message: WebSocketMessage & { type: "handshake_ack" }): void {
    if (this.handshakeComplete) {
      return;
    }

    this.log?.info(
      `[xiaozhi:${this.account.accountId}] received handshake_ack from ${message.payload.server}`,
    );

    // Send handshake
    const handshake = {
      id: generateUUID(),
      timestamp: Date.now(),
      type: "handshake",
      payload: {
        version: "1.0.0",
        client: "openclaw-gateway",
        capabilities: ["text"],
      },
    };

    this.ws?.send(JSON.stringify(handshake));

    this.handshakeComplete = true;
    this.startHeartbeat();
    this.onConnect();
  }

  private handleUserMessage(message: WebSocketMessage & { type: "message" }): void {
    if (!this.connection) {
      this.log?.warn(`[xiaozhi:${this.account.accountId}] received message before connection established`);
      return;
    }

    const metadata = message.payload.metadata as Record<string, unknown> | undefined;
    const routedDeviceId =
      readString(metadata, "device_id") || readString(metadata, "deviceId") || this.connection.claims.device_id;
    if (!routedDeviceId) {
      this.log?.warn(`[xiaozhi:${this.account.accountId}] received message without device route`, {
        messageId: message.id,
      });
      return;
    }

    const inbound: XiaozhiInboundMessage = {
      channel: "xiaozhi",
      accountId: this.account.accountId,
      messageId: message.id,
      userId: this.connection.claims.user_id,
      deviceId: routedDeviceId,
      agentId: readString(metadata, "agent_id") || readString(metadata, "agentId") || this.connection.claims.agent_id,
      content: message.payload.content,
      sessionId: message.payload.session_id,
      metadata,
      timestamp: message.timestamp,
    };

    this.onMessage(inbound);
  }

  private handlePing(message: WebSocketMessage & { type: "ping" }): void {
    if (this.connection) {
      sendPong(this.connection, message.id, message.payload.seq);
    }
  }

  private handlePong(_message: WebSocketMessage & { type: "pong" }): void {
    if (this.connection) {
      this.connection.lastPongAt = Date.now();
      this.missedPings = 0;
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
      }
    }
  }

  private handleError(message: WebSocketMessage & { type: "error" }): void {
    this.log?.warn(
      `[xiaozhi:${this.account.accountId}] received error: ${message.payload.code} - ${message.payload.message}`,
    );
  }

  private handleClose(message: WebSocketMessage & { type: "close" }): void {
    this.log?.info(`[xiaozhi:${this.account.accountId}] received close: ${message.payload.code}`);
    this.ws?.close(message.payload.code, message.payload.reason);
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.account.heartbeatInterval);
  }

  private sendHeartbeat(): void {
    if (!this.connection || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.pingSeq++;

    // Set timeout for pong
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
    this.heartbeatTimeout = setTimeout(() => {
      this.missedPings++;
      this.log?.warn(`[xiaozhi:${this.account.accountId}] heartbeat timeout, missed: ${this.missedPings}`);

      if (this.missedPings >= 3) {
        this.log?.error(`[xiaozhi:${this.account.accountId}] too many missed heartbeats, reconnecting`);
        if (this.ws) {
          this.ws.close(1000, "Heartbeat timeout");
        }
      }
    }, this.account.heartbeatTimeout);

    sendPing(this.connection, this.pingSeq);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private scheduleReconnect(trigger?: string): void {
    this.clearReconnect();
    const stack = new Error("scheduleReconnect").stack;
    this.log?.warn(`[xiaozhi:${this.account.accountId}] scheduleReconnect called`, {
      trigger: trigger || "unknown",
      stack,
    });

    this.reconnectTimeout = setTimeout(() => {
      this.log?.info(`[xiaozhi:${this.account.accountId}] reconnecting...`);
      this.connect();
    }, this.account.reconnectInterval);
  }

  private clearReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  getConnection(): XiaozhiConnection | null {
    return this.connection;
  }

  setConnection(connection: XiaozhiConnection): void {
    this.connection = connection;
  }

  getWebSocket(): WebSocket | null {
    return this.ws;
  }

  setWebSocket(ws: WebSocket): void {
    this.ws = ws;
  }
}
