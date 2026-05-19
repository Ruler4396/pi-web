# Pi Agent Web Server — 实施计划

> 目标：用 Rust Pi (pi_agent_rust) 替换现有 OpenCode Web，实现 `https://aqsk.top:4443/` 同等的 Web 访问体验。

## 一、核心架构决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Wrapper 语言 | **Rust** (axum) | 与 pi_agent_rust 同生态，零依赖部署 |
| Pi 集成方式 | **子进程 RPC** (`pi --mode rpc`) | stdin/stdout JSONL，broadcast channel 分发 |
| Web 框架 | **axum** (tokio) | 架构现代、模块化 |
| SPA 前端 | **pi-web-ui ChatPanel + Vite + Lit** | 复用社区组件，自定义 wrapper |
| 构建 | **GitHub Actions** CI | push main 自动触发 |
| 部署 | **Cron** 每分钟轮询 CI | 自动下载 artifact 并重启服务 |

## 二、运行中服务

| 服务 | 端口 | 管理 |
|------|------|------|
| pi-web (Rust) | 127.0.0.1:3000 | systemd |
| opencode-api (Go) | 127.0.0.1:4096 | 手动 |
| nginx | :443, :4443 | systemd |
| auto-deploy | cron * * * * * | /opt/pi/auto-deploy.sh |
| pi-idle-killer | cron */5 * * * * | /opt/pi/pi-idle-killer.sh |

## 三、访问信息

- **URL**: `https://aqsk.top:4443`
- **htpasswd**: `ocgate` / `opencode123`
- **内部 auth**: `Basic b3BlbmNvZGU6dWJnVFFZTzRyYVZ3TVhMcU5zUE82amUyTmJzUw==`
- **SSL**: Let's Encrypt，有效期至 2026-08-03
- **CI**: github.com/Ruler4396/pi-web

## 四、实施阶段

### Phase 1-5：基础建设 ✅
环境、Rust 骨架、PiAgent 进程管理、HTTP API、SPA 前端 — 全部完成。

### Phase 6：CI + 部署 ✅
- [x] CI deploy.yml — push main 自动触发
- [x] deploy.sh / nginx-snippet.conf / pi-web.service
- [x] Cron 自动部署 — 每分钟检测新 CI artifact，自动下载 + 重启

### Phase 7：迁移对齐 ✅
- [x] pi-web :3000 + nginx :4443 路由
- [x] SPA 由 nginx 直接伺服 /opt/pi/spa-dist/
- [x] /opencode/ 向后兼容 opencode-api (:4096)
- [x] htpasswd 密码重置

### Phase 8：第一轮 Bug 修复 ✅ (2026-05-19)
- [x] http-agent.ts SSE 字段映射 (raw.delta → raw.assistantMessageEvent.delta)
- [x] auth.rs Base64 编解码 (BASE64URL_NOPAD → BASE64)
- [x] protocol.rs Serde camelCase (显式 rename 所有字段)
- [x] Nginx 路由 (/api/ → :3000)
- [x] SPA 独立构建部署

### Phase 9：第二轮 Bug 修复 ✅ (2026-05-20)
- [x] **SSE 竞态条件** — message.rs/v1.rs 中 subscribe() 移到 send_command() 之前（4 处）
- [x] **PiAgent stderr 管道** — agent.rs 新增 read_stderr 后台任务消费 pi stderr 输出
- [x] **HttpAgent.setModel** — http-agent.ts 新增 setModel 方法，ChatPanel 模型选择器现在可用
- [x] **v1.rs 会话列表重复条目** — 用 per-session found 标志替代 sessions.len() 判断
- [x] **会话删除按钮** — session-list.ts 会话卡片增加悬停删除按钮

### Phase 10：UI/UX 重构 ✅ (2026-05-19)
- [x] **高度塌陷修复** — 根因：Light-DOM `:host` CSS 不生效 → 改用 inline style + JS 直接设 style
- [x] **AppStorage 初始化** — main.ts 在模块加载时注入 mock storage
- [x] **会话列表 UI** — 完整重写：loading/empty/error 三态，专业卡片设计
- [x] **聊天页面 UI** — loading/error/ready 三态，topbar 导航栏
- [x] **Playwright 测试环境** — 已安装，可截图 + 检查 computed style

---

## 五、待完成 (优先级排序)

### P0 — 路径问题
- [ ] **pi 进程空闲高 CPU (~99%)** — `pi --mode rpc` 忙轮询等待 stdin，每个空闲会话消耗一整个 CPU 核。需从 pi_rust 上游修复（改成阻塞读），或加超时自动 kill（pi-idle-killer 已就位但阈值 10min 偏长）
- [ ] **会话过期清理优化** — pi-idle-killer 阈值为 10min，可考虑降到 3min 并用 session 文件 mtime 判断是否有活动

### P1 — SPA 前端功能增强
- [ ] **思考级别切换** — ChatPanel 支持 thinking toggle 但 HttpAgentState 未暴露控制端点。需在 session-chat 中添加 UI 控件并连线到 /api/session/:id/model
- [ ] **会话重命名** — 后端 + 前端均未实现。需扩展 /api/session/:id 加 PATCH body
- [ ] **消息历史加载** — GET /api/session/:id/message 可用但 SPA 未在进入聊天页时调用
- [ ] **暗色模式** — ChatPanel 内置支持但未在 wrapper 中暴露切换入口

### P2 — 架构改进
- [ ] **v1 API 完善** — src/api/v1.rs 中 /mcp、/lsp、/config 等是 stub（返回空 {} / []）
- [ ] **模型切换状态持久化** — set_model 发送 RPC 但未更新 agent 内部状态缓存
- [ ] **回滚方案** — 切回 opencode-api (:4096) 作为主后端的操作步骤文档

### P3 — 运维 & 工具
- [ ] **Playwright 集成 CI** — 将 UI 截图测试加入 deploy.yml
- [ ] **健康监控** — 定时检查 pi-web 响应延迟，异常时告警

---

## 六、已知限制

| 限制 | 说明 |
|------|------|
| pi 进程高 CPU | pi --mode rpc 忙轮询，每个空闲会话 ~99% CPU |
| rust-embed SPA 过时 | 二进制内嵌 SPA 是 CI 构建时的旧版，nginx 直接伺服 /opt/pi/spa-dist/ 绕过 |
| /api/ 优先匹配 | nginx 中 /api/ 前缀优先于 /session 等 v1 端点，v1 仅能通过 /opencode/ 访问 |
| ChatPanel 依赖 | 依赖 @earendil-works/pi-web-ui 组件库（~3.3MB），升级需兼容检查 |
| 无 WebSocket | 仅 SSE（单向流），不支持双向实时通信 |

## 七、API 面

| 端点 | 方法 | 用途 | 状态 |
|------|------|------|------|
| `/api/health` | GET | 健康检查 (无需认证) | ✅ |
| `/api/session` | GET | 列出会话 | ✅ |
| `/api/session` | POST | 创建会话 | ✅ |
| `/api/session/:id` | GET | 会话详情 | ✅ |
| `/api/session/:id` | DELETE | 删除会话 | ✅ |
| `/api/session/:id/message` | GET | 获取历史消息 | ✅ |
| `/api/session/:id/message` | POST | 发送消息 (SSE 流式) | ✅ |
| `/api/session/:id/abort` | POST | 中断生成 | ✅ |
| `/api/session/:id/model` | POST | 切换模型 | ✅ |
| `/api/event` | GET | SSE 实例事件流 | ✅ |
| `/api/config` | GET | 配置信息 | ✅ |
| `/*` | GET | SPA 静态文件 (nginx) | ✅ |

## 八、部署信息

| 项目 | 值 |
|------|-----|
| 域名 | https://aqsk.top:4443 |
| htpasswd | ocgate / opencode123 |
| pi-web port | 127.0.0.1:3000 (systemd) |
| opencode-api port | 127.0.0.1:4096 (手动) |
| SPA path | /opt/pi/spa-dist/ |
| pi binary | /opt/pi/pi (v0.1.15) |
| sessions dir | /root/.pi/agent/sessions/ |
| CI repo | github.com/Ruler4396/pi-web |
| SSL cert | /etc/letsencrypt/live/aqsk.top/ |
