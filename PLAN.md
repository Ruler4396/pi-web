# Pi Agent Web Server — 实施计划

> **终极目标**: 将 opencode 完整生态迁移到 pi_rust 中。
> **中期目标**: pi-web 向 opencode web 靠拢，可用且好用。
> **当前阶段**: Phase 19 完成 — 终端面板 + 语法高亮 + 文件标签 + 暗色模式

## 架构

- **后端**: Rust axum，端口 3000，通过 stdin/stdout JSONL 与 pi binary 通信
- **前端**: Lit + Vite SPA，使用 @earendil-works/pi-web-ui ChatPanel
- **部署**: 8.138.1.39，nginx 反向代理 4443 端口 SSL
- **CI**: GitHub Actions，每分钟 cron 自动部署

## Phase 14-19：已完成

### 14. 侧边栏 + 文件操作
后端文件 API (list/read/download/write/delete)，前端 file-tree（可折叠懒加载）、file-upload（拖拽）、file-context-menu（右键），三栏布局可拖拽宽度。

### 15. 键盘快捷键 + 斜杠命令
slash-commands 8 命令面板，Ctrl+B/Escape/Ctrl+Enter/Ctrl+L 快捷键，session-stats 统计条，会话导出/归档/恢复。

### 16. 暗色模式 + 会话归档
暗色模式 CSS 变量完整体系，默认暗色，localStorage 持久化，归档/删除按钮。

### 17. UI 精修
对照 opencode web 设计令牌重构 CSS（box-shadow 边框替代 solid border、暖白背景 #f8f8f8、中灰文字 #6f6f6f）、欢迎屏、全局 emoji 替换为 SVG、目录选择器文件夹树导航。

### 18. 文件标签 + 布局重构
VSCode 风格文件标签（点击打开/再点关闭/多标签切换），三栏布局（侧边栏 | 标签面板 42% | 对话区 flex:1），预览语法高亮，面板宽度拖拽调节 3px handle。

### 19. 终端面板
后端 shell 执行 API `POST /api/shell/exec`，前端终端面板（顶栏按钮切换、底部 200px、命令输入 + stdout/stderr 输出、显示 cwd）。

## Phase 20：修复中

- Light-DOM 组件样式迁移到全局 CSS
- 暗色模式编辑器卡片颜色覆盖
- 预览区滚动条修复
- 布局链高度修复

## Phase 21（计划）：模型选择器

- 模型选择器：先选厂商再选模型
- 发送按钮 SVG 优化

## API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/session` | GET/POST | 会话列表/创建(cwd) |
| `/api/session/{id}` | GET/DELETE/PATCH | 会话详情/删除/更新 |
| `/api/session/{id}/message` | GET/POST | 消息列表/发送(SSE) |
| `/api/session/{id}/abort` | POST | 停止生成 |
| `/api/session/{id}/export` | GET | 导出 Markdown |
| `/api/session/{id}/archive` | POST | 归档 |
| `/api/session/{id}/restore` | POST | 恢复 |
| `/api/file/list` | GET | 列出目录(深度4) |
| `/api/file/read` | GET | 读取文件内容 |
| `/api/file/download` | GET | 下载文件 |
| `/api/file/write` | POST | 写入文件(base64) |
| `/api/file/delete` | POST | 删除文件/目录 |
| `/api/shell/exec` | POST | 执行 shell 命令 |
| `/api/models` | GET | 模型列表 |
| `/api/event` | GET | SSE 事件流 |

## 前端组件

| 组件 | 文件 | 功能 |
|------|------|------|
| `session-list` | pages/session-list.ts | 会话卡片列表 + 目录选择器 |
| `session-chat` | pages/session-chat.ts | 聊天主界面（三栏+标签+终端） |
| `file-tree` | components/file-tree.ts | 可折叠文件树（SVG+A扩展名+懒加载） |
| `file-context-menu` | components/file-context-menu.ts | 右键菜单 |
| `file-upload` | components/file-upload.ts | 文件上传 |
| `slash-commands` | components/slash-commands.ts | 斜杠命令面板 |
| `session-stats` | components/session-stats.ts | 会话统计条 |
