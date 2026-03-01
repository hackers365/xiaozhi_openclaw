import type WebSocket from "ws";

// Core types for xiaozhi channel integration

export type XiaozhiMessage = {
  id: string;
  timestamp: number;
  type: string;
  payload?: Record<string, unknown>;
  correlation_id?: string;
};

export type HandshakePayload = {
  version: string;
  client: string;
  capabilities: string[];
};

export type HandshakeAckPayload = {
  version: string;
  server: string;
};

export type MessagePayload = {
  content: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
};

export type ResponsePayload = {
  content: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
};

export type PingPayload = {
  seq: number;
};

export type PongPayload = {
  seq: number;
};

export type ErrorPayload = {
  code: string;
  message: string;
};

export type ClosePayload = {
  reason?: string;
  code: number;
};

export type WebSocketMessage =
  | XiaozhiMessage & { type: "handshake"; payload: HandshakePayload }
  | XiaozhiMessage & { type: "handshake_ack"; payload: HandshakeAckPayload }
  | XiaozhiMessage & { type: "message"; payload: MessagePayload }
  | XiaozhiMessage & { type: "response"; payload: ResponsePayload }
  | XiaozhiMessage & { type: "ping"; payload: PingPayload }
  | XiaozhiMessage & { type: "pong"; payload: PongPayload }
  | XiaozhiMessage & { type: "error"; payload: ErrorPayload }
  | XiaozhiMessage & { type: "close"; payload: ClosePayload };

export type XiaozhiTokenClaims = {
  user_id: string;
  agent_id: string;
  endpoint_id: string;
  device_id: string;
  purpose: string;
  exp: number;
  iat: number;
};

export type XiaozhiConnection = {
  accountId: string;
  ws: WebSocket | null;
  claims: XiaozhiTokenClaims;
  connectedAt: number;
  lastPingAt: number;
  lastPongAt: number;
  sessionIds: Map<string, string>; // device_id -> session_id
};

export type XiaozhiInboundMessage = {
  channel: "xiaozhi";
  accountId: string;
  messageId: string;
  userId: string;
  deviceId: string;
  agentId: string;
  content: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
};

export type XiaozhiOutboundMessage = {
  deviceId: string;
  content: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
};

export type XiaozhiConfig = {
  enabled?: boolean;
  url: string;
  token: string;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
};

export type XiaozhiAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  url: string;
  token: string;
  reconnectInterval: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
};
