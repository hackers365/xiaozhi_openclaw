import { generateUUID } from "./uuid.js";

/**
 * Generate a session ID for xiaozhi device
 * Format: xiaozhi-{user_id}-{device_id}-{timestamp}
 */
export function generateSessionId(userId: string, deviceId: string): string {
  return `xiaozhi-${userId}-${deviceId}-${Date.now()}-${generateUUID().slice(0, 8)}`;
}

/**
 * Validate a xiaozhi session ID
 */
export function isValidSessionId(sessionId: string): boolean {
  return /^xiaozhi-[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]+-\d+-[a-f0-9]{8}$/.test(sessionId);
}
