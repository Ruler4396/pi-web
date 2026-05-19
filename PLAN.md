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

## 三、项目结构 (✅ 全部完成)

```
/root/dev/pi-web/                  (Ruler4396/pi-web)
├── PLAN.md                        ← 本文件
├── Cargo.toml
├── Cargo.lock
├── src/
│   ├── main.rs                    # 入口，启动 axum server + AppState + session_events
│   ├── config.rs                  # 环境变量 / 配置文件解析
│   ├── auth.rs                    # 认证中间件 (Basic auth token 校验)
│   ├── pi/
│   │   ├── mod.rs
│   │   ├── agent.rs               # PiAgent: 进程管理 + stdin/stdout JSONL
│   │   ├── protocol.rs            # RPC 命令/响应/事件类型定义
│   │   └── manager.rs             # SessionManager: HashMap<session_id, PiAgent>
│   ├── api/
│   │   ├── mod.rs                 # 路由注册
│   │   ├── session.rs             # 会话 CRUD handler + 实例事件
│   │   ├── message.rs             # 消息发送 handler (SSE) + 历史查询 (CommandResponse)
│   │   ├── config.rs              # 配置 handler
│   │   └── event.rs               # 实例级 SSE 事件流
│   └── embed.rs                   # rust-embed: 嵌入 SPA dist/
├── spa/                           # SPA 前端 (Vite + pi-web-ui)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── node_modules/
│   ├── src/
│   │   ├── main.ts                # 入口
│   │   ├── http-agent.ts          # HttpAgent: pi-agent-core 兼容 Agent 实现
│   │   ├── pages/
│   │   │   ├── session-list.ts    # 会话列表页
│   │   │   └── session-chat.ts    # ChatPanel 集成 (pi-chat-panel)
│   │   └── app.css                # 导入 pi-web-ui Tailwind CSS
│   └── dist/                      # 构建产物 (gitignore)
├── deploy/
│   ├── nginx-snippet.conf         # Nginx 4433 配置片段
│   └── pi-web.service             # systemd unit
└── .github/
    └── workflows/
        └── deploy.yml             # CI: 编译 Rust → 构建 SPA → 打包 → 上传 artifact
```

## 四、实施阶段

### Phase 1：基础环境 ✅
- [x] Fork pi_agent_rust → Ruler4396/pi_rust → clone 到 `/root/dev/pi_rust`
- [x] 删除 /root/dev/pi (TS 版 pi)
- [x] 创建 /root/dev/pi-web 目录
- [x] 保存 web-ui 源码到 `/root/dev/pi_web_ui_ref/` 供参考

### Phase 2：Rust 项目骨架 ✅
- [x] Cargo.toml: axum, tokio, serde, serde_json, uuid, tracing, rust-embed
- [x] src/main.rs: axum Router + shutdown signal
- [x] src/config.rs: PI_BINARY_PATH, PI_SESSIONS_DIR, PORT, AUTH_TOKEN
- [x] src/embed.rs: rust-embed 嵌入 spa/dist/

### Phase 3：PiAgent 进程管理 ✅
- [x] src/pi/protocol.rs: RpcCommand + AgentEvent 枚举全量定义
- [x] src/pi/agent.rs: PiAgent (spawn, stdin JSONL 写入, stdout broadcast, Drop SIGKILL)
- [x] src/pi/manager.rs: SessionManager (get_or_create, list, remove)

### Phase 4：HTTP API ✅
- [x] src/auth.rs: Basic auth 中间件 (公开路径跳过)
- [x] src/api/mod.rs: 全路由注册 (health, session CRUD, message, event, config)
- [x] src/api/session.rs: 会话 CRUD + abort/set_model + 实例事件推送
- [x] src/api/message.rs: SSE 流式传输 (send) + 历史查询等待 CommandResponse
- [x] src/api/event.rs: 实例级 SSE 事件流 (session_created/deleted)
- [x] src/api/config.rs: 配置信息端点

### Phase 5：SPA 前端 ✅
- [x] spa/package.json: pi-web-ui, lit, vite, typescript
- [x] spa/index.html: 入口 HTML
- [x] spa/src/http-agent.ts: 完整 Agent 接口实现 (prompt/abort/subscribe + SSE 解析)
- [x] spa/src/pages/session-list.ts: 会话列表页 (Lit 组件)
- [x] spa/src/pages/session-chat.ts: ChatPanel 集成 (pi-chat-panel + HttpAgent)
- [x] spa/vite.config.ts: 生产构建 + dev proxy
- [x] spa/src/app.css: pi-web-ui Tailwind CSS 导入

### Phase 6：CI + 部署 (⚠️ 部分完成)
- [x] **CI deploy.yml** — 编译 Rust + 构建 SPA + 打包上传 artifact，3 次成功运行
- [x] **deploy/deploy.sh** — 手动部署脚本（cp binary + systemd + nginx）
- [x] **deploy/nginx-snippet.conf** — Nginx 4443 代理 pi-web 配置
- [x] **deploy/pi-web.service** — systemd unit
- [ ] **自动化部署** — CI artifact 自动 scp/rsync 到服务器（需 GitHub SSH secret）

### Phase 7：迁移对齐 (✅ 已完成)
- [x] **下载 CI artifact + 解压** — 已完成（手动 scp，非 CI 自动下载）
- [x] **复制 pi-web.service -> systemd** — 已 enable + running on :3000
- [x] **Nginx 配置** — 4443 端口已切换到 pi-web (:3000)，SPA 已指向 pi-web 前端
- [x] **部署 SPA dist** — 已安装到 /opt/pi/spa-dist/，nginx 直接伺服
- [x] **验证 /api/health** — 正常（200 OK）
- [x] **验证 DeepSeek 模型** — 成功发送消息并获得 DeepSeek 响应
- [x] **验证 SPA 访问** — nginx + SPA 全链路通，https://aqsk.top:4443 可访问
- [x] **验证会话创建 + 发消息** — SSE 流式返回正常（input: 2394, output: 1 tokens）
- [ ] **回滚方案** — 切换回 opencode-web.service（待补充具体步骤）
- [ ] **自动化部署** — CI artifact 自动 scp/rsync 到服务器（需 GitHub SSH secret）

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
