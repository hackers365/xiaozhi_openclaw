# XiaoZhi Channel 集成完整步骤

## 前提条件

- OpenClaw 已安装
- Node.js 18+ 已安装
- pnpm 已安装（`npm install -g pnpm`）

## 步骤 1：复制 Channel 代码

```bash
cp -r /home/hackers365/.openclaw/workspace/xiaozhi-integration/openclaw-channel \
  /data/code/openclaw/extensions/xiaozhi
```

✅ 已完成

## 步骤 2：安装依赖

```bash
cd /data/code/openclaw
pnpm install
```

注意：网络不稳定时可能需要重试几次

✅ 已完成

## 步骤 3：编译 OpenClaw

```bash
cd /data/code/openclaw
pnpm build
```

注意：如果编译失败（如 A2UI bundle 失败），可以先跳过，不影响 channel 使用

## 步骤 4：生成 Token

使用提供的脚本生成 JWT Token：

```bash
cd /home/hackers365/.openclaw/workspace/xiaozhi-integration
node generate-token.js <user_id_number> <agent_id> <endpoint_id> [expires_in]
```

示例：
```bash
node generate-token.js 1 main agent_main
```

输出：
```
Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Payload: {...}
```

✅ 已生成示例 Token

## 步骤 5：配置 OpenClaw

配置文件位置：`~/.openclaw/openclaw.json`

### 方法一：手动配置

在配置文件末尾添加：

```json
{
  "channels": {
    "xiaozhi": {
      "enabled": true,
      "url": "ws://localhost:8080/ws/openclaw",
      "token": "你的-token",
      "reconnectInterval": 5000,
      "heartbeatInterval": 30000,
      "heartbeatTimeout": 10000,
      "accounts": {
        "default": {
          "enabled": true,
          "url": "ws://localhost:8080/ws/openclaw",
          "token": "你的-token"
        }
      },
      "defaultAccount": "default"
    }
  }
}
```

### 方法二：使用脚本（需要 jq）

```bash
cd /home/hackers365/.openclaw/workspace/xiaozhi-integration
chmod +x apply-config.sh
./apply-config.sh
```

✅ 已完成（使用 Python 自动合并）

## 步骤 6：配置 xiaozhi-esp32-server-golang

在 xiaozhi-esp32-server-golang 项目中配置 WebSocket 端点：

```yaml
websocket:
  xiaozhi:
    enabled: true
    path: "/ws/openclaw"
    jwt_secret: "your-secret-key"  # 必须与 token 生成时的密钥一致
```

## 步骤 7：启动服务

### 7.1 启动 xiaozhi-esp32-server-golang

```bash
./xiaozhi-server --config config.yaml
```

### 7.2 启动 OpenClaw Gateway

```bash
openclaw gateway start
```

## 步骤 8：验证连接

### 8.1 检查 xiaozhi channel 状态

```bash
openclaw status
```

期望看到：
```
Channels:
  xiaozhi (default):
    Status: running
    URL: ws://localhost:8080/ws/openclaw
```

### 8.2 查看日志

```bash
openclaw gateway logs --follow
```

期望看到：
```
[xiaozhi:default] connecting to ws://localhost:8080/ws/openclaw
[xiaozhi:default] connected
[xiaozhi:default] received handshake_ack
[xiaozhi:default] connected (via gateway)
```

### 8.3 测试 WebSocket 连接

使用 wscat 测试：

```bash
wscat -c "ws://localhost:8080/ws/openclaw?token=你的-token"
```

发送消息：
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

### 问题 1：连接失败

**现象：**
```
[xiaozhi:default] connection failed
```

**解决方案：**
1. 检查 xiaozhi-esp32-server-golang 是否启动
2. 检查 URL 是否正确
3. 检查防火墙

```bash
# 测试 WebSocket 端点
curl -I "http://localhost:8080/ws/openclaw"
```

### 问题 2：认证失败

**现象：**
```
[xiaozhi:default] auth failed
```

**解决方案：**
1. 检查 token 是否有效
2. 检查 JWT 密钥是否与 xiaozhi-esp32-server-golang 一致

```bash
# 解码 token
echo "你的-token" | cut -d'.' -f2 | base64 -d | jq .
```

### 问题 3：心跳超时

**现象：**
```
[xiaozhi:default] heartbeat timeout
```

**解决方案：**
1. 检查网络连接
2. 调整 heartbeatInterval 和 heartbeatTimeout

## 配置说明

### 基本配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
| enabled | 是否启用 | false |
| url | WebSocket URL | - |
| token | JWT Token | - |
| reconnectInterval | 重连间隔（毫秒） | 5000 |
| heartbeatInterval | 心跳间隔（毫秒） | 30000 |
| heartbeatTimeout | 心跳超时（毫秒） | 10000 |

### 多账户配置

支持配置多个 xiaozhi 设备：

```json
{
  "channels": {
    "xiaozhi": {
      "accounts": {
        "living-room": {
          "url": "ws://192.168.1.100:8080/ws/openclaw",
          "token": "token-for-living-room"
        },
        "bedroom": {
          "url": "ws://192.168.1.101:8080/ws/openclaw",
          "token": "token-for-bedroom"
        }
      },
      "defaultAccount": "living-room"
    }
  }
}
```

## 文件位置总结

```
/home/hackers365/.openclaw/workspace/xiaozhi-integration/
├── README.md                          # 项目总览
├── INTEGRATION_GUIDE.md              # 详细集成指南
├── INTEGRATION_STEPS.md              # 本文件
├── protocol/
│   └── XIAOZHI_OPENCLAW_PROTOCOL.md # 通信协议
├── generate-token.js                 # Token 生成脚本
├── apply-config.sh                  # 配置应用脚本
└── openclaw-channel/                # Channel 代码
    └── ...

/data/code/openclaw/extensions/xiaozhi/  # 已复制的 Channel
```

## 下一步

1. 在 xiaozhi-esp32-server-golang 项目中实现 WebSocket 服务端
   - 参考：`protocol/XIAOZHI_OPENCLAW_PROTOCOL.md`

2. 测试端到端对话流程

3. 根据需要调整配置参数

## 参考文档

- [通信协议](./protocol/XIAOZHI_OPENCLAW_PROTOCOL.md)
- [集成指南](./INTEGRATION_GUIDE.md)
- [OpenClaw 文档](https://docs.openclaw.ai)

## 支持

- OpenClaw 日志：`openclaw gateway logs --follow`
- 配置检查：`openclaw config get`
- 诊断：`openclaw doctor`
