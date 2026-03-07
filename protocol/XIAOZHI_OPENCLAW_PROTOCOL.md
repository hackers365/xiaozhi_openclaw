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
| `response` | OpenClaw → xiaozhi | AI 响应（文本，支持流式分片与结束标志） |
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

#### 3.3.1 Agent 选择与绑定（由 xiaozhi 控制）

默认情况下，OpenClaw 按自身路由规则选择 agent。

如果 xiaozhi 需要指定 agent 并进行设备级绑定，可在 `message.payload.metadata` 中携带：

| 字段 | 类型 | 说明 |
|------|------|------|
| openclaw_agent_id | string | 指定本次消息使用的 OpenClaw agent，并自动绑定到该 device |

说明：

- 绑定维度：`account + device_id`
- 绑定后，后续未显式指定 agent 的消息会优先使用绑定 agent

示例（指定并绑定到 `weather_assistant`）：

```json
{
  "id": "msg-001",
  "timestamp": 1737264002000,
  "type": "message",
  "payload": {
    "content": "帮我查下今天杭州天气",
    "metadata": {
      "openclaw_agent_id": "weather_assistant"
    }
  }
}
```

#### 3.3.2 流式回复开关（由 xiaozhi 控制）

默认情况下，OpenClaw 对该协议使用**非流式回复**（兼容旧逻辑）。

如果 xiaozhi 需要启用流式分片回复，请在 `message.payload.metadata` 中显式设置：

- 唯一开关：`stream: true`

示例（启用流式）：

```json
{
  "id": "msg-001",
  "timestamp": 1737264002000,
  "type": "message",
  "payload": {
    "content": "帮我查询库存并汇总。",
    "session_id": "session-abc",
    "metadata": {
      "stream": true
    }
  }
}
```

### 3.4 response - AI 响应

**方向：** OpenClaw → xiaozhi

```json
{
  "id": "resp-001",
  "timestamp": 1737264003000,
  "type": "response",
  "correlation_id": "msg-001",
  "payload": {
    "content": "正在查询中，请稍候...",
    "session_id": "session-abc",
    "metadata": {
      "stream_id": "stream-001",
      "seq": 1,
      "done": false,
      "phase": "chunk"
    }
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| correlation_id | string | 是 | 对应的消息 ID |
| content | string | 是* | AI 响应内容（纯文本）；当 `metadata.done=true` 时可为空字符串作为结束帧 |
| session_id | string | 否 | 会话 ID |
| metadata | object | 否 | 元数据（可包含 `agent_id`，流式场景见下文） |

非流式（默认）：

- OpenClaw 返回单条 `response`
- `metadata` 可为空，不包含 `stream_id/seq/done`

#### 3.4.1 response 流式分片与结束规则

当且仅当 xiaozhi 在 `message.payload.metadata` 中显式开启流式时，OpenClaw 才会针对同一 `correlation_id` 连续发送多个 `response`。

推荐在 `payload.metadata` 中携带以下字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| agent_id | string | 否 | 本次回复实际使用的 OpenClaw agent |
| stream_id | string | 否 | 流 ID；同一轮回复的所有分片保持一致 |
| seq | number | 否 | 分片序号，从 1 递增 |
| done | boolean | 否 | 是否结束分片。`true` 表示该轮回复已结束 |
| phase | string | 否 | 分片阶段，推荐值：`chunk` / `final` |
| reason | string | 否 | 结束原因（仅 `done=true` 时建议携带）：`complete` / `error` |

流式建议：

1. 中间分片：`done=false`，`phase=chunk`，`content` 为可播报文本  
2. 结束分片：`done=true`，`phase=final`，建议携带 `reason`  
3. 若结束分片仅用于通知结束，可发送空 `content`（`""`）  
4. 接收端以 `done=true` 作为一轮回复结束标志，而不是依赖超时或连接关闭

示例（同一 `correlation_id`）：

```json
{
  "id": "resp-001",
  "timestamp": 1737264003000,
  "type": "response",
  "correlation_id": "msg-001",
  "payload": {
    "content": "我正在执行任务，请稍候。",
    "session_id": "session-abc",
    "metadata": { "stream_id": "stream-001", "seq": 1, "done": false, "phase": "chunk" }
  }
}
```

```json
{
  "id": "resp-002",
  "timestamp": 1737264006000,
  "type": "response",
  "correlation_id": "msg-001",
  "payload": {
    "content": "任务进行中，预计还需要几秒。",
    "session_id": "session-abc",
    "metadata": { "stream_id": "stream-001", "seq": 2, "done": false, "phase": "chunk" }
  }
}
```

```json
{
  "id": "resp-003",
  "timestamp": 1737264009000,
  "type": "response",
  "correlation_id": "msg-001",
  "payload": {
    "content": "",
    "session_id": "session-abc",
    "metadata": { "stream_id": "stream-001", "seq": 3, "done": true, "phase": "final", "reason": "complete" }
  }
}
```

#### 3.4.2 接收端解析建议（xiaozhi）

推荐接收端按以下顺序解析 `response`：

1. 仅处理 `type=response` 消息；用 `correlation_id` 归并同一轮问答
2. 优先保存 `payload.session_id`，用于下一轮请求复用上下文
3. 判断是否流式分片（`metadata` 中出现任一字段：`stream_id` / `seq` / `done` / `phase`）
4. 非流式：将 `content` 作为最终回复处理即可
5. 流式：按 `(correlation_id, stream_id)` 维护缓冲区，按 `seq` 递增拼接文本，`done=true` 结束本轮

解析注意点：

- 结束分片可为 `content=""`，这是合法结束帧，不应视为异常
- `done=true` 只表示“流结束”，不代表还有一条“全量正文”会再次发送
- 若收到重复或乱序分片，建议按 `seq` 去重（`seq <= lastSeq` 可忽略）

示例伪代码：

```ts
type StreamState = { text: string; lastSeq: number };
const streams = new Map<string, StreamState>();

function onResponse(msg: any) {
  const cid = String(msg.correlation_id || "");
  const payload = msg.payload || {};
  const md = payload.metadata || {};
  const content = String(payload.content || "");
  const sessionId = payload.session_id;
  if (sessionId) saveSessionId(sessionId);

  const isStream =
    typeof md.stream_id === "string" ||
    typeof md.seq === "number" ||
    typeof md.done === "boolean" ||
    md.phase === "chunk" ||
    md.phase === "final";

  if (!isStream) {
    handleFinalText(cid, content);
    return;
  }

  const key = `${cid}:${md.stream_id || "default"}`;
  const st = streams.get(key) || { text: "", lastSeq: 0 };
  const seq = typeof md.seq === "number" ? md.seq : st.lastSeq + 1;
  if (seq <= st.lastSeq) return;

  if (content) {
    st.text += content;
    handleChunkText(cid, content);
  }

  st.lastSeq = seq;
  streams.set(key, st);

  if (md.done === true) {
    handleStreamDone(cid, st.text, md.reason || "complete");
    streams.delete(key);
  }
}
```

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

8. OpenClaw 默认发送单条 response（非流式）
   {
     "id": "resp-001",
     "type": "response",
     "correlation_id": "msg-001",
     "payload": {
       "content": "今天是晴天，温度25度，适合出门。",
       "session_id": "xiaozhi-user-123-esp32-001-1737264000000"
     }
   }

9. xiaozhi 接收响应并执行 TTS（如果需要）
```

### 5.2 流式回复流程（可选，需 xiaozhi 显式开启）

```
1. xiaozhi 发送 message，并带 stream 开关
   {
     "id": "msg-001",
     "type": "message",
     "payload": {
       "content": "执行一个长耗时任务",
       "metadata": { "stream": true }
     }
   }

2. OpenClaw 发送 response（可多分片）
   {
     "id": "resp-001",
     "type": "response",
     "correlation_id": "msg-001",
     "payload": {
       "content": "正在执行任务，请稍候。",
       "session_id": "xiaozhi-user-123-esp32-001-1737264000000",
       "metadata": { "stream_id": "stream-001", "seq": 1, "done": false, "phase": "chunk" }
     }
   }

   ...（中间可继续发送多条 response）

   {
     "id": "resp-003",
     "type": "response",
     "correlation_id": "msg-001",
     "payload": {
       "content": "",
       "session_id": "xiaozhi-user-123-esp32-001-1737264000000",
       "metadata": { "stream_id": "stream-001", "seq": 3, "done": true, "phase": "final", "reason": "complete" }
     }
   }

9. xiaozhi 接收响应
   - `done=false` 分片可执行 TTS（如果需要）
   - 收到 `done=true` 结束本轮回复等待
   - 发送到 ESP32 设备播放
```

### 5.3 心跳流程

```
1. 每 30 秒，OpenClaw 发送 ping
   { "type": "ping", "payload": { "seq": 1 } }

2. xiaozhi 在 10 秒内回复 pong
   { "type": "pong", "correlation_id": "<ping-id>", "payload": { "seq": 1 } }
```

### 5.4 错误处理流程

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
- 从 token 中提取 user_id、agent_id（默认 agent）；若业务允许，可由 `message.metadata.openclaw_agent_id` 覆盖并绑定

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
            // 处理 AI 响应分片，读取 payload.metadata.done 判断是否结束
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
| 1.3.1 | 2026-03-07 | 补充 response 流式接收端解析建议（分片拼接、done 结束、seq 去重） |
| 1.3.0 | 2026-03-06 | 支持 xiaozhi 通过 metadata 自定义 OpenClaw agent，并按 device 绑定/解绑 |
| 1.2.0 | 2026-03-05 | 默认非流式；由 xiaozhi 通过 message.metadata 显式控制是否开启流式 |
| 1.1.0 | 2026-03-05 | 新增 response 流式分片与 done 结束标志约定 |
| 1.0.0 | 2026-02-28 | 初始版本 |
