# XiaoZhi ESP32 与 OpenClaw 集成项目

本项目提供了 xiaozhi-esp32-server-golang 与 OpenClaw Gateway 之间的完整集成方案。

## 项目结构

```
xiaozhi-integration/
├── protocol/                          # 通信协议文档
│   └── XIAOZHI_OPENCLAW_PROTOCOL.md  # WebSocket 通信协议详细规范
├── openclaw-channel/                 # OpenClaw Channel 实现
│   ├── index.ts                      # 插件入口
│   ├── channel.ts                    # Channel 插件主文件
│   ├── client.ts                     # WebSocket 客户端实现
│   ├── monitor.ts                    # 监控和消息路由
│   ├── types.ts                      # TypeScript 类型定义
│   ├── accounts.ts                   # 账户管理
│   ├── config-schema.ts              # 配置模式
│   ├── normalize.ts                  # 目标规范化
│   ├── send.ts                       # 消息发送
│   ├── runtime.ts                    # 运行时接口
│   ├── utils.ts                      # 工具函数
│   ├── package.json                  # 包配置
│   └── openclaw.plugin.json         # 插件元数据
├── INTEGRATION_GUIDE.md             # OpenClaw 集成指南
└── README.md                        # 本文件
```

## 快速开始

### 1. 了解协议

首先阅读 [通信协议文档](./protocol/XIAOZHI_OPENCLAW_PROTOCOL.md)，了解 WebSocket 消息格式和交互流程。

### 2. 集成到 OpenClaw

按照 [集成指南](./INTEGRATION_GUIDE.md) 的步骤：

1. 复制 `openclaw-channel` 目录到 OpenClaw 扩展目录
2. 配置 OpenClaw Gateway
3. 启动服务

### 3. 实现 xiaozhi-esp32-server-golang 端

根据协议文档在 xiaozhi-esp32-server-golang 项目中实现：

- `/ws/openclaw` WebSocket 端点
- Token 验证（JWT 解析）
- 消息处理（message、ping/pong、response 等）
- ESP32 设备通信

## 核心功能

### 通信协议

- ✅ WebSocket 双向通信
- ✅ JWT Token 认证
- ✅ 消息类型：handshake、message、response、ping/pong、error、close
- ✅ 心跳机制
- ✅ 自动重连

### OpenClaw Channel

- ✅ 完整的 Channel 插件实现
- ✅ WebSocket 客户端（带重连和心跳）
- ✅ 消息路由和处理
- ✅ 会话管理
- ✅ 多账户支持
- ✅ 状态监控

### 消息流

```
ESP32 设备
    ↓ (语音)
xiaozhi-esp32-server-golang
    ↓ (STT → 文本 → WebSocket message)
OpenClaw Gateway (xiaozhi channel)
    ↓ (转发到 Agent)
AI Agent
    ↓ (生成回复)
OpenClaw Gateway
    ↓ (WebSocket response)
xiaozhi-esp32-server-golang
    ↓ (TTS → 音频)
ESP32 设备 (播放)
```

## 配置示例

### OpenClaw 配置

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

### xiaozhi-esp32-server-golang 配置

```yaml
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
```

## Token 生成

### JWT Payload

```json
{
  "user_id": 1,
  "agent_id": "main",
  "endpoint_id": "agent_main",
  "purpose": "openclaw-endpoint"
}
```

### 生成示例

```javascript
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    user_id: 1,
    agent_id: 'main',
    endpoint_id: 'agent_main',
    purpose: 'openclaw-endpoint',
  },
  'your-secret-key',
  {}
);
console.log(token);
```

## 文档

- [通信协议文档](./protocol/XIAOZHI_OPENCLAW_PROTOCOL.md) - 详细的 WebSocket 通信协议
- [集成指南](./INTEGRATION_GUIDE.md) - 如何在 OpenClaw 中集成此 channel

## 技术栈

- **OpenClaw Channel**: TypeScript
- **WebSocket**: ws (Node.js)
- **认证**: JWT
- **协议**: JSON over WebSocket

## 特性

- 🔒 安全：JWT Token 认证
- 💪 可靠：自动重连 + 心跳检测
- 🔌 可扩展：支持多账户、多设备
- 📝 可观测：完整的日志和状态监控
- 🎯 简单：简洁的协议和 API

## 待实现功能

以下是当前未完全实现的功能，需要后续完善：

1. **OpenClaw 集成点完善**
   - `processMessage` 需要实际对接 OpenClaw Gateway 的消息处理
   - `registerOutboundHandler` 需要实际注册到 Gateway
   - `getConnection` 需要从 Gateway 运行时获取连接

2. **OpenClaw CLI 工具**
   - `openclaw xiaozhi token generate` - 生成 token
   - `openclaw xiaozhi token verify` - 验证 token
   - `openclaw xiaozhi status` - 查看 channel 状态

3. **测试**
   - 单元测试
   - 集成测试
   - 端到端测试

4. **会话持久化**
   - Session ID 存储和恢复
   - 会话历史查询

5. **TTS/STT 集成**
   - 音频格式支持（如果未来需要）

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 版本

v1.0.0 - 2026-02-28

- 初始版本
- 基础 WebSocket 通信协议
- OpenClaw Channel 实现
