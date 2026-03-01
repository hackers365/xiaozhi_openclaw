import type { CoreConfig } from "openclaw/config";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { XiaozhiAccount, XiaozhiConfig } from "./types.js";

export function listXiaozhiAccountIds(cfg: CoreConfig): string[] {
  const accounts = cfg.channels?.xiaozhi?.accounts;
  if (!accounts || Object.keys(accounts).length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return Object.keys(accounts);
}

export function resolveDefaultXiaozhiAccountId(cfg: CoreConfig): string {
  const ids = listXiaozhiAccountIds(cfg);
  const defaultAccountId = cfg.channels?.xiaozhi?.defaultAccount;
  if (defaultAccountId && ids.includes(defaultAccountId)) {
    return defaultAccountId;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveXiaozhiAccount({
  cfg,
  accountId,
}: {
  cfg: CoreConfig;
  accountId?: string;
}): XiaozhiAccount {
  const resolvedAccountId = accountId ?? resolveDefaultXiaozhiAccountId(cfg);
  const config = cfg.channels?.xiaozhi?.accounts?.[resolvedAccountId];
  const topLevelConfig = cfg.channels?.xiaozhi;

  const url = config?.url ?? topLevelConfig?.url ?? "";
  const token = config?.token ?? topLevelConfig?.token ?? "";
  const reconnectInterval = config?.reconnectInterval ?? topLevelConfig?.reconnectInterval ?? 5000;
  const heartbeatInterval = config?.heartbeatInterval ?? topLevelConfig?.heartbeatInterval ?? 30000;
  const heartbeatTimeout = config?.heartbeatTimeout ?? topLevelConfig?.heartbeatTimeout ?? 10000;
  const enabled = config?.enabled ?? topLevelConfig?.enabled ?? false;
  const configured = url.length > 0 && token.length > 0;

  return {
    accountId: resolvedAccountId,
    enabled,
    configured,
    url,
    token,
    reconnectInterval,
    heartbeatInterval,
    heartbeatTimeout,
  };
}
