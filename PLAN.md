# Pi Agent Web Server — 实施计划

> 目标：用 Rust Pi (pi_agent_rust) 替换现有 OpenCode Web，实现 `https://aqsk.top:4443/` 同等的 Web 访问体验。

## 一、核心架构决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Wrapper 语言 | **Rust** (axum) | 与 pi_agent_rust 同生态，零依赖部署，agent-discord-rs 已验证此模式 |
| Pi 集成方式 | **子进程 RPC** (`pi --mode rpc`) | 与 agent-discord-rs 一致，pi 无内置 SDK，只能走 stdin/stdout JSONL |
| Web 框架 | **axum** (tokio) | 架构现代、模块化，用户指定 |
| SPA 前端 | **pi-web-ui 组件 + Vite** | 复用 Lit web components，已有的 ChatPanel/AgentInterface/ArtifactsPanel |
| 构建 | **GitHub Actions** CI | 不在服务器上编译（遵循 CUSTOM_OPENCODE_MAINTENANCE 原则） |
| 仓库 | 多仓库 | pi_rust (fork) + pi-web (wrapper + SPA) |

### 架构图

```
浏览器 ── Nginx :4443 (Basic Auth, 已有) ──▶ axum HTTP Server (pi-web)
                                                  │
                                                  ├── REST API
                                                  │   ├── POST /api/session        创建会话
                                                  │   ├── GET  /api/session        列出会话
                                                  │   ├── POST /api/session/:id/message  发送消息
                                                  │   ├── GET  /api/session/:id/message  获取历史
                                                  │   ├── POST /api/session/:id/abort    中断
                                                  │   ├── POST /api/session/:id/model    切换模型
                                                  │   ├── DELETE /api/session/:id        删除会话
                                                  │   ├── GET  /api/event           SSE 事件流
                                                  │   └── GET  /api/config          配置
                                                  │
                                                  ├── Session Manager (PiAgent pool)
                                                  │   ├── PiAgent: pi --mode rpc (session A)
                                                  │   ├── PiAgent: pi --mode rpc (session B)
                                                  │   └── ...
                                                  │
                                                  └── Static files (SPA dist/)
```

## 二、参考项目

### 2.1 核心参考：agent-discord-rs
- **地址**：crates.io/agent-discord-rs (darkautism)
- **关键模式**：
  - `PiAgent` 封装 `pi --mode rpc` 子进程
  - stdin 通过 `Arc<Mutex<ChildStdin>>` 串行写入
  - 后台 tokio task 逐行读取 stdout JSONL
  - broadcast channel 分发事件给多个消费者
  - Drop 时 SIGKILL 清理子进程
- **使用参考**：`src/agent/pi.rs`, `src/agent/mod.rs`

### 2.2 前端组件：earendil-works/pi-web-ui
- **地址**：npm `@earendil-works/pi-web-ui`
- **核心组件**：`ChatPanel`, `AgentInterface`, `ArtifactsPanel`
- **关键**：替换 `Agent.streamFn` → HTTP backend，保持组件和事件接口不变

### 2.3 上游：Dicklesworthstone/pi_agent_rust
- **fork**：Ruler4396/pi_rust (已 clone 到 `/root/dev/pi_rust`)
- **RPC 协议**：JSONL stdin/stdout, 20+ 命令, 15+ 事件
- **二进制大小**：~21MB release

## 三、项目结构

```
/root/dev/pi-web/                  (Ruler4396/pi-web)
├── PLAN.md                        ← 本文件
├── Cargo.toml
├── Cargo.lock
├── src/
│   ├── main.rs                    # 入口，启动 axum server
│   ├── config.rs                  # 环境变量 / 配置文件解析
│   ├── auth.rs                    # 认证中间件 (Basic auth token 校验)
│   ├── pi/
│   │   ├── mod.rs
│   │   ├── agent.rs               # PiAgent: 进程管理 + stdin/stdout JSONL
│   │   ├── protocol.rs            # RPC 命令/响应/事件类型定义
│   │   └── manager.rs             # SessionManager: HashMap<session_id, PiAgent>
│   ├── api/
│   │   ├── mod.rs                 # 路由注册
│   │   ├── session.rs             # 会话 CRUD handler
│   │   ├── message.rs             # 消息发送 handler (含 SSE 流)
│   │   ├── config.rs              # 配置 handler
│   │   └── event.rs               # SSE 事件推送 handler
│   └── embed.rs                   # rust-embed: 嵌入 SPA dist/
├── spa/                           # SPA 前端 (Vite + pi-web-ui)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.ts                # 入口
│   │   ├── http-agent.ts          # HttpAgent: 替代 Agent, 通过 HTTP 通信
│   │   ├── pages/
│   │   │   ├── session-list.ts    # 会话列表页
│   │   │   └── session-chat.ts    # 聊天页
│   │   └── app.css
│   └── dist/                      # 构建产物 (gitignore)
├── deploy/
│   ├── nginx-snippet.conf         # Nginx 4433 配置片段
│   └── pi-web.service             # systemd unit
└── .github/
    └── workflows/
        └── deploy.yml             # CI: 编译 Rust → 构建 SPA → 打包 artifact
```

## 四、实施阶段

### Phase 1：基础环境 ✅（已完成）
- [x] Fork pi_agent_rust → Ruler4396/pi_rust → clone 到 `/root/dev/pi_rust`
- [x] 删除 /root/dev/pi (TS 版 pi)
- [x] 创建 /root/dev/pi-web 目录
- [x] 保存 web-ui 源码到 `/root/dev/pi_web_ui_ref/` 供参考

### Phase 2：Rust 项目骨架 (进行中)
- [ ] Cargo.toml: axum, tokio, serde, serde_json, uuid, tracing, rust-embed
- [ ] src/main.rs: axum Router + shutdown signal
- [ ] src/config.rs: PI_BINARY_PATH, PI_SESSIONS_DIR, PORT, AUTH_TOKEN
- [ ] src/embed.rs: 嵌入 spa/dist/

### Phase 3：PiAgent 进程管理
- [ ] src/pi/protocol.rs: 类型定义
  ```rust
  struct RpcCommand { type: String, id: String, message: Option<String>, ... }
  enum AgentEvent { MessageStart, MessageUpdate, MessageEnd, ToolStart, ... }
  ```
- [ ] src/pi/agent.rs: PiAgent 实现
  ```rust
  struct PiAgent {
      child: Child,
      stdin: Arc<Mutex<ChildStdin>>,
      event_tx: broadcast::Sender<AgentEvent>,
  }
  impl PiAgent {
      fn new(session_file: &Path) -> Self { ... }   // spawn pi --mode rpc
      fn send_command(&self, cmd: Value) -> String  // write JSON line to stdin
      fn event_rx(&self) -> broadcast::Receiver<AgentEvent>
  }
  ```
- [ ] src/pi/manager.rs: SessionManager
  ```rust
  struct SessionManager {
      agents: RwLock<HashMap<String, Arc<PiAgent>>>,
      config: Config,
  }
  impl SessionManager {
      fn get_or_create(&self, session_id: &str) -> Arc<PiAgent>
      fn list_sessions(&self) -> Vec<SessionInfo>
      fn remove(&self, session_id: &str)
  }
  ```

### Phase 4：HTTP API
- [ ] src/auth.rs: 认证中间件
  ```rust
  async fn auth_middleware(req: Request, next: Next) -> Response {
      // 检查 Authorization: Basic <token>
      // 公开路径跳过: /api/health
  }
  ```
- [ ] src/api/mod.rs: 路由注册
  ```rust
  Router::new()
      .route("/api/health", ...)
      .route("/api/session", get(list).post(create))
      .route("/api/session/:id", get(info).delete(delete))
      .route("/api/session/:id/message", get(messages).post(send))
      .route("/api/session/:id/abort", post(abort))
      .route("/api/session/:id/model", post(set_model))
      .route("/api/event", get(event_stream))
      .route("/api/config", get(config))
      .route("/api/model", get(models))
      .fallback(get(spa_fallback))  // 非 /api/* 返回 SPA
  ```
- [ ] src/api/message.rs: SSE 流式传输
  ```rust
  async fn send(State(state): State<AppState>, Path(id): Path<String>, Json(body): Json<PromptBody>) -> Sse<...> {
      let agent = state.sessions.get_or_create(&id);
      agent.send_command(json!({"type":"prompt", "message": body.message, ...}));
      // 读取 broadcast::Receiver → 逐条 yield SSE events
      Sse::new(stream! {
          while let Ok(event) = rx.recv().await {
              yield Ok(Event::default().data(...));
          }
      })
  }
  ```

### Phase 5：SPA 前端
- [ ] spa/package.json: 依赖 pi-web-ui, vite, typescript
- [ ] spa/index.html: 入口 HTML
- [ ] spa/src/http-agent.ts: 自定义 Agent 实现
  ```ts
  class HttpAgent {
    state = { messages: [], isStreaming: false, ... }
    async prompt(message: string) {
      const res = await fetch(`/api/session/${id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      // 读取 SSE 流 → 触发 subscribe 回调
      const reader = res.body.getReader()
      // 逐行解析 SSE → emit events
    }
    subscribe(event: string, fn: Function)
    abort() { await fetch(`/api/session/${id}/abort`, { method: 'POST' }) }
  }
  ```
- [ ] spa/src/pages/session-list.ts: 会话列表
- [ ] spa/src/pages/session-chat.ts: 聊天页 (使用 ChatPanel 组件)
- [ ] spa/vite.config.ts: 生产构建 + dev proxy

### Phase 6：CI + 部署
- [ ] .github/workflows/deploy.yml:
  ```yaml
  build:
    - checkout pi-web repo
    - setup Node.js → npm ci → npm run build (SPA)
    - setup Rust nightly → cargo build --release (pi-web wrapper)
    - 打包 pi-web 二进制 + spa/dist/ → artifact
  ```
- [ ] deploy/nginx-snippet.conf (替换 opencode-4443):
  ```nginx
  location / {
      proxy_pass http://127.0.0.1:3000;
      auth_basic "Restricted";
      auth_basic_user_file /etc/nginx/.htpasswd;
      proxy_set_header Authorization "Basic <内部token>";
  }
  location /api/event {
      proxy_pass http://127.0.0.1:3000;
      proxy_buffering off;
      proxy_read_timeout 24h;
  }
  ```
- [ ] deploy/pi-web.service: systemd unit

### Phase 7：迁移对齐
- [ ] 同步 wiki / memory / skills 到 Rust Pi 目录结构
- [ ] Nginx 改路由：opencode-web → pi-web
- [ ] 验证 DeepSeek 模型可用 (`pi --model ...`)
- [ ] 回滚方案：切换回 opencode-web.service

## 五、API 面 (精简自 OpenCode Web 的 80+ 端点)

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/health` | GET | 健康检查 (无需认证) |
| `/api/session` | GET | 列出所有会话 |
| `/api/session` | POST | 创建新会话 |
| `/api/session/:id` | GET | 会话详情 |
| `/api/session/:id` | DELETE | 删除会话 |
| `/api/session/:id/message` | GET | 获取历史消息 |
| `/api/session/:id/message` | POST | 发送消息 (SSE 流式返回) |
| `/api/session/:id/abort` | POST | 中断生成 |
| `/api/session/:id/model` | POST | 切换模型 |
| `/api/event` | GET | SSE 实例事件流 |
| `/api/config` | GET | 配置信息 |
| `/api/model` | GET | 可用模型列表 |
| `/*` | GET | SPA 静态文件 (fallback) |

## 六、Cargo 依赖

```toml
[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
tracing = "0.1"
tracing-subscriber = "0.3"
rust-embed = "8"
tower-http = { version = "0.6", features = ["cors"] }
```

## 七、关键风险

| 风险 | 应对 |
|------|------|
| pi 进程崩溃 | PiAgent 监听取消失败，自动重启 |
| 并发会话过多 | 空闲超时 5min kill + 最大并发 20 |
| SSE 连接断开 | 前端自动重连 |
| Rust nightly 依赖 | CI 使用 rust-toolchain.toml 指定 nightly |
| 服务器无 Rust 编译环境 | CI 构建，服务器只下载 artifact |
| DeepSeek API 兼容性 | pi_agent_rust 已支持 DeepSeek 作为 provider |

## 八、核心参考文档库

### 8.1 基础环境与核心接口

| 类别 | 文档/项目 | 核心价值 | 地址 |
|------|----------|---------|------|
| 异步运行时 | Tokio 官方文档 | Rust 异步编程基石，理解 axum 的前提 | [docs.rs/tokio](https://docs.rs/tokio) |
| 模型 API | DeepSeek Rust 客户端 | 项目成败关键。参考 `deepseek_rs`、`ds-api` 等库实现稳定对接 | [docs.rs/deepseek_rs](https://docs.rs/deepseek_rs) |

### 8.2 业务逻辑与底层依赖

| 类别 | 文档/项目 | 核心价值 | 地址 |
|------|----------|---------|------|
| Pi Rust 官方 | pi_agent_rust | 项目主库，提供 Agent 最上层接口。本地路径: `/root/dev/pi_rust` | [github.com/Dicklesworthstone/pi_agent_rust](https://github.com/Dicklesworthstone/pi_agent_rust) |
| Pi 设计原理 | 设计解析文章 | 深入理解 Pi 极简且强大的设计哲学 | 知乎/百度开发者中心搜索"Pi Agent 设计逻辑" |
| Agent 核心逻辑 | pi-agent (crate) | 封装 Agent 对话循环 (`Agent::run`) 和工具系统 | [docs.rs/pi-agent](https://docs.rs/pi-agent) |
| 统一模型接口 | pi-ai (crate) | 为 DeepSeek 等模型提供统一的调用接口 | [docs.rs/pi-ai](https://docs.rs/pi-ai) |
| 文件操作增强 | aft-pi (npm) | 高性能文件操作（索引、模糊搜索），Agent 的强力助手 | [npmjs.com/package/@cortexkit/aft-pi](https://www.npmjs.com/package/@cortexkit/aft-pi) |
| TS 架构参考 | @oh-my-pi/pi-agent-core | TypeScript 版架构对理解 Rust 版有极高参考价值 | [npmjs.com/package/@oh-my-pi/pi-agent-core](https://www.npmjs.com/package/@oh-my-pi/pi-agent-core) |
| 前端组件库 | @earendil-works/pi-web-ui | Lit web components (ChatPanel, AgentInterface)。本地备份: `/root/dev/pi_web_ui_ref` | npm `@earendil-works/pi-web-ui` |

### 8.3 服务封装与实战参考

| 类别 | 文档/项目 | 核心价值 | 地址 |
|------|----------|---------|------|
| Web 框架 | axum 官方文档 | 架构现代、模块化，开发效率高，适合内部 API 快速构建 | [docs.rs/axum](https://docs.rs/axum) |
| Web 框架备选 | actix-web 官方文档 | 性能极致、久经考验，适合对延迟敏感的高性能公开服务 | [docs.rs/actix-web](https://docs.rs/actix-web) |
| **核心实战参考** | agent-discord-rs | **最宝贵参考资料**。展示如何通过 RPC 调用 Pi，处理多 Agent 后台服务。核心文件: `agent/pi.rs` (PiAgent), `agent/mod.rs` (AiAgent trait), `session.rs` (SessionManager) | [docs.rs/agent-discord-rs](https://docs.rs/agent-discord-rs) |

### 8.4 agent-discord-rs 关键架构模式

以下模式直接复用到 pi-web 中：

```
PiAgent 结构:
  ├── child: tokio::process::Child          # pi --mode rpc 子进程
  ├── stdin: Arc<Mutex<ChildStdin>>         # 串行写入 JSONL 命令
  ├── event_tx: broadcast::Sender            # 广播 stdout 解析出的事件
  └── Drop: SIGKILL 清理子进程

命令发送: raw_call(Value) → 写入 stdin JSON line → 返回 request_id
事件读取: 后台 tokio task 逐行读取 stdout → parse JSON → broadcast::send
SessionManager: HashMap<channel_id, Arc<dyn AiAgent>>
  每个 channel/session 对应一个独立的 PiAgent 实例

AiAgent trait (统一抽象):
  - prompt(input) → AgentEvent stream
  - set_model(provider, model_id), set_thinking_level(level)
  - abort(), compact()
  - get_available_models() → Vec<ModelInfo>
```

### 8.5 本地文件索引

| 路径 | 内容 |
|------|------|
| `/root/dev/pi_rust/` | pi_agent_rust 源码 (fork) — upstream 是 Dicklesworthstone/pi_agent_rust |
| `/root/dev/pi_rust/src/` | RPC 实现、agent loop、tool system |
| `/root/dev/pi_web_ui_ref/` | pi-web-ui 组件源码备份 (已从 TS pi 仓库提取) |
| `/root/dev/pi-web/src/pi/protocol.rs` | RPC 命令/事件类型定义 |
| `/root/dev/pi-web/src/pi/agent.rs` | PiAgent 进程管理 (参考 agent-discord-rs) |
| `/root/dev/pi-web/Cargo.toml` | 项目依赖清单 |
