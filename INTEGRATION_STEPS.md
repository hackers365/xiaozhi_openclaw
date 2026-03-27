# XiaoZhi Channel 集成步骤（Checklist）

本清单用于快速完成 `@xiaozhi_openclaw/xiaozhi` 的接入与联调。

## 0. 前置检查

- [ ] Node.js `18+`
- [ ] OpenClaw Gateway 可启动
- [ ] xiaozhi-esp32-server-golang 已运行并开放 WebSocket 端点
- [ ] 已准备 JWT token

## 1. 安装插件

### 方案 A：使用 OpenClaw 插件命令（推荐）

```bash
openclaw plugins install @xiaozhi_openclaw/xiaozhi
```

如需固定版本：

```bash
openclaw plugins install @xiaozhi_openclaw/xiaozhi@0.0.6
```

安装后检查：

```bash
openclaw plugins list
openclaw channels capabilities --channel xiaozhi
```

### 方案 B：离线/本地源码安装（仅无法联网时）

```bash
cp -r /path/to/xiaozhi_openclaw/openclaw-channel ~/.openclaw/extensions/xiaozhi
```

如果 `~/.openclaw/extensions/xiaozhi` 已存在，先删除旧目录再安装，避免 `plugin already exists`。

```bash
openclaw plugins uninstall xiaozhi
rm -rf ~/.openclaw/extensions/xiaozhi
```

如果 `clawhub` 返回 `429`，改用：

```bash
npx -y @xiaozhi_openclaw/xiaozhi@0.0.6 install
```

如果安装后执行 `openclaw channels capabilities --channel xiaozhi` 仍然失败，先执行：

```bash
node /path/to/openclaw-channel/cli.mjs doctor
```

## 2. 配置 Gateway

优先使用 OpenClaw 官方命令：

```bash
openclaw config set channels.xiaozhi.enabled true --strict-json
openclaw config set channels.xiaozhi.url "ws://localhost:8080/ws/openclaw"
openclaw config set channels.xiaozhi.token "your-jwt-token"
```

或者直接编辑 `~/.openclaw/openclaw.json`，至少包含：

```json
{
  "channels": {
    "xiaozhi": {
      "enabled": true,
      "url": "ws://localhost:8080/ws/openclaw",
      "token": "your-jwt-token",
      "reconnectInterval": 5000,
      "heartbeatInterval": 30000,
      "heartbeatTimeout": 10000,
      "accounts": {
        "default": {
          "enabled": true,
          "url": "ws://localhost:8080/ws/openclaw",
          "token": "your-jwt-token"
        }
      },
      "defaultAccount": "default"
    }
  }
}
```

## 3. 启动服务

1. 启动 xiaozhi-esp32-server-golang

```bash
./xiaozhi-server --config config.yaml
```

2. 启动 OpenClaw Gateway

```bash
openclaw gateway start
```

## 4. 验证连通性

### 4.1 状态检查

```bash
openclaw status
```

期望：

```text
Channels:
  xiaozhi (default):
    Status: running
```

### 4.2 日志检查

```bash
openclaw gateway logs --follow
```

期望至少出现：

```text
[xiaozhi:default] connecting to ws://localhost:8080/ws/openclaw
[xiaozhi:default] connected
[xiaozhi:default] received handshake_ack ...
```

### 4.3 重连检查（重要）

重启对端服务后，期望出现：

```text
[xiaozhi:default] websocket error ...
[xiaozhi:default] scheduleReconnect called ...
[xiaozhi:default] reconnecting...
```

## 5. 常见问题

### 5.1 `Cannot find module 'ws'`

```bash
npm install ws
```

### 5.2 `Unsupported schema node. Use Raw mode.`

升级到当前插件版本并重启网关；当前版本已使用扁平 schema。

### 5.3 `Cannot find module 'openclaw/plugin-sdk/core'`

升级到 `0.0.5+` 后重试；当前版本已经移除安装目录中的运行期 SDK 裸导入。

### 5.4 `ClawHub ... 429: Rate limit exceeded`

改用：

```bash
npx -y @xiaozhi_openclaw/xiaozhi@0.0.6 install
```

### 5.5 `Unknown channel: xiaozhi`

先检查：

```bash
openclaw plugins list
openclaw plugins doctor
openclaw channels capabilities --channel xiaozhi
node /path/to/openclaw-channel/cli.mjs doctor
```

如果 `plugins list` 能看到 `xiaozhi`，并且 `channels capabilities --channel xiaozhi` 也成功，但 `openclaw channels add --channel xiaozhi ...` 仍然报错，直接改用：

```bash
openclaw config set channels.xiaozhi.enabled true --strict-json
openclaw config set channels.xiaozhi.url "ws://localhost:8080/ws/openclaw"
openclaw config set channels.xiaozhi.token "<jwt>"
```

这是因为 OpenClaw `2026.3.23-1` 的 `channels add` 子命令不会为外部 channel 预加载 plugin registry。

### 5.6 发布 npm 包（如需）

当前包名：`@xiaozhi_openclaw/xiaozhi`。

在 `openclaw-channel` 目录执行：

```bash
npm publish --access public --registry=https://registry.npmjs.org
```

## 6. 参考

- [详细指南](./INTEGRATION_GUIDE.md)
- [通信协议](./protocol/XIAOZHI_OPENCLAW_PROTOCOL.md)
