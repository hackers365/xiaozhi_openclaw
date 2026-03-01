import {
  createReplyPrefixOptions,
  formatTextWithAttachmentLinks,
  resolveOutboundMediaUrls,
  type OpenClawConfig,
  type ReplyPayload,
} from "openclaw/plugin-sdk";
import WebSocket from "ws";
import type { XiaozhiAccount, XiaozhiConnection, XiaozhiInboundMessage } from "./types.js";
import { clearXiaozhiConnection, setXiaozhiConnection, type XiaozhiRuntime } from "./runtime.js";
import { XiaozhiClient } from "./client.js";
import { sendMessageXiaozhi } from "./send.js";
import { generateSessionId } from "./utils.js";

const activeMonitorStops = new Map<string, (reason?: string) => void>();

type MonitorLog = {
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
};

export type MonitorStatusSink = (patch: {
  running?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
}) => void;

export type MonitorOptions = {
  accountId: string;
  account: XiaozhiAccount;
  cfg: OpenClawConfig;
  runtime: XiaozhiRuntime;
  abortSignal: AbortSignal;
  statusSink: MonitorStatusSink;
  log?: MonitorLog;
};

export async function monitorXiaozhiProvider(options: MonitorOptions): Promise<{ stop: () => void }> {
  const { accountId, account, cfg, runtime, abortSignal, statusSink } = options;
  const log: MonitorLog = options.log ?? {
    info: (msg: string, ...args: unknown[]) => console.log(`[xiaozhi:${accountId}] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn(`[xiaozhi:${accountId}] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(`[xiaozhi:${accountId}] ${msg}`, ...args),
  };

  const previousStop = activeMonitorStops.get(accountId);
  if (previousStop) {
    log.warn("detected duplicated monitor start, stopping previous monitor first");
    previousStop("replaced_by_new_monitor");
  }

  if (!account || !account.token) {
    throw new Error(`xiaozhi account "${accountId}" missing token`);
  }
  if (!account.url) {
    throw new Error(`xiaozhi account "${accountId}" missing url`);
  }

  // Extract token claims
  const claims = parseTokenClaims(account.token);

  const sessionIds = new Map<string, string>();

  const client = new XiaozhiClient({
    account,
    onMessage: (message) => {
      void handleMessage(message);
    },
    onConnect: () => {
      setXiaozhiConnection(accountId, connection);
      log.info("connected");
      statusSink({
        running: true,
        lastStartAt: Date.now(),
        lastError: null,
      });
    },
    onDisconnect: (error) => {
      clearXiaozhiConnection(accountId);
      log.warn("disconnected", error?.message);
      statusSink({
        running: false,
        lastStopAt: Date.now(),
        lastError: error?.message ?? "Unknown error",
      });
    },
    log,
  });

  // Create connection when WebSocket connects
  const connection: XiaozhiConnection = {
    accountId,
    ws: null,
    claims,
    connectedAt: 0,
    lastPingAt: 0,
    lastPongAt: 0,
    sessionIds,
  };

  client.setConnection(connection);

  async function handleMessage(message: XiaozhiInboundMessage): Promise<void> {
    try {
      statusSink({ lastInboundAt: Date.now() });

      const route = runtime.channel.routing.resolveAgentRoute({
        cfg,
        channel: "xiaozhi",
        accountId,
        peer: {
          kind: "direct",
          id: message.deviceId,
        },
      });

      const rawBody = message.content?.trim() || "";
      if (!rawBody) {
        log.warn("drop empty inbound message", { messageId: message.messageId });
        return;
      }

      const envelope = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);
      const body = runtime.channel.reply.formatAgentEnvelope({
        channel: "XiaoZhi",
        from: message.userId,
        timestamp: message.timestamp,
        envelope,
        body: rawBody,
      });

      const sessionKey = route.sessionKey;
      let sessionId = message.sessionId || sessionIds.get(message.deviceId);
      if (!sessionId) {
        sessionId = generateSessionId(message.userId, message.deviceId);
      }
      sessionIds.set(message.deviceId, sessionId);

      const ctxPayload = runtime.channel.reply.finalizeInboundContext({
        Body: body,
        BodyForAgent: rawBody,
        RawBody: rawBody,
        CommandBody: rawBody,
        From: `xiaozhi:user:${message.userId}`,
        To: `xiaozhi:device:${message.deviceId}`,
        SessionKey: sessionKey,
        AccountId: route.accountId,
        ChatType: "direct",
        ConversationLabel: message.deviceId,
        SenderId: message.userId,
        SenderName: message.userId,
        Provider: "xiaozhi",
        Surface: "xiaozhi",
        MessageSid: message.messageId,
        ReplyToId: message.messageId,
        OriginatingChannel: "xiaozhi",
        OriginatingTo: message.deviceId,
      });

      const storePath = runtime.channel.session.resolveStorePath(cfg.session?.store, {
        agentId: route.agentId,
      });
      await runtime.channel.session.recordInboundSession({
        storePath,
        sessionKey: ctxPayload.SessionKey ?? sessionKey,
        ctx: ctxPayload,
        onRecordError: (error) => {
          log.error("failed updating session metadata", error);
        },
      });

      const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
        cfg,
        agentId: route.agentId,
        channel: "xiaozhi",
        accountId: route.accountId,
      });

      await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions: {
          ...prefixOptions,
          deliver: async (payload: ReplyPayload) => {
            const mediaUrls = resolveOutboundMediaUrls(payload);
            const content = formatTextWithAttachmentLinks(payload.text, mediaUrls).trim();
            if (!content) {
              log.warn("skip empty outbound payload", { messageId: message.messageId });
              return;
            }
            await sendResponse(message.deviceId, content, sessionId, message.messageId);
            statusSink({ lastOutboundAt: Date.now() });
          },
          onError: (error, info) => {
            log.error(`reply ${info.kind} failed`, error);
          },
        },
        replyOptions: {
          onModelSelected,
        },
      });
    } catch (error) {
      log.error("failed to process message", error);
    }
  }

  async function sendResponse(
    deviceId: string,
    content: string,
    sessionId?: string,
    correlationId?: string,
  ): Promise<void> {
    if (!connection.ws || connection.ws.readyState !== WebSocket.OPEN) {
      log.warn("cannot send response: not connected");
      return;
    }

    const result = await sendMessageXiaozhi(connection, { deviceId, content, sessionId }, correlationId);

    if (!result.success) {
      log.error("failed to send response", result.error);
    }
  }

  let stopped = false;
  const onAbort = (): void => {
    stopMonitor("abort_signal");
  };
  const stopMonitor = (reason = "manual_stop"): void => {
    if (stopped) {
      return;
    }
    stopped = true;

    const currentStop = activeMonitorStops.get(accountId);
    if (currentStop === stopMonitor) {
      activeMonitorStops.delete(accountId);
    }

    abortSignal.removeEventListener("abort", onAbort);
    clearXiaozhiConnection(accountId);
    client.stop();
    statusSink({
      running: false,
      lastStopAt: Date.now(),
    });
    log.info("monitor stopped", { reason });
  };

  // Handle abort signal
  abortSignal.addEventListener("abort", onAbort);

  activeMonitorStops.set(accountId, stopMonitor);

  // Start client
  client.start();

  return {
    stop: () => {
      stopMonitor("gateway_stop");
    },
  };
}

function parseTokenClaims(token: string): XiaozhiConnection["claims"] {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("token is empty");
    }
    // Token should be JWT, extract payload
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid token format");
    }

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as Record<string, unknown>;

    return {
      user_id: pickString(payload, "user_id"),
      agent_id: pickString(payload, "agent_id"),
      endpoint_id: pickString(payload, "endpoint_id"),
      device_id: pickString(payload, "device_id"),
      purpose: pickString(payload, "purpose"),
      exp: pickNumber(payload, "exp"),
      iat: pickNumber(payload, "iat"),
    };
  } catch (error) {
    throw new Error(`Failed to parse token claims: ${error}`);
  }
}

function pickString(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string") {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function pickNumber(payload: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}
