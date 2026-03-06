# @xiaozhi_openclaw/xiaozhi

OpenClaw channel plugin for XiaoZhi ESP32 Server WebSocket integration.

## Install

```bash
npm install @xiaozhi_openclaw/xiaozhi
```

## OpenClaw Extension Entry

This package exposes:

- `openclaw.extensions: ["./index.ts"]`

## Basic Config

```json
{
  "channels": {
    "xiaozhi": {
      "enabled": true,
      "url": "ws://localhost:8080/ws/openclaw",
      "token": "your-jwt-token",
      "reconnectInterval": 5000,
      "heartbeatInterval": 30000,
      "heartbeatTimeout": 10000
    }
  }
}
```

## Notes

- If your runtime does not provide global `WebSocket`, install `ws`.
- For scoped first publish, npm requires `--access public` (already set in `publishConfig`).
- To pick/bind OpenClaw agent per device, send `payload.metadata.openclaw_agent_id`.
