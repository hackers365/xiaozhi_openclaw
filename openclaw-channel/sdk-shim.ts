export const DEFAULT_ACCOUNT_ID = "default";

type EmptyPluginConfig = Record<string, never> | undefined;

type SafeParseSuccess<T> = {
  success: true;
  data: T;
};

type SafeParseFailure = {
  success: false;
  error: {
    issues: Array<{
      path: string[];
      message: string;
    }>;
  };
};

type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

type AccountLike = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
};

type RuntimeLike = {
  running?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
};

type ConfigLike = {
  channels?: Record<string, any>;
};

type OutboundReplyPayloadLike = {
  mediaUrl?: string;
  mediaUrls?: string[];
};

function safeParseError(message: string): SafeParseFailure {
  return {
    success: false,
    error: {
      issues: [{ path: [], message }],
    },
  };
}

export function emptyPluginConfigSchema() {
  function safeParse(value: unknown): SafeParseResult<EmptyPluginConfig> {
    if (value === undefined) {
      return {
        success: true,
        data: undefined,
      };
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return safeParseError("expected config object");
    }

    if (Object.keys(value).length > 0) {
      return safeParseError("config must be empty");
    }

    return {
      success: true,
      data: value as EmptyPluginConfig,
    };
  }

  return {
    parse(value: unknown): EmptyPluginConfig {
      const result = safeParse(value);
      if (!result.success) {
        throw new Error(result.error.issues[0]?.message ?? "invalid plugin config");
      }
      return result.data;
    },
    safeParse,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  };
}

function canonicalizeAccountId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 64);

  if (!normalized || normalized === "__proto__" || normalized === "prototype" || normalized === "constructor") {
    return DEFAULT_ACCOUNT_ID;
  }

  return normalized;
}

export function normalizeAccountId(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return DEFAULT_ACCOUNT_ID;
  }
  return canonicalizeAccountId(trimmed);
}

export function getChatChannelMeta(_id: string): undefined {
  return undefined;
}

function buildRuntimeAccountStatusSnapshot(runtime?: RuntimeLike | null, probe?: unknown) {
  return {
    running: runtime?.running ?? false,
    lastStartAt: runtime?.lastStartAt ?? null,
    lastStopAt: runtime?.lastStopAt ?? null,
    lastError: runtime?.lastError ?? null,
    probe,
  };
}

export function buildBaseChannelStatusSummary(snapshot: RuntimeLike & { configured?: boolean }) {
  return {
    configured: snapshot.configured ?? false,
    running: snapshot.running ?? false,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
  };
}

export function buildBaseAccountStatusSnapshot(params: {
  account: AccountLike;
  runtime?: RuntimeLike | null;
  probe?: unknown;
}) {
  const { account, runtime, probe } = params;
  return {
    accountId: account.accountId,
    name: account.name,
    enabled: account.enabled ?? false,
    configured: account.configured ?? false,
    ...buildRuntimeAccountStatusSnapshot(runtime, probe),
    lastInboundAt: runtime?.lastInboundAt ?? null,
    lastOutboundAt: runtime?.lastOutboundAt ?? null,
  };
}

function channelHasAccounts(cfg: ConfigLike, channelKey: string): boolean {
  const accounts = cfg.channels?.[channelKey]?.accounts;
  return Boolean(accounts && typeof accounts === "object" && Object.keys(accounts).length > 0);
}

function shouldStoreNameInAccounts(params: {
  cfg: ConfigLike;
  channelKey: string;
  accountId: string;
  alwaysUseAccounts?: boolean;
}): boolean {
  if (params.alwaysUseAccounts) {
    return true;
  }
  if (params.accountId !== DEFAULT_ACCOUNT_ID) {
    return true;
  }
  return channelHasAccounts(params.cfg, params.channelKey);
}

export function applyAccountNameToChannelSection(params: {
  cfg: ConfigLike;
  channelKey: string;
  accountId: string;
  name?: string;
  alwaysUseAccounts?: boolean;
}) {
  const trimmed = params.name?.trim();
  if (!trimmed) {
    return params.cfg;
  }

  const accountId = normalizeAccountId(params.accountId);
  const base = params.cfg.channels?.[params.channelKey];

  if (
    !shouldStoreNameInAccounts({
      cfg: params.cfg,
      channelKey: params.channelKey,
      accountId,
      alwaysUseAccounts: params.alwaysUseAccounts,
    }) &&
    accountId === DEFAULT_ACCOUNT_ID
  ) {
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        [params.channelKey]: {
          ...(base ?? {}),
          name: trimmed,
        },
      },
    };
  }

  const baseAccounts = base?.accounts ?? {};
  const existingAccount = baseAccounts[accountId] ?? {};
  const baseWithoutName =
    accountId === DEFAULT_ACCOUNT_ID
      ? (({ name: _ignored, ...rest }: Record<string, any>) => rest)(base ?? {})
      : (base ?? {});

  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      [params.channelKey]: {
        ...baseWithoutName,
        accounts: {
          ...baseAccounts,
          [accountId]: {
            ...existingAccount,
            name: trimmed,
          },
        },
      },
    },
  };
}

export function migrateBaseNameToDefaultAccount(params: {
  cfg: ConfigLike;
  channelKey: string;
  alwaysUseAccounts?: boolean;
}) {
  if (params.alwaysUseAccounts) {
    return params.cfg;
  }

  const base = params.cfg.channels?.[params.channelKey];
  const baseName = base?.name?.trim();
  if (!baseName) {
    return params.cfg;
  }

  const accounts = { ...(base?.accounts ?? {}) };
  const defaultAccount = accounts[DEFAULT_ACCOUNT_ID] ?? {};
  if (!defaultAccount.name) {
    accounts[DEFAULT_ACCOUNT_ID] = {
      ...defaultAccount,
      name: baseName,
    };
  }

  const { name: _ignored, ...rest } = base ?? {};
  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      [params.channelKey]: {
        ...rest,
        accounts,
      },
    },
  };
}

export function setAccountEnabledInConfigSection(params: {
  cfg: ConfigLike;
  sectionKey: string;
  accountId: string;
  enabled: boolean;
  allowTopLevel?: boolean;
}) {
  const accountId = normalizeAccountId(params.accountId);
  const channel = params.cfg.channels?.[params.sectionKey] ?? {};
  const hasAccounts = channelHasAccounts(params.cfg, params.sectionKey);

  if (params.allowTopLevel && accountId === DEFAULT_ACCOUNT_ID && !hasAccounts) {
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        [params.sectionKey]: {
          ...channel,
          enabled: params.enabled,
        },
      },
    };
  }

  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      [params.sectionKey]: {
        ...channel,
        accounts: {
          ...(channel.accounts ?? {}),
          [accountId]: {
            ...(channel.accounts?.[accountId] ?? {}),
            enabled: params.enabled,
          },
        },
      },
    },
  };
}

export function deleteAccountFromConfigSection(params: {
  cfg: ConfigLike;
  sectionKey: string;
  accountId: string;
  clearBaseFields?: string[];
  allowTopLevel?: boolean;
}) {
  const accountId = normalizeAccountId(params.accountId);
  const channel = params.cfg.channels?.[params.sectionKey] ?? {};
  const hasAccounts = channelHasAccounts(params.cfg, params.sectionKey);

  if (params.allowTopLevel && accountId === DEFAULT_ACCOUNT_ID && !hasAccounts) {
    const nextChannel = { ...channel };
    for (const key of params.clearBaseFields ?? []) {
      delete nextChannel[key];
    }

    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        [params.sectionKey]: nextChannel,
      },
    };
  }

  const accounts = { ...(channel.accounts ?? {}) };
  delete accounts[accountId];

  const nextChannel = { ...channel };
  if (Object.keys(accounts).length > 0) {
    nextChannel.accounts = accounts;
  } else {
    delete nextChannel.accounts;
  }

  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      [params.sectionKey]: nextChannel,
    },
  };
}

export function createReplyPrefixOptions(_params: {
  cfg: any;
  agentId: string;
  channel: string;
  accountId?: string;
}) {
  const prefixContext: Record<string, string> = {};
  const identityName =
    _params.cfg?.agents?.[_params.agentId]?.identity?.name?.trim?.() ||
    _params.cfg?.agents?.[_params.agentId]?.name?.trim?.();

  if (identityName) {
    prefixContext.identityName = identityName;
  }

  const accountPrefix = _params.accountId
    ? _params.cfg?.channels?.[_params.channel]?.accounts?.[_params.accountId]?.responsePrefix
    : undefined;
  const channelPrefix = _params.cfg?.channels?.[_params.channel]?.responsePrefix;
  const globalPrefix = _params.cfg?.messages?.responsePrefix;
  const configuredPrefix = accountPrefix ?? channelPrefix ?? globalPrefix;
  const responsePrefix =
    configuredPrefix === "auto" ? (identityName ? `[${identityName}]` : undefined) : configuredPrefix;

  return {
    responsePrefix,
    responsePrefixContextProvider: () => prefixContext,
    onModelSelected: (ctx: {
      provider?: string;
      model?: string;
      thinkLevel?: string;
    }) => {
      if (ctx.provider) {
        prefixContext.provider = ctx.provider;
      }
      if (ctx.model) {
        prefixContext.model = ctx.model.includes("/") ? ctx.model.split("/").at(-1) ?? ctx.model : ctx.model;
        prefixContext.modelFull = ctx.provider ? `${ctx.provider}/${ctx.model}` : ctx.model;
      }
      prefixContext.thinkingLevel = ctx.thinkLevel ?? "off";
    },
  };
}

export function resolveOutboundMediaUrls(payload: OutboundReplyPayloadLike): string[] {
  if (Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0) {
    return payload.mediaUrls;
  }
  if (payload.mediaUrl) {
    return [payload.mediaUrl];
  }
  return [];
}

export function formatTextWithAttachmentLinks(text: string | undefined, mediaUrls: string[]): string {
  const trimmedText = text?.trim() ?? "";
  if (!trimmedText && mediaUrls.length === 0) {
    return "";
  }

  const mediaBlock = mediaUrls.length > 0 ? mediaUrls.map((url) => `Attachment: ${url}`).join("\n") : "";
  if (!trimmedText) {
    return mediaBlock;
  }
  if (!mediaBlock) {
    return trimmedText;
  }
  return `${trimmedText}\n\n${mediaBlock}`;
}
