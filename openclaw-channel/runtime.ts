import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { XiaozhiConnection } from "./types.js";

export type XiaozhiRuntime = PluginRuntime;

let xiaozhiRuntime: XiaozhiRuntime | null = null;
const connectionStore = new Map<string, XiaozhiConnection>();

export function setXiaozhiRuntime(runtime: XiaozhiRuntime): void {
  xiaozhiRuntime = runtime;
}

export function getXiaozhiRuntime(): XiaozhiRuntime {
  if (!xiaozhiRuntime) {
    throw new Error("Xiaozhi runtime not initialized");
  }
  return xiaozhiRuntime;
}

export function setXiaozhiConnection(accountId: string, connection: XiaozhiConnection): void {
  connectionStore.set(accountId, connection);
}

export function clearXiaozhiConnection(accountId: string): void {
  connectionStore.delete(accountId);
}

export function resolveXiaozhiConnection(accountId: string): XiaozhiConnection | null {
  return connectionStore.get(accountId) ?? null;
}
