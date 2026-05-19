# Pi Agent Web Server — 实施计划

> **终极目标**: 将 opencode 完整生态（Web、提示词、Wiki、记忆、与 Hermes 的关联）迁移到 pi_rust 中。  
> **中期目标**: pi-web 向 opencode web 靠拢，可用且好用。  
> **当前阶段**: Phase 11 完成，聊天 UI 已具备核心功能。

## 一、核心架构

```
浏览器 ── Nginx :4443 (Basic Auth) ──▶ pi-web SPA (/opt/pi/spa-dist/)
                                           │
                                           ├── /api/* ──▶ axum HTTP Server (:3000)
                                           │                  ├── Session CRUD
                                           │                  ├── SSE 流式消息
                                           │                  ├── SessionManager (PiAgent pool)
                                           │                  └── pi --mode rpc 子进程
                                           │
                                           └── /opencode/* ──▶ opencode-api (:4096) [向后兼容]
```

## 二、运行中服务

| 服务 | 端口 | 管理 | 状态 |
|------|------|------|------|
| pi-web (Rust) | 127.0.0.1:3000 | systemd | ✅ |
| opencode-api (Go) | 127.0.0.1:4096 | 手动 | ✅ 向后兼容 |
| nginx | :443, :4443 | systemd | ✅ |
| auto-deploy | cron * * * * * | /opt/pi/auto-deploy.sh | ✅ |
| pi-idle-killer | cron */5 * * * * | /opt/pi/pi-idle-killer.sh (3min) | ✅ |

## 三、实施阶段

### Phase 1-7：基础建设 ✅
环境、Rust 骨架、PiAgent 进程管理、HTTP API、SPA 前端、CI/CD、Nginx 迁移。

### Phase 8：第一轮 Bug 修复 ✅ (2026-05-19)
SSE 字段映射、Base64 编解码、Serde camelCase、Nginx 路由、SPA 独立构建。

### Phase 9：第二轮 Bug 修复 ✅ (2026-05-20)
SSE 竞态条件修复（subscribe-before-send）、stderr 管道消费、setModel 方法、v1 会话去重、会话删除按钮、幽灵文件删除、pi idle-killer 3min。

### Phase 10：UI/UX 重构 ✅ (2026-05-19)
高度塌陷修复、AppStorage mock、会话列表 UI、聊天页面 UI、Playwright 测试环境。

### Phase 11：聊天 UI 增强 ✅ (2026-05-20)

#### 11.1 工具栏控件
- ✅ `HttpAgentState.tools` 填充 7 个 pi 工具 → thinking toggle 等控件可见
- ✅ `HttpAgentState.systemPrompt` 填充默认值
- ✅ `HttpAgentState.availableModels` + `loadModels()` → 模型选择器数据源
- ✅ `session-chat.ts` `setAgent` 补全 `onModelSelect`、`onCostClick`、`toolsFactory`、`sandboxUrlProvider`
- ✅ `recognized` getter → ChatPanel 正确识别 agent

#### 11.2 后端 API
- ✅ `GET /api/models` — 返回 4 个可用模型（deepseek-chat, deepseek-reasoner, claude-sonnet-4-5, claude-haiku-4-5）
- ✅ `PATCH /api/session/:id` — 接受 `{cwd, name}` 更新会话配置
- ✅ `session_path()` 改为 `pub` — PATCH handler 可访问会话文件

#### 11.3 欢迎页 + 消息历史
- ✅ `loadHistory()` — 进入聊天时自动加载历史消息
- ✅ `renderWelcome()` — 空会话显示欢迎覆盖层（模型名、目录、示例 prompt）
- ✅ `fillPrompt()` — 点击建议文本填充到输入框

#### 11.4 工作目录选择器
- ✅ topbar 显示当前 cwd（默认 `/root`）
- ✅ 点击 cwd 弹出 prompt 修改路径
- ✅ 调用 `PATCH /api/session/:id` 持久化

#### 11.5 工具执行渲染
- ✅ `toolsFactory` 注册 pi 工具渲染器
- ✅ `sandboxUrlProvider` 设置（后续扩展）

#### 11.6 UX 打磨
- ✅ 错误类型区分（网络错误 vs pi 崩溃 vs API 错误）
- ✅ 会话重命名（点击 session ID）
- ✅ 消息内容格式修复：content 从字符串改为 `[{type:"text", text:"..."}]` chunks 数组（ChatPanel 以此格式渲染）

### Phase 11 关键发现

**消息渲染 Bug 根因**：ChatPanel 的 `AssistantMessage` 组件遍历 `message.content` 数组渲染内容块：
```javascript
for (const chunk of this.message.content) {
    if (chunk.type === "text" && chunk.text.trim() !== "") {
        // 渲染 markdown-block
    }
}
```
我们之前传递的是 `content: "Hello"`（字符串），ChatPanel 遍历字符而非消息块，导致无渲染。修复为 `content: [{type: "text", text: "Hello"}]`。

---

## 四、当前状态：聊天 UI 功能矩阵

| 功能 | 状态 | 说明 |
|------|------|------|
| 工具栏 thinking toggle | ✅ | tools 非空后 ChatPanel 自动显示 |
| 工具栏模型选择按钮 | ✅ | 点击弹出模型列表下拉框 |
| 模型切换 (setModel) | ✅ | 选择后调用 POST /api/session/:id/model |
| 发送/停止按钮 | ✅ | 发送消息 / 中止生成 |
| 欢迎页 | ✅ | 空会话显示模型名、目录、示例 prompt |
| 消息历史加载 | ✅ | 进入聊天自动调用 GET /api/session/:id/message |
| SSE 流式响应 | ✅ | 12 条 data 事件，内容正确渲染 |
| 工作目录显示 | ✅ | topbar 显示，点击可修改 |
| 工作目录修改 | ✅ | PATCH /api/session/:id 持久化 |
| 会话重命名 | ✅ | 点击 session ID 输入新名称 |
| 模型选择器 | ✅ | 下拉框选择，包含 DeepSeek + Claude |
| 工具执行卡片 | 🔨 | toolsFactory 已注册，待真实工具调用验证 |
| 暗色模式 | ❌ | ChatPanel 内置支持，未暴露切换入口 |
| Token 用量显示 | ❌ | ChatPanel 支持，需配置 onCostClick |

---

## 五、API 面

| 端点 | 方法 | 用途 | 状态 |
|------|------|------|------|
| `/api/health` | GET | 健康检查 | ✅ |
| `/api/session` | GET | 列出会话 | ✅ |
| `/api/session` | POST | 创建会话 | ✅ |
| `/api/session/:id` | GET | 会话详情 | ✅ |
| `/api/session/:id` | DELETE | 删除会话 | ✅ |
| `/api/session/:id` | PATCH | 更新配置 (cwd/name) | ✅ |
| `/api/session/:id/message` | GET | 历史消息 | ✅ |
| `/api/session/:id/message` | POST | 发送消息 (SSE) | ✅ |
| `/api/session/:id/abort` | POST | 中断生成 | ✅ |
| `/api/session/:id/model` | POST | 切换模型 | ✅ |
| `/api/models` | GET | 可用模型列表 | ✅ |
| `/api/event` | GET | SSE 实例事件流 | ✅ |
| `/api/config` | GET | 配置信息 | ✅ |
| `/*` | GET | SPA (nginx) | ✅ |

---

## 六、下一步计划

### Phase 12：高级功能 (P2)

#### 12.1 暗色模式
- ChatPanel 内置暗色/亮色切换
- 在 session-chat topbar 添加 toggle 按钮
- 通过 CSS 变量或 ChatPanel API 切换

#### 12.2 Token / 成本追踪
- pi binary 返回 usage 数据（input/output tokens）
- 在消息 footer 显示 token 用量
- 配置 `onCostClick` 显示详情弹窗

#### 12.3 工具调用验证
- 发送触发工具的消息（如 "read this file"）
- 验证工具执行事件 → 工具卡片渲染
- 完善 toolsFactory 中的工具参数定义

#### 12.4 v1 API 完善
- `/mcp`、`/lsp`、`/config` 等当前为 stub
- 逐步实现或改为返回有意义的默认值

### Phase 13：opencode 生态迁移 (长期目标)

#### 13.1 提示词系统
- 分析 opencode 的 system prompt / 指令体系
- 映射到 pi 的 system prompt 配置
- 支持自定义 prompt 模板

#### 13.2 Wiki 知识库
- opencode 的 `/root/wiki/` 目录结构
- pi-web 集成 wiki 索引和搜索
- 通过工具调用暴露给 pi agent

#### 13.3 记忆系统
- opencode 的 `~/.opencode/memory/MEMORY.md`
- pi-web 的会话记忆持久化
- 跨会话上下文保持

#### 13.4 Hermes 集成
- 理解 opencode 与 Hermes 的关联方式
- 在 pi 生态中实现同等集成

#### 13.5 回滚方案
- 文档化切回 opencode-api 的步骤

---

## 七、已知限制

| 限制 | 说明 | 计划 |
|------|------|------|
| pi 进程高 CPU | 空闲时 ~99% CPU busy-wait | idle-killer 3min；长期需上游修复 |
| rust-embed SPA 过时 | 二进制内嵌旧版 SPA | nginx 直接伺服 /opt/pi/spa-dist/ |
| /api/ 覆盖 v1 端点 | nginx /api/ 前缀优先于 v1 端点 | v1 通过 /opencode/ 访问 |
| ChatPanel 依赖 | @earendil-works/pi-web-ui ~3.3MB | 锁版本，升级需兼容检查 |
| 无 WebSocket | 仅 SSE 单向流 | 后续按需添加 |
| 模型列表硬编码 | 前后端各有一份模型列表 | 后续统一为后端单一数据源 |

## 八、部署信息

| 项目 | 值 |
|------|-----|
| 域名 | https://aqsk.top:4443 |
| htpasswd | ocgate / opencode123 |
| pi-web port | 127.0.0.1:3000 (systemd) |
| opencode-api port | 127.0.0.1:4096 |
| SPA path | /opt/pi/spa-dist/ |
| pi binary | /opt/pi/pi (v0.1.15) |
| sessions dir | /root/.pi/agent/sessions/ |
| CI repo | github.com/Ruler4396/pi-web |
| SSL | Let's Encrypt (至 2026-08-03) |

## 九、Git 提交记录 (Phase 11)

```
7dfff8c fix: message content as chunks array [{type:text,text:...}] per ChatPanel contract
398a952 fix: add text/delta/content fields to message_update event for ChatPanel rendering
62f443a fix: simplify onBeforeSend, add recognized getter to HttpAgent
f49d4a9 feat: toolsFactory for tool execution cards, session rename, error distinction
a893db6 fix: add renderWelcome + fillPrompt methods, update render template with welcome overlay
16df8a4 fix: welcome screen visibility - default showWelcome to true
6085bf4 feat: PATCH /api/session/:id, GET /api/models, welcome fix, pub session_path
9b30e68 feat(chat): populate AgentState tools, wire setAgent config, add welcome, model picker, cwd
```
