export const XiaozhiConfigSchema = {
  type: "object",
  properties: {
    enabled: {
      type: "boolean",
      title: "Enabled",
      description: "Enable xiaozhi channel",
      default: false,
    },
    url: {
      type: "string",
      title: "WebSocket URL",
      description: "xiaozhi WebSocket server URL (e.g., ws://localhost:8080/ws/openclaw)",
    },
    token: {
      type: "string",
      title: "Token",
      description: "JWT token from xiaozhi openclaw-endpoint (contains user_id/agent_id)",
      secret: true,
    },
    reconnectInterval: {
      type: "number",
      title: "Reconnect Interval (ms)",
      description: "Interval between reconnection attempts",
      default: 5000,
    },
    heartbeatInterval: {
      type: "number",
      title: "Heartbeat Interval (ms)",
      description: "Interval between heartbeat pings",
      default: 30000,
    },
    heartbeatTimeout: {
      type: "number",
      title: "Heartbeat Timeout (ms)",
      description: "Timeout for heartbeat response",
      default: 10000,
    },
  },
  required: ["url", "token"],
} as const;

export const XiaozhiAccountSchema = {
  type: "object",
  properties: {
    enabled: {
      type: "boolean",
      title: "Enabled",
      default: true,
    },
    url: {
      type: "string",
      title: "WebSocket URL",
    },
    token: {
      type: "string",
      title: "Token",
      secret: true,
    },
    reconnectInterval: {
      type: "number",
      title: "Reconnect Interval (ms)",
      default: 5000,
    },
    heartbeatInterval: {
      type: "number",
      title: "Heartbeat Interval (ms)",
      default: 30000,
    },
    heartbeatTimeout: {
      type: "number",
      title: "Heartbeat Timeout (ms)",
      default: 10000,
    },
  },
  required: ["url", "token"],
} as const;
