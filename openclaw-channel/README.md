# @xiaozhi_openclaw/xiaozhi

OpenClaw channel plugin for XiaoZhi ESP32 Server WebSocket integration.

## Install

```bash
npm install @xiaozhi_openclaw/xiaozhi
```

With OpenClaw CLI:

```bash
openclaw plugins install @xiaozhi_openclaw/xiaozhi@0.0.5
```

With `npx` installer mode:

```bash
npx -y @xiaozhi_openclaw/xiaozhi@0.0.5 install
```

Compatibility note: use `0.0.5` with OpenClaw `2026.3.8+`.

If a previous manual copy already exists at `~/.openclaw/extensions/xiaozhi`, remove it before reinstalling:

```bash
openclaw plugins uninstall xiaozhi
rm -rf ~/.openclaw/extensions/xiaozhi
```

If `openclaw plugins uninstall xiaozhi` reports that the plugin is unmanaged, just remove the directory manually.

Development link mode:

```bash
openclaw plugins install --link ./openclaw-channel
```

Local installer dry run:

```bash
node cli.mjs install --dry-run
```

Installer diagnostics:

```bash
node cli.mjs doctor
```

Fallback helper for direct config writes:

```bash
node cli.mjs setup --url ws://localhost:8080/ws/openclaw --token <jwt>
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
openclaw config set channels.xiaozhi.enabled true --strict-json
openclaw config set channels.xiaozhi.url "ws://localhost:8080/ws/openclaw"
openclaw config set channels.xiaozhi.token "<jwt>"
```

Named account:

```bash
openclaw config set channels.xiaozhi.enabled true --strict-json
openclaw config set channels.xiaozhi.accounts.office.enabled true --strict-json
openclaw config set channels.xiaozhi.accounts.office.name "Office"
openclaw config set channels.xiaozhi.accounts.office.url "ws://localhost:8080/ws/openclaw"
openclaw config set channels.xiaozhi.accounts.office.token "<jwt>"
openclaw config set channels.xiaozhi.defaultAccount "office"
```

## Notes

- The plugin prefers the `ws` package and only falls back to global `WebSocket`.
- If your runtime does not provide global `WebSocket`, install `ws`.
- For scoped first publish, npm requires `--access public` (already set in `publishConfig`).
- To pick/bind OpenClaw agent per device, send `payload.metadata.openclaw_agent_id`.
- `0.0.5+` no longer requires runtime resolution of `openclaw/plugin-sdk/*` from the installed extension directory.
- `0.0.5` now also exposes a bundled installer CLI, so `npx` can install from the current package directory without going through `clawhub`.
- `0.0.5` also ships explicit channel metadata for `xiaozhi` and a `node cli.mjs doctor` health check.
- On OpenClaw builds where `openclaw channels add --channel xiaozhi ...` still reports `Unknown channel`, use `openclaw config set channels.xiaozhi.*` instead.
