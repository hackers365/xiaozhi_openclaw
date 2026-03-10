# @xiaozhi_openclaw/xiaozhi

OpenClaw channel plugin for XiaoZhi ESP32 Server WebSocket integration.

## Install

```bash
npm install @xiaozhi_openclaw/xiaozhi
```

With OpenClaw CLI:

```bash
openclaw plugins install @xiaozhi_openclaw/xiaozhi@0.0.3
```

Development link mode:

```bash
openclaw plugins install --link ./openclaw-channel
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

## CLI Setup

```bash
openclaw channels add --channel xiaozhi --url ws://localhost:8080/ws/openclaw --token <jwt>
```

Named account:

```bash
openclaw channels add --channel xiaozhi --account office --name Office --url ws://localhost:8080/ws/openclaw --token <jwt>
```

## Notes

- The plugin prefers the `ws` package and only falls back to global `WebSocket`.
- If your runtime does not provide global `WebSocket`, install `ws`.
- For scoped first publish, npm requires `--access public` (already set in `publishConfig`).
- To pick/bind OpenClaw agent per device, send `payload.metadata.openclaw_agent_id`.
