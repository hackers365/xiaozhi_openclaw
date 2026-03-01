import {
  buildBaseAccountStatusSnapshot,
  buildBaseChannelStatusSummary,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  getChatChannelMeta,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";
import {
  listXiaozhiAccountIds,
  resolveDefaultXiaozhiAccountId,
  resolveXiaozhiAccount,
  type XiaozhiAccount,
} from "./accounts.js";
import { XiaozhiConfigSchema } from "./config-schema.js";
import { monitorXiaozhiProvider } from "./monitor.js";
import { getXiaozhiRuntime, resolveXiaozhiConnection } from "./runtime.js";
import { sendMessageXiaozhi } from "./send.js";

const meta = getChatChannelMeta("xiaozhi");

export const xiaozhiPlugin: ChannelPlugin<XiaozhiAccount, unknown, unknown> = {
  id: "xiaozhi",
  meta: {
    ...meta,
    name: "XiaoZhi ESP32",
    description: "XiaoZhi ESP32 Server WebSocket channel",
  },
  capabilities: {
    chatTypes: ["direct"],
    media: false,
    blockStreaming: false,
  },
  reload: { configPrefixes: ["channels.xiaozhi"] },
  configSchema: buildChannelConfigSchema(XiaozhiConfigSchema),
  config: {
    listAccountIds: (cfg) => listXiaozhiAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveXiaozhiAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultXiaozhiAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "xiaozhi",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "xiaozhi",
        accountId,
        clearBaseFields: ["enabled", "url", "token", "reconnectInterval", "heartbeatInterval", "heartbeatTimeout"],
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: `XiaoZhi ${account.accountId}`,
      enabled: account.enabled,
      configured: account.configured,
      url: account.url,
    }),
  },
  messaging: {
    normalizeTarget: (raw) => raw?.trim() || null,
    targetResolver: {
      looksLikeId: (raw) => /^[a-zA-Z0-9_-]+$/.test(raw?.trim() || ""),
      hint: "<device_id>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => {
      // Simple chunking for text messages
      const chunks: string[] = [];
      const chunkSize = limit || 1000;
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
      }
      return chunks;
    },
    chunkerMode: "text",
    textChunkLimit: 2000,
    sendText: async ({ to, text, accountId, replyToId, sessionId }) => {
      const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;

      // Get or generate session ID
      let finalSessionId = sessionId;
      if (!finalSessionId) {
        // Try to get session ID from runtime context
        // This would need to be implemented based on session management
        finalSessionId = undefined;
      }

      const connection = resolveXiaozhiConnection(resolvedAccountId);
      if (!connection) {
        throw new Error(`No active connection for xiaozhi account: ${resolvedAccountId}`);
      }

      const result = await sendMessageXiaozhi(
        connection,
        {
          deviceId: to,
          content: text,
          sessionId: finalSessionId,
        },
        replyToId,
      );

      if (!result.success) {
        throw new Error(`Failed to send message: ${result.error}`);
      }

      return { channel: "xiaozhi", messageId: result.id };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, replyToId }) => {
      // xiaozhi only supports text
      const combined = mediaUrl ? `${text}\n\nAttachment: ${mediaUrl}` : text;
      return xiaozhiPlugin.outbound!.sendText!({ to, text: combined, accountId, replyToId });
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ account, snapshot }) => ({
      ...buildBaseChannelStatusSummary(snapshot),
      url: account.url,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      ...buildBaseAccountStatusSnapshot({ account, runtime, probe: undefined }),
      url: account.url,
      configured: account.configured,
    }),
    probeAccount: async () => {
      // No probe needed for WebSocket
      return { connected: false };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      if (!account.configured) {
        throw new Error(
          `XiaoZhi is not configured for account "${account.accountId}" (need url and token in channels.xiaozhi).`,
        );
      }
      ctx.log?.info(`[${account.accountId}] starting XiaoZhi WebSocket provider (${account.url})`);

      const monitor = await monitorXiaozhiProvider({
        accountId: account.accountId,
        account,
        cfg: ctx.cfg,
        runtime: getXiaozhiRuntime(),
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
        log: {
          info: (msg: string, ...args: unknown[]) =>
            ctx.runtime.log(`[xiaozhi:${account.accountId}] ${msg}`, ...args),
          warn: (msg: string, ...args: unknown[]) =>
            ctx.runtime.log(`[xiaozhi:${account.accountId}] ${msg}`, ...args),
          error: (msg: string, ...args: unknown[]) =>
            ctx.runtime.error(`[xiaozhi:${account.accountId}] ${msg}`, ...args),
        },
      });

      // Keep the gateway task alive until this account is explicitly stopped.
      await new Promise<void>((resolve) => {
        if (ctx.abortSignal.aborted) {
          resolve();
          return;
        }
        const onAbort = () => {
          ctx.abortSignal.removeEventListener("abort", onAbort);
          resolve();
        };
        ctx.abortSignal.addEventListener("abort", onAbort, { once: true });
      });

      monitor.stop();
    },
  },
};
