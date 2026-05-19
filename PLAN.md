# Pi Agent Web Server — 实施计划

> **终极目标**: 将 opencode 完整生态（Web、提示词、Wiki、记忆、与 Hermes 的关联）迁移到 pi_rust 中。  
> **中期目标**: pi-web 向 opencode web 靠拢，可用且好用。  
> **当前阶段**: Phase 14 完成 — 三栏布局 + 文件树侧边栏 + 文件上传/下载/删除。

## Phase 14：侧边栏 + 文件树 + 文件操作 ✅

### 14.1 后端文件 API
| 端点 | 用途 | 
|------|------|
| GET `/api/file/list?path=` | 列出目录 (JSON tree, 递归 2 层) |
| GET `/api/file/read?path=` | 读取文件内容 |
| GET `/api/file/download?path=` | 下载文件 (octet-stream) |
| POST `/api/file/write` | 写入文件 `{path, content, encoding:"base64"}` |
| POST `/api/file/delete` | 删除文件/目录 `{path}` |

### 14.2 前端组件
| 组件 | 文件 | 功能 |
|------|------|------|
| `file-tree` | `spa/src/components/file-tree.ts` | 可折叠目录树，emoji 图标，右键菜单事件 |
| `file-context-menu` | `spa/src/components/file-context-menu.ts` | 右键菜单：打开/下载/复制路径/删除 |
| `file-upload` | `spa/src/components/file-upload.ts` | 拖拽上传 + 文件选择器，base64 编码 |

### 14.3 三栏布局
- 侧边栏（可开关，Ctrl+B）：项目名称 + upload 按钮 + file-tree
- 可拖拽调节宽度（resize-handle，180-500px）
- 主聊天区（flex:1）

### Playwright 验证
```
sidebar: true  fileTree: true  fileUpload: true
toggleBtn: true  resizeHandle: true  topbar: true
Errors: 0
```

---

## 下一步：Phase 15 — 键盘快捷键 + 斜杠命令 + UX 打磨

### 15.1 键盘快捷键
| 快捷键 | 功能 |
|--------|------|
| Ctrl+B | 切换侧边栏 |
| Ctrl+N | 新建会话 |
| Ctrl+L | 清空当前输入 |
| Escape | 停止生成 |
| Ctrl+Enter | 发送消息 |

### 15.2 斜杠命令面板
输入 `/` 触发：`/file` `/write` `/bash` `/search` `/clear` `/model` `/export` `/help`

### 15.3 思考级别彩色 Badge
顶栏显示当前思考级别，点击循环切换，颜色编码：off(灰) minimal(绿) low(蓝) medium(黄) high(橙) xhigh(红)

### 15.4 会话统计条 + 导出
- 消息数 / Token 用量 / 上下文使用率
- 导出 Markdown

### Phase 16：终端面板 + 归档 + 暗色模式
- 底部终端面板
- 会话归档/恢复
- 暗色模式 toggle

---

## Git 提交记录 (Phase 14)

```
9b6175a fix: three-panel layout with file tree sidebar - working
118257f fix: three-panel layout render with file tree sidebar
48cf398 feat: three-panel layout with file tree sidebar, context menu, drag-drop upload
0bbbd50 feat: backend file API (list, read, download, write, delete)
```
