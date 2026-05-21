# pi-web

Pi Agent 的 Web 界面。Rust axum 后端 + Lit SPA 前端。

## 快速开始

```bash
# 构建 SPA
cd spa && npm install && npm run build

# 构建后端（通过 GitHub CI，不本地编译）
# CI: .github/workflows/deploy.yml
```

## 部署

- 服务器: 8.138.1.39
- 端口: nginx 4443 (SSL) -> 内部 3000
- 二进制: `/opt/pi/pi-web`
- SPA: `/opt/pi/spa-dist/`
- 自动部署: `* * * * * /opt/pi/auto-deploy.sh`
- pi binary: `/opt/pi/pi`，通过 stdin/stdout JSONL 与 pi-web 通信

## 环境变量

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `PORT` | 3000 | 监听端口 |
| `PI_BINARY` | pi | pi 可执行文件路径 |
| `PI_SESSIONS_DIR` | ~/.pi/agent/sessions | 会话存储目录 |
| `PI_WEB_AUTH_TOKEN` | - | 内部认证令牌 |
| `DEEPSEEK_API_KEY` | - | DeepSeek API 密钥 |

## 项目结构

```
src/
  api/          后端 API 处理器
    session.rs  会话 CRUD + 导出/归档
    file.rs     文件操作
    message.rs  消息 SSE 流
    shell.rs    Shell 命令执行
    event.rs    SSE 事件流
    config.rs   配置
    v1.rs       旧版兼容端点
  pi/
    agent.rs    Pi 子进程管理
    manager.rs  会话管理器
    protocol.rs RPC 协议定义
  main.rs       axum 路由 + 启动
  auth.rs       Basic 认证中间件
  config.rs     环境变量配置

spa/src/
  pages/
    session-list.ts   会话列表页
    session-chat.ts   聊天主界面
  components/
    file-tree.ts      文件树
    file-upload.ts    文件上传
    file-context-menu.ts 右键菜单
    slash-commands.ts 斜杠命令
    session-stats.ts  统计条
  http-agent.ts       HTTP 客户端
  app.css             全局样式
  main.ts             入口
```

## API

见 PLAN.md 中的 API 端点表。
