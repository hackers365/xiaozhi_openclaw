import { createRequire } from "node:module";

export type XiaozhiWebSocket = {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

export type XiaozhiWebSocketCtor = {
  new (url: string): XiaozhiWebSocket;
  readonly CONNECTING: number;
  readonly OPEN: number;
  readonly CLOSING: number;
  readonly CLOSED: number;
};

export const WS_READY_STATE_CONNECTING = 0;
export const WS_READY_STATE_OPEN = 1;
export const WS_READY_STATE_CLOSING = 2;
export const WS_READY_STATE_CLOSED = 3;

let cachedCtor: XiaozhiWebSocketCtor | null = null;

function isWebSocketCtor(value: unknown): value is XiaozhiWebSocketCtor {
  return (
    typeof value === "function" &&
    typeof (value as { OPEN?: unknown }).OPEN === "number" &&
    typeof (value as { CONNECTING?: unknown }).CONNECTING === "number"
  );
}

function resolveFromGlobal(): XiaozhiWebSocketCtor | null {
  const candidate = globalThis.WebSocket as unknown;
  return isWebSocketCtor(candidate) ? candidate : null;
}

function resolveFromWsPackage(): XiaozhiWebSocketCtor | null {
  try {
    const require = createRequire(import.meta.url);
    const wsModule = require("ws") as { default?: unknown; WebSocket?: unknown } | unknown;
    if (wsModule && typeof wsModule === "object") {
      const candidate = (wsModule as { default?: unknown; WebSocket?: unknown }).default ??
        (wsModule as { default?: unknown; WebSocket?: unknown }).WebSocket ??
        wsModule;
      if (isWebSocketCtor(candidate)) {
        return candidate;
      }
    }
    if (isWebSocketCtor(wsModule)) {
      return wsModule;
    }
  } catch {
    // Ignore module resolution errors so plugin loading never fails.
  }
  return null;
}

export function getWebSocketCtor(): XiaozhiWebSocketCtor {
  if (cachedCtor) {
    return cachedCtor;
  }

  const resolved = resolveFromGlobal() ?? resolveFromWsPackage();
  if (!resolved) {
    throw new Error(
      'No WebSocket implementation found. Install "ws" in the OpenClaw runtime (npm install ws) or use Node.js 20+ with global WebSocket.',
    );
  }

  cachedCtor = resolved;
  return cachedCtor;
}

export function toTextMessage(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof Buffer) {
    return data.toString("utf-8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf-8");
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf-8");
  }
  return String(data ?? "");
}
