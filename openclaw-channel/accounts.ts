import type { CoreConfig } from "openclaw/config";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { XiaozhiAccount, XiaozhiConfig } from "./types.js";

type XiaozhiChannelConfig = XiaozhiConfig & {
  accounts?: Record<string, XiaozhiConfig | undefined>;
  defaultAccount?: string;
};

function listConfiguredXiaozhiAccountIds(cfg: CoreConfig): string[] {
  const accounts = cfg.channels?.xiaozhi?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean).toSorted((a, b) => a.localeCompare(b));
}

export function listXiaozhiAccountIds(cfg: CoreConfig): string[] {
  const ids = listConfiguredXiaozhiAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids;
}

export function resolveDefaultXiaozhiAccountId(cfg: CoreConfig): string {
  const ids = listXiaozhiAccountIds(cfg);
  const defaultAccountId = cfg.channels?.xiaozhi?.defaultAccount;
  if (defaultAccountId && ids.includes(defaultAccountId)) {
    return defaultAccountId;
  }
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveXiaozhiAccountConfig(cfg: CoreConfig, accountId: string): XiaozhiConfig | undefined {
  return cfg.channels?.xiaozhi?.accounts?.[accountId];
}

function mergeXiaozhiAccountConfig(cfg: CoreConfig, accountId: string): XiaozhiChannelConfig {
  const channel = (cfg.channels?.xiaozhi ?? {}) as XiaozhiChannelConfig;
  const account = resolveXiaozhiAccountConfig(cfg, accountId) ?? {};
  const { accounts: _ignoredAccounts, defaultAccount: _ignoredDefaultAccount, ...base } = channel;

  return {
    ...base,
    ...account,
  };
}

export function resolveXiaozhiAccount({
  cfg,
  accountId,
}: {
  cfg: CoreConfig;
  accountId?: string;
}): XiaozhiAccount {
  const resolvedAccountId = accountId ?? resolveDefaultXiaozhiAccountId(cfg);
  const merged = mergeXiaozhiAccountConfig(cfg, resolvedAccountId);

  const url = merged.url?.trim() ?? "";
  const token = merged.token?.trim() ?? "";
  const reconnectInterval = merged.reconnectInterval ?? 5000;
  const heartbeatInterval = merged.heartbeatInterval ?? 30000;
  const heartbeatTimeout = merged.heartbeatTimeout ?? 10000;
  const enabled = merged.enabled ?? false;
  const configured = url.length > 0 && token.length > 0;

  return {
    accountId: resolvedAccountId,
    name: merged.name?.trim() || undefined,
    enabled,
    configured,
    url,
    token,
    reconnectInterval,
    heartbeatInterval,
    heartbeatTimeout,
  };
}
