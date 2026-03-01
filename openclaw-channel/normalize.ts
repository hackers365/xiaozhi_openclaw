import type { ChannelId } from "openclaw/channels";

export function normalizeXiaozhiTarget(raw?: string | null): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function looksLikeXiaozhiTargetId(raw?: string | null): boolean {
  if (!raw) {
    return false;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  // xiaozhi target is just a device_id or user_id string
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

export function normalizeXiaozhiChannelId(channelId?: string | null): ChannelId | null {
  if (channelId === "xiaozhi" || channelId === null) {
    return "xiaozhi";
  }
  return null;
}

export function buildXiaozhiMessageTarget(deviceId: string): string {
  return deviceId;
}

export function parseXiaozhiMessageTarget(target: string): {
  deviceId: string;
} | null {
  if (!looksLikeXiaozhiTargetId(target)) {
    return null;
  }
  return { deviceId: target };
}
