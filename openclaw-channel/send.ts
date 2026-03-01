import WebSocket from "ws";
import type { XiaozhiConnection, XiaozhiOutboundMessage } from "./types.js";
import { generateUUID } from "./uuid.js";

function sendWebSocketMessage(connection: XiaozhiConnection, message: Record<string, unknown>): { success: boolean; error?: string } {
  const ws = connection.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return { success: false, error: "WebSocket is not connected" };
  }

  try {
    ws.send(JSON.stringify(message));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendMessageXiaozhi(
  connection: XiaozhiConnection,
  message: XiaozhiOutboundMessage,
  correlationId?: string,
): Promise<{ id: string; success: boolean; error?: string }> {
  const id = generateUUID();
  const timestamp = Date.now();

  try {
    const payload: Record<string, unknown> = {
      content: message.content,
    };

    if (message.sessionId) {
      payload.session_id = message.sessionId;
    }
    payload.metadata = {
      ...(message.metadata || {}),
      device_id: message.deviceId,
    };

    const wsMessage = {
      id,
      timestamp,
      type: "response",
      ...(correlationId ? { correlation_id: correlationId } : {}),
      payload,
    };

    const sendResult = sendWebSocketMessage(connection, wsMessage);
    if (!sendResult.success) {
      return { id, success: false, error: sendResult.error };
    }

    return { id, success: true };
  } catch (error) {
    return {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendPing(
  connection: XiaozhiConnection,
  seq: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const wsMessage = {
      id: generateUUID(),
      timestamp: Date.now(),
      type: "ping",
      payload: { seq },
    };

    const sendResult = sendWebSocketMessage(connection, wsMessage);
    if (!sendResult.success) {
      return sendResult;
    }
    connection.lastPingAt = Date.now();

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendPong(
  connection: XiaozhiConnection,
  correlationId: string,
  seq: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const wsMessage = {
      id: generateUUID(),
      timestamp: Date.now(),
      type: "pong",
      correlation_id: correlationId,
      payload: { seq },
    };

    return sendWebSocketMessage(connection, wsMessage);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendError(
  connection: XiaozhiConnection,
  code: string,
  message: string,
  correlationId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const wsMessage = {
      id: generateUUID(),
      timestamp: Date.now(),
      type: "error",
      ...(correlationId ? { correlation_id: correlationId } : {}),
      payload: { code, message },
    };

    return sendWebSocketMessage(connection, wsMessage);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendClose(
  connection: XiaozhiConnection,
  reason: string,
  code: number = 1000,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ws = connection.ws;
    if (!ws) {
      return { success: false, error: "WebSocket is not connected" };
    }

    const wsMessage = {
      id: generateUUID(),
      timestamp: Date.now(),
      type: "close",
      payload: { reason, code },
    };

    const sendResult = sendWebSocketMessage(connection, wsMessage);
    if (!sendResult.success) {
      return sendResult;
    }
    ws.close(code, reason);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
