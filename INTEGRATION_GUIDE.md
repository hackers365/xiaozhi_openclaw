# XiaoZhi ESP32 Channel 集成指南

本指南说明如何在 OpenClaw 中集成 XiaoZhi ESP32 Channel。

## 目录

- [安装](#安装)
- [配置](#配置)
- [启动](#启动)
- [测试](#测试)
- [故障排查](#故障排查)

## 安装

### 方式一：作为 OpenClaw 扩展（推荐）

1. 将 xiaozhi channel 代码复制到 OpenClaw 扩展目录：

```bash
# 假设 openclaw 代码在 /data/code/openclaw
cp -r /home/hackers365/.openclaw/workspace/xiaozhi-integration/openclaw-channel \
  /data/code/openclaw/extensions/xiaozhi
```

2. 进入 OpenClaw 目录并安装依赖：

```bash
cd /data/code/openclaw
pnpm install
```

3. 编译 OpenClaw：

```bash
pnpm build
```

### 方式二：作为本地插件开发

如果你正在开发此 channel，可以使用符号链接：

```bash
cd /data/code/openclaw/extensions
ln -s /home/hackers365/.openclaw/workspace/xiaozhi-integration/openclaw-channel xiaozhi
```

## 配置

### 1. 生成 Token

建议优先调用小智服务端的 openclaw-endpoint 接口拿 token（与服务端 claims 完全一致）。

**方法一：使用 OpenClaw CLI（需要实现）**

```bash
openclaw xiaozhi token generate \
  --user-id 1 \
  --agent-id main \
  --endpoint-id agent_main \
  --purpose openclaw-endpoint
```

**方法二：手动生成（使用 Node.js）**

```javascript
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    user_id: 1,
    agent_id: 'main',
    endpoint_id: 'agent_main',
    purpose: 'openclaw-endpoint',
  },
  'your-secret-key',  // 与 xiaozhi-esp32-server-golang 的密钥一致
  {}
);
console.log(token);
```

### 2. 配置 OpenClaw Gateway

编辑 OpenClaw 配置文件 `~/.openclaw/openclaw.json` 或使用环境变量：

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

### 3. 环境变量（可选）

你也可以使用环境变量配置：

```bash
export XIAOZHI_ENABLED=true
export XIAOZHI_URL="ws://localhost:8080/ws/openclaw"
export XIAOZHI_TOKEN="your-jwt-token"
export XIAOZHI_RECONNECT_INTERVAL=5000
export XIAOZHI_HEARTBEAT_INTERVAL=30000
export XIAOZHI_HEARTBEAT_TIMEOUT=10000
```

## 启动

### 启动 OpenClaw Gateway

```bash
# 使用配置文件启动
openclaw gateway start

# 或使用环境变量
XIAOZHI_ENABLED=true XIAOZHI_URL="ws://localhost:8080/ws/openclaw" \
XIAOZHI_TOKEN="your-jwt-token" openclaw gateway start
```

### 启动 xiaozhi-esp32-server-golang

确保 xiaozhi-esp32-server-golang 已启动并监听 WebSocket 端点：

```bash
# xiaozhi-esp32-server-golang 示例启动命令
./xiaozhi-server --config config.yaml
```

配置文件示例 (`config.yaml`):

```yaml
server:
  port: 8080

websocket:
  xiaozhi:
    enabled: true
    path: "/ws/openclaw"
    jwt_secret: "your-secret-key"

esp32:
  devices:
    - id: "esp32-001"
      name: "客厅音箱"
      user_id: "user-123"

tts:
  engine: "edge-tts"
  voice: "zh-CN-XiaoxiaoNeural"

stt:
  engine: "openai-whisper"
  language: "zh-CN"
```

## 测试

### 1. 检查连接状态

```bash
openclaw status
```

你应该看到 xiaozhi channel 显示为 `running`：

```
Channels:
  xiaozhi (default):
    Status: running
    URL: ws://localhost:8080/ws/openclaw
    Last connect: 2026-02-28 15:00:00
```

### 2. 测试对话

在 ESP32 设备上说话（如"今天天气怎么样？"），观察日志：

**OpenClaw Gateway 日志：**

```bash
openclaw gateway logs --follow
```

你应该看到：

```
[xiaozhi:default] connecting to ws://localhost:8080/ws/openclaw
[xiaozhi:default] connected
[xiaozhi:default] received handshake_ack from xiaozhi-esp32-server
[xiaozhi:default] received message: 今天天气怎么样？
[xiaozhi:default] sending response: 今天是晴天，温度25度，适合出门。
```

### 3. WebSocket 消息测试

使用 `wscat` 或其他 WebSocket 客户端测试：

```bash
npm install -g wscat
wscat -c "ws://localhost:8080/ws/openclaw?token=your-jwt-token"
```

发送测试消息：

```json
{
  "id": "test-001",
  "timestamp": 1737264000000,
  "type": "message",
  "payload": {
    "content": "你好"
  }
}
```

## 故障排查

### 连接失败

**问题：** `[xiaozhi:default] connection failed`

**解决方案：**
1. 检查 xiaozhi-esp32-server-golang 是否启动
2. 检查 WebSocket URL 是否正确
3. 检查防火墙是否允许连接
4. 检查 token 是否有效

```bash
# 测试 WebSocket 端点是否可达
curl -I "http://localhost:8080/ws/openclaw"

# 测试 token
openclaw xiaozhi token verify --token "your-jwt-token"
```

### 认证失败

**问题：** `[xiaozhi:default] auth failed`

**解决方案：**
1. 检查 token 格式是否正确
2. 检查 JWT 密钥是否与 xiaozhi-esp32-server-golang 一致
3. 检查 token 是否过期

```bash
# 解码 token 查看 payload
echo "your-jwt-token" | cut -d'.' -f2 | base64 -d | jq .
```

### 心跳超时

**问题：** `[xiaozhi:default] heartbeat timeout`

**解决方案：**
1. 检查网络连接是否稳定
2. 调整 `heartbeatInterval` 和 `heartbeatTimeout` 值
3. 检查 xiaozhi-esp32-server-golang 是否正确处理 ping/pong

### 消息发送失败

**问题：** `[xiaozhi:default] failed to send response`

**解决方案：**
1. 检查 WebSocket 连接是否正常
2. 检查消息格式是否符合协议
3. 查看 xiaozhi-esp32-server-golang 日志

## 高级配置

### 多账户支持

如果你有多个 xiaozhi 设备，可以配置多个账户：

```json
{
  "channels": {
    "xiaozhi": {
      "enabled": true,
      "accounts": {
        "living-room": {
          "enabled": true,
          "url": "ws://192.168.1.100:8080/ws/openclaw",
          "token": "token-for-living-room"
        },
        "bedroom": {
          "enabled": true,
          "url": "ws://192.168.1.101:8080/ws/openclaw",
          "token": "token-for-bedroom"
        }
      },
      "defaultAccount": "living-room"
    }
  }
}
```

### TLS/SSL 支持

如果 xiaozhi-esp32-server-golang 使用 TLS，修改 URL：

```json
{
  "channels": {
    "xiaozhi": {
      "url": "wss://xiaozhi.example.com/ws/openclaw",
      "token": "your-jwt-token"
    }
  }
}
```

### 代理支持

如果需要通过代理连接：

```bash
export HTTP_PROXY="http://proxy.example.com:8080"
export HTTPS_PROXY="http://proxy.example.com:8080"
openclaw gateway start
```

## 开发调试

### 启用调试日志

```bash
export DEBUG=xiaozhi:*
openclaw gateway start --verbose
```

### 查看 WebSocket 消息

在 `client.ts` 中添加日志：

```typescript
this.ws.onmessage = (event) => {
  this.log?.info(`[xiaozhi:${this.account.accountId}] received: ${event.data}`);
  this.handleMessage(event.data.toString());
};
```

### 单元测试

```bash
cd /data/code/openclaw/extensions/xiaozhi
pnpm test
```

## 相关文档

- [通信协议文档](./protocol/XIAOZHI_OPENCLAW_PROTOCOL.md)
- [OpenClaw 官方文档](https://docs.openclaw.ai)
- [OpenClaw Gateway 文档](https://docs.openclaw.ai/gateway)

## 支持

如果遇到问题：

1. 查看日志：`openclaw gateway logs --follow`
2. 检查配置：`openclaw config get`
3. 运行诊断：`openclaw doctor`
4. 提交 Issue：[GitHub Issues](https://github.com/openclaw/openclaw/issues)

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-02-28 | 初始版本 |
