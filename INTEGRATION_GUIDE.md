# XiaoZhi ESP32 Channel 集成指南

本指南用于在 OpenClaw Gateway 中接入 XiaoZhi WebSocket Channel（当前 npm 包：`@xiaozhi_openclaw/xiaozhi@0.0.6`）。

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
openclaw plugins install @xiaozhi_openclaw/xiaozhi@0.0.6
```

兼容性说明：OpenClaw `2026.3.8+` 请使用 `@xiaozhi_openclaw/xiaozhi@0.0.6`。

如果遇到 `clawhub` 限流，可直接用安装器模式从当前 npm 包目录安装：

```bash
npx -y @xiaozhi_openclaw/xiaozhi@0.0.6 install
```

如果之前手动复制过目录到 `~/.openclaw/extensions/xiaozhi`，重新安装前请先清理旧目录：

```bash
openclaw plugins uninstall xiaozhi
rm -rf ~/.openclaw/extensions/xiaozhi
```

如果 `openclaw plugins uninstall xiaozhi` 提示该插件不是受管安装，直接删除目录即可。

安装后可检查：

```bash
openclaw plugins list
openclaw channels capabilities --channel xiaozhi
```

如果 `openclaw channels capabilities --channel xiaozhi` 失败，先运行：

```bash
node /path/to/openclaw-channel/cli.mjs doctor
```

这个自检会打印它实际调用的 `openclaw` 可执行路径，并同时检查 `plugins list` 与 `channels capabilities --channel xiaozhi`。如果插件出现在 `plugins list` 里，但 capabilities 仍失败，通常说明当前运行的不是同一个 OpenClaw 二进制，或者插件在加载阶段报错了。

开发阶段如果希望直接加载本地源码目录，而不是复制到 `~/.openclaw/extensions`，可使用 `--link`：

```bash
openclaw plugins install --link ./openclaw-channel
```

`--link` 只支持本地路径。代码变更后通常只需要重启 gateway，无需重新安装。

安装完成后，优先使用 OpenClaw 官方的 `config set` 写入 `channels.xiaozhi` 配置：

```bash
openclaw config set channels.xiaozhi.enabled true --strict-json
openclaw config set channels.xiaozhi.url "ws://localhost:8080/ws/openclaw"
openclaw config set channels.xiaozhi.token "<jwt>"
```

如需新增命名账号：

```bash
openclaw config set channels.xiaozhi.enabled true --strict-json
openclaw config set channels.xiaozhi.accounts.office.enabled true --strict-json
openclaw config set channels.xiaozhi.accounts.office.name "Office"
openclaw config set channels.xiaozhi.accounts.office.url "ws://localhost:8080/ws/openclaw"
openclaw config set channels.xiaozhi.accounts.office.token "<jwt>"
openclaw config set channels.xiaozhi.defaultAccount "office"
```

说明：OpenClaw `2026.3.23-1` 的 `channels add` 子命令不会为外部渠道插件预加载 plugin registry，所以像 `xiaozhi` 这类本地/外部 channel 即使已经 `loaded`，执行 `openclaw channels add --channel xiaozhi ...` 仍可能报 `Unknown channel: xiaozhi`。

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

### 4. `Cannot find module 'openclaw/plugin-sdk/core'`

这是旧包在 `~/.openclaw/extensions/xiaozhi` 目录下按外部插件加载时，运行期解析宿主 SDK 失败导致的。`0.0.5+` 已移除这类运行期裸导入，升级后再试。

如果安装器同时提示 `plugin already exists`，先删除旧目录后再重新执行安装命令。

### 5. `ClawHub ... 429: Rate limit exceeded`

直接改用安装器模式：

```bash
npx -y @xiaozhi_openclaw/xiaozhi@0.0.6 install
```

这个命令会从当前 npm 包目录走本地安装，不再依赖 `clawhub` 拉取插件包。

### 6. `Unknown channel: xiaozhi`

先执行：

```bash
openclaw plugins list
openclaw plugins doctor
openclaw channels capabilities --channel xiaozhi
node /path/to/openclaw-channel/cli.mjs doctor
```

重点看两点：

- `plugins list` 里是否有 `xiaozhi`
- `channels capabilities --channel xiaozhi` 是否成功

如果前者有、后者失败，优先排查：

- 当前 shell 里实际运行的是不是另一个 `openclaw`
- 插件是否在加载时抛错

如果只是 `openclaw channels add --channel xiaozhi ...` 报错，而 `channels capabilities --channel xiaozhi` 已经成功，直接改用：

```bash
openclaw config set channels.xiaozhi.enabled true --strict-json
openclaw config set channels.xiaozhi.url "ws://localhost:8080/ws/openclaw"
openclaw config set channels.xiaozhi.token "<jwt>"
```

如果你明确不想手写多条 `config set`，仍可把 `node /path/to/openclaw-channel/cli.mjs setup ...` 当作备用方案；但推荐优先使用 OpenClaw 官方的 `config set`。

### 7. 认证失败

检查：

- token 是否过期
- token 的签名密钥是否与服务端一致
- token claims 是否满足服务端校验

## 参考文档

- [通信协议](./protocol/XIAOZHI_OPENCLAW_PROTOCOL.md)
- [集成步骤](./INTEGRATION_STEPS.md)
