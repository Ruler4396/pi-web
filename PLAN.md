# Pi Agent Web Server — 实施计划

> **终极目标**: 将 opencode 完整生态迁移到 pi_rust 中。
> **当前阶段**: Phase 22 — 模型选择器重构

## 架构

- **后端**: Rust axum，端口 3000，通过 stdin/stdout JSONL 与 pi binary 通信
- **前端**: Lit + Vite SPA，使用 @earendil-works/pi-web-ui ChatPanel
- **部署**: 8.138.1.39，nginx 反向代理 4443 端口 SSL
- **CI**: GitHub Actions（构建+E2E+健康检查），每分钟 cron 自动部署

## 已完成 (Phase 14-21)

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

## Phase 22（进行中）：模型选择器

- 顶栏模型选择器：先选厂商(DeepSeek/Anthropic)再选模型
- 替换ChatPanel内置的ugly选择器
- 发送按钮SVG优化

## Phase 23（计划）：消息流验证 + 终端持久化

- DeepSeek API恢复额度后验证SSE消息流渲染
- 终端cwd持久化到localStorage

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
