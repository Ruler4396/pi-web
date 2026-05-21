# pi-web

Pi Agent 的 Web 界面。Rust axum 后端 + Lit SPA 前端，通过 stdin/stdout JSONL 与 pi binary 通信。

## 特性

- **会话管理**: 创建/归档/恢复/删除会话，每个会话绑定独立工作目录
- **文件操作**: 侧边栏文件树（懒加载、拖拽上传到指定目录、右键菜单下载/删除）
- **代码预览**: VSCode 风格多标签文件查看，语法高亮（关键字/字符串/注释/数字）
- **终端**: 底部终端面板，支持 cd/命令执行，持久化工作目录
- **暗色模式**: 完整 CSS 变量体系，默认暗色，lacalStorage 持久化
- **会话目录选择器**: 新建会话时文件夹树导航选择工作目录
- **面板拖拽**: 文件预览面板宽度可拖拽调节

## 快速开始

```bash
# 构建 SPA
cd spa && npm install && npm run build

# 后端通过 GitHub CI 编译，自动部署到服务器
# CI: .github/workflows/deploy.yml
```

## 部署

- 服务器: 8.138.1.39
- 端口: nginx 4443 (SSL) -> 内部 3000
- 二进制: `/opt/pi/pi-web`，SPA: `/opt/pi/spa-dist/`
- 自动部署: `* * * * * /opt/pi/auto-deploy.sh`
- pi binary: `/opt/pi/pi`

## 环境变量

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `PORT` | 3000 | 监听端口 |
| `PI_BINARY` | pi | pi 可执行文件路径 |
| `PI_SESSIONS_DIR` | ~/.pi/agent/sessions | 会话存储 |
| `PI_WEB_AUTH_TOKEN` | - | 内部认证令牌 |
| `DEEPSEEK_API_KEY` | - | API 密钥 |

## 项目结构

```
src/api/        后端 API (session, file, message, shell, event)
src/pi/         Pi 子进程管理 + RPC 协议
spa/src/
  pages/        页面组件 (session-list, session-chat)
  components/   可复用组件 (file-tree, file-upload, file-context-menu, slash-commands, session-stats)
  app.css       全局样式 + 设计令牌
  main.ts       SPA 入口 + 路由
```

## API

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/session` | GET/POST | 会话列表/创建(cwd) |
| `/api/session/{id}` | GET/DELETE/PATCH | 详情/删除/更新 |
| `/api/session/{id}/message` | GET/POST | 消息列表/发送(SSE) |
| `/api/file/list` | GET | 列出目录(深度4) |
| `/api/file/read` | GET | 读取文件 |
| `/api/file/write` | POST | 写入文件(base64) |
| `/api/file/delete` | POST | 删除文件 |
| `/api/shell/exec` | POST | 执行 shell 命令 |
