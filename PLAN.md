# Pi Agent Web Server — 实施计划

> **终极目标**: 将 opencode 完整生态迁移到 pi_rust 中。
> **当前阶段**: Phase 27 — 真实子代理执行器

## 架构

- **后端**: Rust axum，端口 3000，通过 stdin/stdout JSONL 与 pi binary 通信
- **前端**: Lit + Vite SPA，使用 @earendil-works/pi-web-ui ChatPanel
- **部署**: 8.138.1.39，nginx 反向代理 4443 端口 SSL
- **CI**: GitHub Actions（构建+E2E+健康检查），每分钟 cron 自动部署

## 已完成 (Phase 14-26)

### 14. 侧边栏 + 文件操作
后端文件 API (list/read/download/write/delete, 深度4)，前端 file-tree（SVG图标+懒加载）、file-upload（拖拽上传到指定目录）、右键菜单（下载/删除），三栏布局可拖拽宽度。

### 15. 键盘快捷键 + 斜杠命令
slash-commands 8命令面板，Ctrl+B/Escape/Ctrl+Enter/Ctrl+L，session-stats统计条，会话导出/归档/恢复。

### 16. 暗色模式 + CSS设计令牌
完整CSS变量体系(对照opencode web)，默认暗色，localStorage持久化。

### 17. UI精修
box-shadow边框替代solid border，暖白/#f8f8f8背景，#6f6f6f中灰文字，14px基准字号，全局SVG图标替代emoji，目录选择器文件夹树导航。

### 18. 文件标签 + 布局重构
VSCode风格多标签（点击打开/再点关闭），三栏（侧边栏|标签面板42%|对话区flex:1），语法高亮(关键字/字符串/注释/数字)，面板拖拽调节，行号预览。

### 19. 终端面板
后端shell执行API `POST /api/shell/exec`，前端终端（顶栏按钮切换、持久化cwd、cd本地处理）。

### 20. UI修复
Light-DOM组件样式迁移全局CSS，暗色编辑器卡片，预览滚动条(overflow-y:auto+pre-wrap)，布局链高度修复，拖放闪烁修复（已展开目录不重复toggle）。

### 21. CI体系
Playwright E2E(7测试)，tsc --noEmit类型检查，每日健康检查，Rust编译缓存，tag触发部署。

### 22. 模型选择器

顶栏模型选择器、思考等级选择器、最近模型、隐藏 ChatPanel 内置模型按钮，发送区按钮视觉统一。

### 23. Hermes 通知 + 文件引用

任务完成后通过 Hermes MCP 调用 `send_wecom_notification` 发送企业微信通知；输入框支持 `@当前目录下文件`，发送前扩展为文件上下文。

### 24. 目标生命周期

`/goal` 接入后端长期目标事件，前端展示 Goal 运行/迭代/完成/停止状态，避免用户误以为任务卡住。

### 25. 上下文压缩 + 子代理规划契约

`/compact` 接到真实后端压缩 RPC；`/agents` 和 `/subagents` 接到 `pi.subagent.plan.v1` 规划契约，包含上下文预算、缓存失效策略、并行上限和停止策略。当前只做安全规划，不启动真实子代理执行器。

### 26. 对话区与流式体验打磨

- 修复 `/` 和 `@` 浮层过滤后悬空，改为贴合输入区上沿的 bottom-anchor 定位
- 优化命令补全键盘体验：Enter/Tab 选中、Home/End 跳转、选中项自动滚入视野
- 优化对话区排版，贴近 ChatGPT/DeepSeek Web 的宽度、行高、代码块和用户消息气泡
- 增加流式状态 pill：Thinking / Streaming / Running tool / complete
- 增强滚动锚定：流式更新时仅在接近底部时跟随，开始和结束强制落底
- 处理移动端：隐藏文件栏/标签栏，修正输入区、浮层和状态提示的遮挡

## Phase 27（计划）：真实子代理执行器

- 在 Phase 25 的规划契约基础上实现真实调度器
- 为每个子代理裁剪上下文、复用缓存、隔离写入范围
- 汇总结果并做停止条件检查，避免无限迭代和无进展 token 消耗

## API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/session` | GET/POST | 会话列表/创建(cwd) |
| `/api/session/{id}` | GET/DELETE/PATCH | 详情/删除/更新 |
| `/api/session/{id}/message` | GET/POST | 消息列表/发送(SSE) |
| `/api/session/{id}/abort` | POST | 停止生成 |
| `/api/session/{id}/model` | POST | 切换模型 |
| `/api/file/list` | GET | 列出目录(深度4) |
| `/api/file/read` | GET | 读取文件 |
| `/api/file/download` | GET | 下载文件 |
| `/api/file/write` | POST | 写入文件(base64) |
| `/api/file/delete` | POST | 删除文件/目录 |
| `/api/shell/exec` | POST | 执行shell命令 |
