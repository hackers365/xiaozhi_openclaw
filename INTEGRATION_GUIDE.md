# XiaoZhi ESP32 Channel 集成指南

本指南用于在 OpenClaw Gateway 中接入 XiaoZhi WebSocket Channel（当前 npm 包：`@xiaozhi_openclaw/xiaozhi@0.0.3`）。

## 目录

- [前提条件](#前提条件)
- [安装](#安装)
- [配置](#配置)
- [启动](#启动)
- [验证](#验证)
- [故障排查](#故障排查)

## 前提条件

- Node.js `18+`
- OpenClaw Gateway 可正常启动
- xiaozhi-esp32-server-golang 已提供 WebSocket 端点（如 `/ws/openclaw`）
- 你已拿到可用 JWT token（建议由小智服务端 openclaw-endpoint 生成）

## 安装

### 使用 OpenClaw 插件命令安装（推荐）

在任意目录执行：

```bash
openclaw plugins install @xiaozhi_openclaw/xiaozhi
```

如需固定版本：

```bash
openclaw plugins install @xiaozhi_openclaw/xiaozhi@0.0.3
```

安装后可检查：

```bash
openclaw plugins list
```

开发阶段如果希望直接加载本地源码目录，而不是复制到 `~/.openclaw/extensions`，可使用 `--link`：

```bash
openclaw plugins install --link ./openclaw-channel
```

`--link` 只支持本地路径。代码变更后通常只需要重启 gateway，无需重新安装。

安装完成后可以直接通过 CLI 新增 xiaozhi 配置：

```bash
openclaw channels add --channel xiaozhi --url ws://localhost:8080/ws/openclaw --token <jwt>
```

如需新增命名账号：

```bash
openclaw channels add --channel xiaozhi --account office --name Office --url ws://localhost:8080/ws/openclaw --token <jwt>
```

## 配置

编辑 OpenClaw 配置文件（如 `~/.openclaw/openclaw.json`）：

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

参数说明：

- `reconnectInterval`：重连间隔，默认 `5000` 毫秒
- `heartbeatInterval`：心跳发送间隔，默认 `30000` 毫秒
- `heartbeatTimeout`：单次心跳超时，默认 `10000` 毫秒

### Token 生成（可选）

如需临时生成 token，可使用仓库脚本：

```bash
cd /path/to/xiaozhi_openclaw
node generate-token.js <user_id_number> <agent_id> <endpoint_id> [expires_in]
```

示例：

```bash
node generate-token.js 1 main agent_main
```

## 启动

1. 启动 xiaozhi-esp32-server-golang：

```bash
./xiaozhi-server --config config.yaml
```

2. 启动 OpenClaw Gateway：

```bash
openclaw gateway start
```

## 验证

### 1. 检查状态

```bash
openclaw status
```

期望：

```text
Channels:
  xiaozhi (default):
    Status: running
    URL: ws://localhost:8080/ws/openclaw
```

### 2. 查看日志

```bash
openclaw gateway logs --follow
```

期望包含：

```text
[xiaozhi:default] connecting to ws://localhost:8080/ws/openclaw
[xiaozhi:default] connected
[xiaozhi:default] received handshake_ack ...
```

### 3. 验证自动重连

当对端服务重启或网络闪断时，日志应出现：

```text
[xiaozhi:default] scheduleReconnect called ...
[xiaozhi:default] reconnecting...
```

说明：当前实现对 `onclose` 和“仅 `onerror` 不触发 close”的情况都做了重连兜底。

## 故障排查

### 1. `Cannot find module 'ws'`

原因：运行环境缺少 WebSocket 实现。

处理：

```bash
npm install ws
```

说明：当前插件会优先使用 `ws` 包，若运行环境里没有安装 `ws`，再回退到全局 `WebSocket`。

### 2. `websocket error` 后不重连

当前版本已处理该场景；若仍出现，请确认：

- 日志中是否出现 `scheduleReconnect called`
- `reconnectInterval` 是否过大
- 网关进程是否仍存活

如果日志栈里出现 `undici`，说明运行时正在使用 Node 自带的全局 `WebSocket`。部分服务端在这个实现下会表现为 `onerror readyState=0`，但改用 `ws` 后可正常握手。当前仓库版本已调整为优先使用 `ws`，发布并升级插件后再重试。

### 3. `Unsupported schema node. Use Raw mode.`

这是管理界面 schema 渲染兼容问题。当前插件已使用扁平配置 schema；升级插件后重启网关再试。

### 4. 认证失败

检查：

- token 是否过期
- token 的签名密钥是否与服务端一致
- token claims 是否满足服务端校验

## 参考文档

- [通信协议](./protocol/XIAOZHI_OPENCLAW_PROTOCOL.md)
- [集成步骤](./INTEGRATION_STEPS.md)
