import type { OpenClawConfig, ReplyPayload } from "openclaw/plugin-sdk/compat";
import type { XiaozhiAccount, XiaozhiConnection, XiaozhiInboundMessage } from "./types.js";
import { clearXiaozhiConnection, setXiaozhiConnection, type XiaozhiRuntime } from "./runtime.js";
import { XiaozhiClient } from "./client.js";
import {
  createReplyPrefixOptions,
  formatTextWithAttachmentLinks,
  resolveOutboundMediaUrls,
} from "./sdk-shim.js";
import { sendMessageXiaozhi } from "./send.js";
import { generateSessionId } from "./utils.js";
import { WS_READY_STATE_OPEN } from "./websocket.js";
import { generateUUID } from "./uuid.js";

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

type ResponseStreamMetadata = {
  stream_id: string;
  seq: number;
  done: boolean;
  phase: "chunk" | "snapshot" | "final";
  content_type?: "delta" | "snapshot";
  reason?: "complete" | "error";
};

type AgentSelection = {
  agentId: string;
  sessionKey: string;
};

type StreamMessageState = {
  observedText: string;
  emittedText: string;
};

type StreamTextUpdate = {
  phase: "chunk" | "snapshot";
  content: string;
};

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function classifyStreamTextUpdate(next: string, emitted: string): StreamTextUpdate | null {
  if (!next) {
    return null;
  }
  if (!emitted) {
    return { phase: "chunk", content: next };
  }
  if (next === emitted) {
    return null;
  }
  if (next.startsWith(emitted)) {
    const delta = next.slice(emitted.length);
    return delta ? { phase: "chunk", content: delta } : null;
  }
  const normalizedNext = normalizeComparableText(next);
  const normalizedEmitted = normalizeComparableText(emitted);
  if (normalizedNext && normalizedNext === normalizedEmitted) {
    return null;
  }
  return { phase: "snapshot", content: next };
}

function buildStreamStateSearchOrder(size: number, hintIndex: number): number[] {
  if (size <= 0) {
    return [];
  }
  const start = Math.max(0, Math.min(hintIndex, size - 1));
  const order: number[] = [];
  for (let index = start; index < size; index += 1) {
    order.push(index);
  }
  for (let index = 0; index < start; index += 1) {
    order.push(index);
  }
  return order;
}

function resolveStreamMessageStateIndex(content: string, states: StreamMessageState[], hintIndex: number): number {
  const normalizedContent = normalizeComparableText(content);
  if (!normalizedContent || states.length === 0) {
    return hintIndex;
  }

  const searchOrder = buildStreamStateSearchOrder(states.length, hintIndex);
  const exactMatch = searchOrder.find((index) => {
    const state = states[index];
    return (
      normalizedContent === normalizeComparableText(state.observedText) ||
      normalizedContent === normalizeComparableText(state.emittedText)
    );
  });
  if (exactMatch !== undefined) {
    return exactMatch;
  }

  const overlappingMatch = searchOrder.find((index) => {
    const state = states[index];
    const comparableStates = [state.observedText, state.emittedText]
      .map((text) => normalizeComparableText(text))
      .filter(Boolean);
    return comparableStates.some(
      (candidate) => normalizedContent.startsWith(candidate) || candidate.startsWith(normalizedContent),
    );
  });
  if (overlappingMatch !== undefined) {
    return overlappingMatch;
  }

  return hintIndex;
}

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
  const agentBindings = new Map<string, string>();

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

      const selectedAgent = resolveInboundAgentSelection({
        route,
        cfg,
        message,
        accountId,
        agentBindings,
        log,
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

      const sessionKey = selectedAgent.sessionKey;
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
        agentId: selectedAgent.agentId,
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
        agentId: selectedAgent.agentId,
        channel: "xiaozhi",
        accountId: route.accountId,
      });

      const streamReply = resolveStreamReplyEnabled(message.metadata);
      const streamId = generateUUID();
      let streamSeq = 0;
      let chunkCount = 0;
      const nonStreamChunks: string[] = [];
      let currentAssistantMessageIndex = -1;
      let deliverPayloadCount = 0;
      const streamMessageStates: StreamMessageState[] = [];
      let streamSendChain: Promise<void> = Promise.resolve();

      const ensureStreamMessageState = (messageIndex: number): StreamMessageState => {
        while (streamMessageStates.length <= messageIndex) {
          streamMessageStates.push({
            observedText: "",
            emittedText: "",
          });
        }
        return streamMessageStates[messageIndex];
      };

      const emitStreamUpdate = async (phase: "chunk" | "snapshot", content: string): Promise<void> => {
        if (!content) {
          return;
        }
        streamSeq += 1;
        chunkCount += 1;
        const metadata: ResponseStreamMetadata = {
          stream_id: streamId,
          seq: streamSeq,
          done: false,
          phase,
          content_type: phase === "snapshot" ? "snapshot" : "delta",
        };
        await sendResponse(
          message.deviceId,
          content,
          sessionId,
          message.messageId,
          {
            ...metadata,
            agent_id: selectedAgent.agentId,
          },
        );
      };

      const queueStreamUpdate = (phase: "chunk" | "snapshot", content: string): Promise<void> => {
        streamSendChain = streamSendChain
          .then(async () => {
            await emitStreamUpdate(phase, content);
          })
          .catch(() => undefined);
        return streamSendChain;
      };

      const queueStreamTextUpdate = (messageIndex: number, nextText: string, source: "partial" | "deliver"): void => {
        const state = ensureStreamMessageState(messageIndex);
        state.observedText = nextText;

        const update = classifyStreamTextUpdate(nextText, state.emittedText);
        if (!update) {
          return;
        }

        if (update.phase === "snapshot") {
          log.warn("stream reply rewrote prior text; emitting snapshot frame", {
            messageId: message.messageId,
            messageIndex,
            source,
          });
        }

        state.emittedText = nextText;
        void queueStreamUpdate(update.phase, update.content);
      };

      let dispatchFailed = false;
      try {
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
              if (streamReply) {
                const deliverIndex = deliverPayloadCount;
                deliverPayloadCount += 1;
                const stateIndex = resolveStreamMessageStateIndex(content, streamMessageStates, deliverIndex);
                queueStreamTextUpdate(stateIndex, content, "deliver");
              } else {
                nonStreamChunks.push(content);
              }
            },
            onError: (error, info) => {
              log.error(`reply ${info.kind} failed`, error);
            },
          },
          replyOptions: {
            onModelSelected,
            onAssistantMessageStart: async () => {
              currentAssistantMessageIndex += 1;
              ensureStreamMessageState(Math.max(0, currentAssistantMessageIndex));
            },
            onPartialReply: async (payload) => {
              const fullText = payload.text || "";
              if (!fullText.trim()) {
                return;
              }
              const messageIndex = Math.max(0, currentAssistantMessageIndex);
              if (!streamReply) {
                return;
              }
              queueStreamTextUpdate(messageIndex, fullText, "partial");
            },
          },
        });
      } catch (error) {
        dispatchFailed = true;
        log.error("reply dispatch failed", error);
      } finally {
        if (streamReply) {
          await streamSendChain;
        }

        if (streamReply) {
          // Stream mode: always send explicit completion marker.
          streamSeq += 1;
          const endMetadata: ResponseStreamMetadata = {
            stream_id: streamId,
            seq: streamSeq,
            done: true,
            phase: "final",
            reason: dispatchFailed ? "error" : "complete",
          };
          if (chunkCount === 0) {
            log.warn("reply produced no text chunk; sending final stream marker only", {
              messageId: message.messageId,
              dispatchFailed,
            });
          }
          await sendResponse(message.deviceId, "", sessionId, message.messageId, {
            ...endMetadata,
            agent_id: selectedAgent.agentId,
          });
          statusSink({ lastOutboundAt: Date.now() });
          return;
        }

        // Non-stream mode: preserve legacy behavior (single final response, no done marker).
        if (nonStreamChunks.length === 0) {
          log.warn("reply produced no outbound text in non-stream mode", {
            messageId: message.messageId,
            dispatchFailed,
          });
          return;
        }
        const mergedContent = nonStreamChunks.join("").trim();
        if (!mergedContent) {
          log.warn("merged outbound content is empty in non-stream mode", {
            messageId: message.messageId,
          });
          return;
        }
        await sendResponse(message.deviceId, mergedContent, sessionId, message.messageId, {
          agent_id: selectedAgent.agentId,
        });
        statusSink({ lastOutboundAt: Date.now() });
      }
    } catch (error) {
      log.error("failed to process message", error);
    }
  }

  async function sendResponse(
    deviceId: string,
    content: string,
    sessionId?: string,
    correlationId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!connection.ws || connection.ws.readyState !== WS_READY_STATE_OPEN) {
      log.warn("cannot send response: not connected");
      return;
    }

    const result = await sendMessageXiaozhi(connection, { deviceId, content, sessionId, metadata }, correlationId);

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

function resolveStreamReplyEnabled(metadata?: Record<string, unknown>): boolean {
  if (!metadata) {
    return false;
  }
  return metadata.stream === true;
}

function resolveInboundAgentSelection({
  route,
  cfg,
  message,
  accountId,
  agentBindings,
  log,
}: {
  route: { agentId: string; sessionKey: string };
  cfg: OpenClawConfig;
  message: XiaozhiInboundMessage;
  accountId: string;
  agentBindings: Map<string, string>;
  log: MonitorLog;
}): AgentSelection {
  const metadata = message.metadata;
  const explicitAgentId = pickAgentIdFromMetadata(metadata);
  const tokenAgentId = normalizeAgentId(message.agentId);

  const boundAgentId = normalizeAgentId(agentBindings.get(message.deviceId));
  let candidate = boundAgentId || explicitAgentId || tokenAgentId || route.agentId;

  // Explicit openclaw_agent_id takes highest priority and updates device binding.
  if (explicitAgentId) {
    candidate = explicitAgentId;
    if (boundAgentId !== explicitAgentId) {
      agentBindings.set(message.deviceId, explicitAgentId);
      log.info("updated bound agent from openclaw_agent_id", {
        deviceId: message.deviceId,
        accountId,
        agentId: explicitAgentId,
      });
    }
  } else if (!boundAgentId && tokenAgentId) {
    // No explicit binding yet: inherit token agent once.
    agentBindings.set(message.deviceId, tokenAgentId);
    candidate = tokenAgentId;
    log.info("initialized bound agent", {
      deviceId: message.deviceId,
      accountId,
      agentId: tokenAgentId,
      source: "token",
    });
  }

  if (!looksLikeKnownAgent(candidate, cfg)) {
    log.warn("requested agent is not configured, fallback to routed agent", {
      requestedAgentId: candidate,
      fallbackAgentId: route.agentId,
      deviceId: message.deviceId,
      accountId,
    });
    agentBindings.delete(message.deviceId);
    candidate = route.agentId;
  }

  const agentId = candidate || route.agentId;
  const sessionKey =
    agentId === route.agentId ? route.sessionKey : `xiaozhi:${accountId}:${agentId}:${message.deviceId}`;

  return {
    agentId,
    sessionKey,
  };
}

function normalizeAgentId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : "";
}

function pickAgentIdFromMetadata(metadata?: Record<string, unknown>): string {
  if (!metadata) {
    return "";
  }
  return normalizeAgentId(metadata.openclaw_agent_id);
}

function looksLikeKnownAgent(agentId: string, cfg: OpenClawConfig): boolean {
  const normalized = normalizeAgentId(agentId);
  if (!normalized) {
    return false;
  }

  const configLike = cfg as unknown as { agents?: Record<string, unknown> };
  const agents = configLike?.agents;
  if (!agents || typeof agents !== "object" || Array.isArray(agents)) {
    return true;
  }

  const knownAgentIds = Object.keys(agents);
  if (knownAgentIds.length === 0) {
    return true;
  }

  return knownAgentIds.includes(normalized);
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
