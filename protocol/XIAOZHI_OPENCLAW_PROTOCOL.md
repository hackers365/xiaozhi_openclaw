# xiaozhi-esp32-server-golang 与 OpenClaw WebSocket 通信协议

## 概述

本协议定义了 xiaozhi-esp32-server-golang 与 OpenClaw Gateway 之间的 WebSocket 通信规范。

- **xiaozhi-esp32-server-golang**：WebSocket 服务端
- **OpenClaw Gateway**：WebSocket 客户端

## 1. 连接

### 1.1 连接端点

```
ws://<host>:<port>/ws/openclaw?token=<token>
```

### 1.2 URL 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| token | string | 是 | JWT token，包含用户和智能体信息 |

### 1.3 Token 格式

Token 应为 JWT 格式，推荐直接使用小智服务端 endpoint 接口返回的 token。当前服务端 claims 使用 snake_case：

```json
{
  "user_id": 1,
  "agent_id": "main",
  "endpoint_id": "agent_main",
  "purpose": "openclaw-endpoint"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | number | 是 | 用户 ID |
| agent_id | string | 是 | 智能体 ID |
| endpoint_id | string | 是 | endpoint 标识（通常 `agent_<agentId>`） |
| purpose | string | 否 | 建议固定为 `openclaw-endpoint` |
| exp/iat | number | 否 | 若调用方自行签发 token，可选携带 |

### 1.4 连接流程

```
1. OpenClaw 建立连接：ws://<host>:<port>/ws/openclaw?token=<token>
2. xiaozhi 验证 token，验证通过则接受连接
3. xiaozhi 发送 handshake_ack
4. OpenClaw 发送 handshake
5. 双方进入消息通信阶段
```

## 2. 消息格式

### 2.1 通用信封

所有消息都使用以下 JSON 格式：

```json
{
  "id": "uuid-v4",
  "timestamp": 1737264000000,
  "type": "消息类型",
  "payload": {}
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 消息唯一标识（UUID v4） |
| timestamp | number | 是 | 时间戳（毫秒） |
| type | string | 是 | 消息类型 |
| payload | object | 是 | 消息内容 |

### 2.2 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| `handshake` | OpenClaw → xiaozhi | 连接握手 |
| `handshake_ack` | xiaozhi → OpenClaw | 握手确认（连接建立时立即发送） |
| `message` | xiaozhi → OpenClaw | 用户消息（文本） |
| `response` | OpenClaw → xiaozhi | AI 响应（文本） |
| `ping` | 双向 | 心跳 |
| `pong` | 双向 | 心跳响应 |
| `error` | 双向 | 错误消息 |
| `close` | 双向 | 关闭连接 |

## 3. 消息定义

### 3.1 handshake - 握手

**方向：** OpenClaw → xiaozhi

```json
{
  "id": "handshake-001",
  "timestamp": 1737264000000,
  "type": "handshake",
  "payload": {
    "version": "1.0.0",
    "client": "openclaw-gateway",
    "capabilities": ["text"]
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| version | string | 协议版本 |
| client | string | 客户端标识 |
| capabilities | array<string> | 支持的能力（目前只有 "text"） |

### 3.2 handshake_ack - 握手确认

**方向：** xiaozhi → OpenClaw

**说明：** 连接建立后立即发送，无需等待 handshake。

```json
{
  "id": "handshake-ack-001",
  "timestamp": 1737264000000,
  "type": "handshake_ack",
  "payload": {
    "version": "1.0.0",
    "server": "xiaozhi-esp32-server"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| version | string | 协议版本 |
| server | string | 服务端标识 |

### 3.3 message - 用户消息

**方向：** xiaozhi → OpenClaw

```json
{
  "id": "msg-001",
  "timestamp": 1737264002000,
  "type": "message",
  "payload": {
    "content": "今天天气怎么样？",
    "session_id": "session-abc",
    "metadata": {}
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | 是 | 用户消息内容（纯文本） |
| session_id | string | 否 | 会话 ID（用于保持上下文） |
| metadata | object | 否 | 元数据 |

### 3.4 response - AI 响应

**方向：** OpenClaw → xiaozhi

```json
{
  "id": "resp-001",
  "timestamp": 1737264003000,
  "type": "response",
  "correlation_id": "msg-001",
  "payload": {
    "content": "今天是晴天，温度25度，适合出门。",
    "session_id": "session-abc",
    "metadata": {}
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| correlation_id | string | 是 | 对应的消息 ID |
| content | string | 是 | AI 响应内容（纯文本） |
| session_id | string | 否 | 会话 ID |
| metadata | object | 否 | 元数据 |

### 3.5 ping/pong - 心跳

**方向：** 双向

**ping：**

```json
{
  "id": "ping-001",
  "timestamp": 1737264000000,
  "type": "ping",
  "payload": {
    "seq": 1
  }
}
```

**pong：**

```json
{
  "id": "pong-001",
  "timestamp": 1737264000000,
  "type": "pong",
  "correlation_id": "ping-001",
  "payload": {
    "seq": 1
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| seq | number | 是 | 序列号 |
| correlation_id | string | 是 | pong 中对应 ping 的 id |

**心跳机制：**

- 发送方每 30 秒发送一次 ping
- 接收方应在 10 秒内回复 pong
- 如果超过 3 次心跳未响应，应关闭连接

### 3.6 error - 错误消息

**方向：** 双向

```json
{
  "id": "error-001",
  "timestamp": 1737264000000,
  "type": "error",
  "correlation_id": "msg-001",
  "payload": {
    "code": "INVALID_MESSAGE",
    "message": "Invalid message format"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| correlation_id | string | 否 | 关联的消息 ID（如果有） |
| code | string | 是 | 错误码 |
| message | string | 是 | 错误描述 |

**错误码列表：**

| 错误码 | 说明 |
|--------|------|
| INVALID_MESSAGE | 消息格式无效 |
| AUTH_FAILED | 认证失败 |
| UNAUTHORIZED | 未授权 |
| RATE_LIMITED | 速率限制 |
| INTERNAL_ERROR | 内部错误 |
| SESSION_NOT_FOUND | 会话不存在 |

### 3.7 close - 关闭连接

**方向：** 双向

```json
{
  "id": "close-001",
  "timestamp": 1737264000000,
  "type": "close",
  "payload": {
    "reason": "normal_shutdown",
    "code": 1000
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| reason | string | 否 | 关闭原因 |
| code | number | 是 | WebSocket 关闭码 |

## 4. 会话管理

### 4.1 Session ID 生成规则

Session ID 由 OpenClaw Gateway 负责生成和管理。

格式：`xiaozhi-{user_id}-{device_id}-{timestamp}`

示例：`xiaozhi-user-123-esp32-001-1737264000000`

### 4.2 会话生命周期

1. 首次连接时，OpenClaw 生成新的 session_id
2. 在 response 中返回 session_id
3. xiaozhi 保存 session_id，后续消息中带上
4. 如果 WebSocket 断开重连，可以复用或生成新的 session_id

## 5. 工作流程示例

### 5.1 完整对话流程

```
1. OpenClaw 连接
   ws://xiaozhi-host:8080/ws/openclaw?token=<jwt>

2. xiaozhi 发送 handshake_ack
   {
     "id": "...",
     "type": "handshake_ack",
     "payload": { "version": "1.0.0", "server": "xiaozhi-esp32-server" }
   }

3. OpenClaw 发送 handshake
   {
     "id": "...",
     "type": "handshake",
     "payload": { "version": "1.0.0", "client": "openclaw-gateway", "capabilities": ["text"] }
   }

4. 用户在设备上说话："今天天气怎么样？"

5. ESP32 → xiaozhi-esp32-server-golang（语音数据）
   xiaozhi-esp32-server-golang 执行 STT，得到文字

6. xiaozhi 发送 message
   {
     "id": "msg-001",
     "type": "message",
     "payload": { "content": "今天天气怎么样？" }
   }

7. OpenClaw Gateway 处理消息
   - 调用 Agent
   - Agent 返回响应

8. OpenClaw 发送 response
   {
     "id": "resp-001",
     "type": "response",
     "correlation_id": "msg-001",
     "payload": {
       "content": "今天是晴天，温度25度，适合出门。",
       "session_id": "xiaozhi-user-123-esp32-001-1737264000000"
     }
   }

9. xiaozhi 接收响应
   - 执行 TTS（如果需要）
   - 发送到 ESP32 设备播放
```

### 5.2 心跳流程

```
1. 每 30 秒，OpenClaw 发送 ping
   { "type": "ping", "payload": { "seq": 1 } }

2. xiaozhi 在 10 秒内回复 pong
   { "type": "pong", "correlation_id": "<ping-id>", "payload": { "seq": 1 } }
```

### 5.3 错误处理流程

```
1. xiaozhi 收到无效消息

2. 发送 error
   {
     "type": "error",
     "correlation_id": "<invalid-msg-id>",
     "payload": {
       "code": "INVALID_MESSAGE",
       "message": "Missing required field: type"
     }
   }

3. OpenClaw 收到 error，记录日志并继续
```

## 6. 安全考虑

### 6.1 Token 验证

- xiaozhi-esp32-server-golang 必须验证 token 的签名
- 若存在 exp 字段则验证过期时间
- 从 token 中提取 user_id、agent_id（设备路由来自消息 metadata.device_id）

### 6.2 速率限制

建议在 xiaozhi-esp32-server-golang 中实现：

- 单连接消息速率限制（如每秒 10 条）
- 单用户全局速率限制

### 6.3 连接限制

- 单用户最多 1 个活动连接（一对一）
- 同一设备 ID 只允许一个连接

## 7. 实现建议

### 7.1 xiaozhi-esp32-server-golang 端

```go
// WebSocket 处理器示例
func (s *Server) handleOpenClawWS(c *gin.Context) {
    // 1. 获取并验证 token
    token := c.Query("token")
    claims, err := s.validateToken(token)
    if err != nil {
        c.JSON(401, gin.H{"error": "unauthorized"})
        return
    }

    // 2. 升级到 WebSocket
    conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
    if err != nil {
        log.Error("WebSocket upgrade failed", err)
        return
    }
    defer conn.Close()

    // 3. 立即发送 handshake_ack
    handshakeAck := WSMessage{
        ID:        generateUUID(),
        Timestamp: time.Now().UnixMilli(),
        Type:      "handshake_ack",
        Payload: map[string]interface{}{
            "version": "1.0.0",
            "server":  "xiaozhi-esp32-server",
        },
    }
    sendMessage(conn, handshakeAck)

    // 4. 启动消息循环
    for {
        var msg WSMessage
        if err := conn.ReadJSON(&msg); err != nil {
            log.Error("Read error", err)
            break
        }

        switch msg.Type {
        case "handshake":
            // 记录握手信息
        case "ping":
            sendPong(conn, msg)
        case "response":
            // 处理 AI 响应，转发到设备
            s.handleResponse(claims.DeviceID, msg.Payload)
        default:
            log.Warn("Unknown message type", msg.Type)
        }
    }
}
```

### 7.2 OpenClaw Gateway 端

见 OpenClaw Channel 实现代码。

## 8. 附录

### 8.1 WebSocket 子协议

不使用子协议，使用纯文本 JSON 消息。

### 8.2 错误码参考

参考 RFC 6455 WebSocket 关闭码：

| 码 | 说明 |
|----|------|
| 1000 | 正常关闭 |
| 1001 | 端点离开 |
| 1002 | 协议错误 |
| 1003 | 不支持的数据类型 |
| 1006 | 连接异常关闭 |
| 1011 | 内部错误 |

### 8.3 测试用例

详见 OpenClaw Channel 测试文件。

## 9. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-02-28 | 初始版本 |
