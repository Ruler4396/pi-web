# Pi Agent Web Server — 实施计划

> 目标：用 Rust Pi (pi_agent_rust) 替换现有 OpenCode Web，实现 `https://aqsk.top:4443/` 同等的 Web 访问体验。

## 一、核心架构决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Wrapper 语言 | **Rust** (axum) | 与 pi_agent_rust 同生态，零依赖部署，agent-discord-rs 已验证此模式 |
| Pi 集成方式 | **子进程 RPC** (`pi --mode rpc`) | 与 agent-discord-rs 一致，pi 无内置 SDK，只能走 stdin/stdout JSONL |
| Web 框架 | **axum** (tokio) | 架构现代、模块化，用户指定 |
| SPA 前端 | **pi-web-ui 组件 + Vite** | 复用 Lit web components，已有的 ChatPanel/AgentInterface/ArtifactsPanel |
| 构建 | **GitHub Actions** CI | 不在服务器上编译 |
| 仓库 | 多仓库 | pi_rust (fork) + pi-web (wrapper + SPA) |

### 架构图

```
浏览器 ── Nginx :4443 (Basic Auth) ──▶ pi-web SPA (静态文件 /opt/pi/spa-dist/)
                                          │
                                          ├── /api/* ──▶ axum HTTP Server (:3000)
                                          │                  ├── Session CRUD
                                          │                  ├── SSE 流式消息
                                          │                  ├── SessionManager (PiAgent pool)
                                          │                  └── pi --mode rpc 子进程
                                          │
                                          └── /opencode/* ──▶ opencode-api (:4096) [向后兼容]
```

## 二、参考项目

### 2.1 核心参考：agent-discord-rs
- **地址**：crates.io/agent-discord-rs (darkautism)
- **关键模式**：PiAgent 封装 pi --mode rpc 子进程，stdin 写入，stdout broadcast，Drop SIGKILL

### 2.2 前端组件：earendil-works/pi-web-ui
- **地址**：npm `@earendil-works/pi-web-ui`
- **核心组件**：`ChatPanel`, `AgentInterface`, `ArtifactsPanel`

### 2.3 上游：Dicklesworthstone/pi_agent_rust
- **fork**：Ruler4396/pi_rust (已 clone 到 `/root/dev/pi_rust`)
- **RPC 协议**：JSONL stdin/stdout, 20+ 命令, 15+ 事件

## 三、项目结构 ✅

```
/root/dev/pi-web/                  (Ruler4396/pi-web)
├── PLAN.md
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── config.rs
│   ├── auth.rs
│   ├── embed.rs
│   ├── pi/
│   │   ├── mod.rs
│   │   ├── agent.rs
│   │   ├── protocol.rs
│   │   └── manager.rs
│   └── api/
│       ├── mod.rs
│       ├── session.rs
│       ├── message.rs
│       ├── config.rs
│       ├── event.rs
│       └── v1.rs
├── spa/
│   ├── src/
│   │   ├── main.ts
│   │   ├── http-agent.ts
│   │   ├── app.css
│   │   └── pages/
│   └── dist/  (gitignored, 构建产物)
├── deploy/
│   ├── deploy.sh
│   ├── nginx-snippet.conf
│   └── pi-web.service
└── .github/workflows/deploy.yml
```

## 四、实施阶段

### Phase 1：基础环境 ✅
### Phase 2：Rust 项目骨架 ✅
### Phase 3：PiAgent 进程管理 ✅
### Phase 4：HTTP API ✅
### Phase 5：SPA 前端 ✅
### Phase 6：CI + 部署 ✅
- [x] CI deploy.yml — push to main 自动触发构建
- [x] deploy/deploy.sh — 手动部署脚本
- [x] deploy/nginx-snippet.conf — Nginx 配置片段模板
- [x] deploy/pi-web.service — systemd unit
- [ ] CI 自动 scp/rsync 到服务器（需 GitHub SSH secret，目前手动 gh run download）

### Phase 7：迁移对齐 ✅
- [x] pi-web.service 运行中 (:3000)
- [x] Nginx :4443 路由 /api/ → pi-web (:3000)
- [x] SPA 静态文件由 nginx 直接伺服 (/opt/pi/spa-dist/)
- [x] /opencode/ 仍指向 opencode-api (:4096) 向后兼容
- [x] DeepSeek 模型 SSE 流式返回正常
- [x] htpasswd 密码已重置 (ocgate/mxy/test44 : opencode123)
- [x] SSL Let's Encrypt 证书正常 (有效期至 2026-08-03)

### Phase 8：Bug 修复 ✅ (2026-05-19)
- [x] **SSE 事件解析** — http-agent.ts 字段映射 raw.delta → raw.assistantMessageEvent.delta
- [x] **认证编解码** — auth.rs BASE64URL_NOPAD → data_encoding::BASE64
- [x] **Serde camelCase** — protocol.rs 所有 AgentEvent 字段添加显式 #[serde(rename = "...")]
  - session_id → sessionId, tool_call_id → toolCallId, tool_name → toolName, etc.
  - 修复前: `failed to parse pi event: missing field 'session_id'` (每条 agent_start 都报错)
  - 修复后: agent_start 等所有事件正确解析，日志无 parse error
- [x] **Nginx 路由** — /api/ 从硬编码 :4096 改为 :3000，SPA 由 nginx 直接伺服磁盘文件
- [x] **SPA 独立构建** — 修复 http-agent.ts 后重新 npm run build，部署到 /opt/pi/spa-dist/

### Phase 9：待完成 & 已知问题

#### 待完成
- [ ] **CI 自动部署** — 当前手动 gh run download + systemctl restart，需添加 GitHub SSH deploy key 实现全自动
- [ ] **Nginx :4443 snipped 模板更新** — deploy/nginx-snippet.conf 仍是占位符 <INTERNAL_TOKEN>，需替换为实际值
- [ ] **会话过期清理** — pi 进程空闲后持续消耗 CPU (~99%)，需添加空闲超时自动 kill
- [ ] **并发限制** — 当前无最大并发会话限制
- [ ] **v1 API 完善** — src/api/v1.rs 中多数端点为 stub（返回空数据），仅用于 opencode SPA 向后兼容标记
- [ ] **回滚方案** — 切换回 opencode-api (:4096) 作为主后端的操作步骤
- [ ] **SPA 前端 UX** — session-list.ts / session-chat.ts 功能基础，缺少错误提示/加载状态/LSP 状态等
- [ ] **WebSocket 支持** — 当前仅 SSE (单向)，若需双向实时通信需加 WS
- [ ] **多模型支持** — 当前仅硬编码 deepseek-chat，虽 pi binary 支持多模型但前端未暴露切换 UI
- [ ] **工具调用 UI** — pi binary 支持 tool_execution_start/end 事件，但 ChatPanel 未渲染工具调用交互

#### 已知问题
- **pi 进程空闲高 CPU** — pi --mode rpc 在等待 stdin 时持续 ~99% CPU，需从 pi_rust 上游修复或加 workaround (如 sleep-loop wrapper)
- **rust-embed 内置 SPA 已过时** — 二进制内嵌的 SPA 是旧版 (CI 构建时的版本)，当前实际使用 nginx 直接伺服 /opt/pi/spa-dist/ 绕过
- **/api/ 路由覆盖 v1 端点** — nginx 中 /api/ 优先匹配，导致 pi-web 的 /session 等 v1 端点仅能通过 /opencode/ 路径访问

## 五、API 面

| 端点 | 方法 | 用途 | 状态 |
|------|------|------|------|
| `/api/health` | GET | 健康检查 (无需认证) | ✅ |
| `/api/session` | GET | 列出所有会话 | ✅ |
| `/api/session` | POST | 创建新会话 | ✅ |
| `/api/session/:id` | GET | 会话详情 | ✅ |
| `/api/session/:id` | DELETE | 删除会话 | ✅ |
| `/api/session/:id/message` | GET | 获取历史消息 | ✅ |
| `/api/session/:id/message` | POST | 发送消息 (SSE 流式返回) | ✅ |
| `/api/session/:id/abort` | POST | 中断生成 | ✅ |
| `/api/session/:id/model` | POST | 切换模型 | ✅ |
| `/api/event` | GET | SSE 实例事件流 | ✅ |
| `/api/config` | GET | 配置信息 | ✅ |
| `/*` | GET | SPA 静态文件 (nginx 直接伺服) | ✅ |

## 六、部署信息

| 项目 | 值 |
|------|-----|
| 域名 | https://aqsk.top:4443 |
| Nginx htpasswd | ocgate / opencode123 |
| pi-web 内部 auth | Basic b3BlbmNvZGU6dWJnVFFZTzRyYVZ3TVhMcU5zUE82amUyTmJzUw== |
| pi-web 端口 | 127.0.0.1:3000 (systemd) |
| opencode-api 端口 | 127.0.0.1:4096 (手动启动) |
| SPA 路径 | /opt/pi/spa-dist/ (nginx 伺服) |
| pi binary | /opt/pi/pi (v0.1.15) |
| 会话目录 | /root/.pi/agent/sessions/ |
| CI 仓库 | github.com/Ruler4396/pi-web |
| SSL 证书 | /etc/letsencrypt/live/aqsk.top/ (Let's Encrypt) |
