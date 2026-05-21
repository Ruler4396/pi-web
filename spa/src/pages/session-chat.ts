import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { ChatPanel } from "@earendil-works/pi-web-ui";
import { HttpAgent } from "../http-agent";

const THEME_KEY = "pi-theme";

function highlightCode(code: string, filename: string): string {
  let escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const kw = "fn|let|mut|const|var|function|class|return|if|else|for|while|match|impl|pub|use|mod|struct|enum|trait|async|await|import|export|from|def|self|yield|raise|try|catch|throw|new|static|void|int|string|bool|type|interface|extends|implements|package|private|protected|public|final|where|loop|break|continue|move|ref|dyn|unsafe|as|crate|super|in";
  escaped = escaped.replace(new RegExp(`\\b(${kw})\\b`, "g"), '<span class="hl-kw">$1</span>');
  escaped = escaped.replace(/\b([A-Z][a-zA-Z0-9]*)\b/g, '<span class="hl-type">$1</span>');
  escaped = escaped.replace(/"([^"\\]|\\.)*"/g, '<span class="hl-str">$&</span>');
  escaped = escaped.replace(/'([^'\\]|\\.)*'/g, '<span class="hl-str">$&</span>');
  escaped = escaped.replace(/`([^`\\]|\\.)*`/g, '<span class="hl-str">$&</span>');
  escaped = escaped.replace(/(\/\/.*$)/gm, '<span class="hl-cmt">$1</span>');
  escaped = escaped.replace(/(#.*$)/gm, '<span class="hl-cmt">$1</span>');
  escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');
  return escaped;
}

interface FileTab { path: string; name: string; content: string; }

@customElement("session-chat")
export class SessionChat extends LitElement {
  @property() sessionId = "";
  @state() private ready = false;
  @state() private error = "";
  @state() private theme: "dark" | "" = "dark";
  @state() private sessionCwd = "/root";
  @state() private hasMessages = false;
    @state() showTerminal = false;
  @state() showModelDropdown = false;
  @state() modelProvider = "deepseek"; @state() modelId = "deepseek-chat"; @state() modelLabel = "DeepSeek V4 Chat";
  @state() thinkingLevel = "off";
  @state() showAddModelDialog = false;
  recentModels: {provider: string, id: string, label: string, thinking: boolean, builtin: boolean}[] = [];
  @state() addModelForm = { provider: "", id: "", label: "", apiKey: "", baseUrl: "", thinking: false };
  @state() private terminalContent = "";
  @state() private terminalCwd = "/root";
  @state() private tabs: FileTab[] = [];
  @state() private activeTab = 0;
  @state() tabPanelWidth = 42;
  private chatPanel?: ChatPanel;
  private agent?: HttpAgent;
  private msgInterval = 0;

  // Drag-drop tracking for file tree
  private dragCounter = 0;
  @state() private fileTreeDragging = false;
  @state() private dropHintX = 0;
  @state() private dropHintY = 0;
  @state() private dropHintText = "";
  @state() private contextMenuNode: any = null;
  @state() private contextMenuX = 0;
  @state() private contextMenuY = 0;
  @state() private contextMenuVisible = false;
  @state() private dropTargetNode: string | null = null;

  static styles = css`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .error-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: var(--bg-base); text-align: center; padding: 32px; }
    .error-wrap .err-msg { color: #b91c1c; font-size: 14px; font-weight: 500; }
    .error-wrap button { margin-top: 8px; padding: 6px 18px; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
  `;

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    const saved = localStorage.getItem(THEME_KEY);
    if (!saved || saved === "" || saved === "dark") {
      this.theme = "dark";
      document.documentElement.dataset.theme = "dark";
      localStorage.setItem(THEME_KEY, "dark");
    } else if (saved === "light") {
      this.theme = "";
      document.documentElement.dataset.theme = "";
    }
    try { await this.initChat(); this.ready = true; } catch (e: any) { this.error = e.message || "Failed"; }
    this.requestUpdate();

    this.addEventListener("file-select", ((e: CustomEvent) => {
      if (e.detail?.type === "file") this.toggleFileTab(e.detail.path, e.detail.name);
    }) as EventListener);

    // Drag-drop on file tree area (global detection for sidebar)
    document.addEventListener("dragover", this.onGlobalDragOver);
    document.addEventListener("dragleave", this.onGlobalDragLeave);
    document.addEventListener("drop", this.onGlobalDrop);
    // Context menu for file tree
    this.addEventListener("file-contextmenu", ((e: Event) => {
      const ctxDetail = (e as CustomEvent).detail;
      this.contextMenuNode = ctxDetail.node;
      this.contextMenuX = ctxDetail.x;
      this.contextMenuY = ctxDetail.y;
      this.contextMenuVisible = true;
      this.requestUpdate();
    }) as EventListener);
    document.addEventListener("click", (_e: Event) => {
      if (this.contextMenuVisible) { this.contextMenuVisible = false; this.requestUpdate(); }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.msgInterval);
    this.chatPanel?.remove();
    this.chatPanel = undefined;
    document.removeEventListener("dragover", this.onGlobalDragOver);
    document.removeEventListener("dragleave", this.onGlobalDragLeave);
    document.removeEventListener("drop", this.onGlobalDrop);
  }

  async initChat() {
    this.agent = new HttpAgent(this.sessionId);
    this.chatPanel = new ChatPanel();
    this.chatPanel.style.display = "flex"; this.chatPanel.style.flexDirection = "column";
    this.chatPanel.style.flex = "1"; this.chatPanel.style.minHeight = "0";
    await this.chatPanel.setAgent(this.agent as any, {
      onBeforeSend: () => { this.hasMessages = true; this.requestUpdate(); },
      onApiKeyRequired: async () => true,
    });
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const sessions = await res.json();
        const s = sessions.find((s: any) => s.id === this.sessionId);
        if (s?.cwd) { this.sessionCwd = s.cwd; this.terminalCwd = s.cwd; }
      }
    } catch {}
    this.msgInterval = window.setInterval(() => {
      if (this.agent && this.agent.state.messages.length > 0 && !this.hasMessages) {
        this.hasMessages = true; this.requestUpdate();
      }
    }, 500);
    this.requestUpdate();
  }

  toggleModelDropdown = () => { this.showModelDropdown = !this.showModelDropdown; this.requestUpdate(); };
  selectModel = (provider: string, id: string, label: string, thinking: boolean, builtin: boolean) => {
    this.modelProvider = provider; this.modelId = id; this.modelLabel = label;
    this.thinkingLevel = thinking ? "high" : "off";
    this.showModelDropdown = false;
    if (this.agent) {
      this.agent.setModel(provider, id).catch(() => {});
      const state = this.agent.state as any;
      if (state._state) state._state.model = { provider, id, label };
    }
    // Save to recent
    const entry = { provider, id, label, thinking, builtin };
    const recents = JSON.parse(localStorage.getItem("pi-recent-models") || "[]");
    const filtered = recents.filter((r: any) => !(r.provider === provider && r.id === id));
    filtered.unshift(entry);
    localStorage.setItem("pi-recent-models", JSON.stringify(filtered.slice(0, 5)));
    this.recentModels = filtered.slice(0, 5);
    this.requestUpdate();
  };
  deleteCustomModel = (provider: string, modelId: string, e: Event) => {
    e.stopPropagation();
    fetch("/api/models/delete/" + encodeURIComponent(provider) + "/" + encodeURIComponent(modelId), { method: "DELETE" })
      .then(() => { this.loadModels(); this.requestUpdate(); })
      .catch(() => {});
  };
  toggleThinking = () => {
    const levels = ["off", "low", "medium", "high"];
    const idx = levels.indexOf(this.thinkingLevel);
    this.thinkingLevel = levels[(idx + 1) % levels.length];
    if (this.agent) this.agent.setThinking(this.thinkingLevel).catch(() => {});
    this.requestUpdate();
  };
  setThinkingLevel = (level: string) => {
    this.thinkingLevel = level;
    if (this.agent) this.agent.setThinking(level).catch(() => {});
    this.requestUpdate();
  };
  openAddModel = () => {
    this.showModelDropdown = false;
    this.showAddModelDialog = true;
    this.addModelForm = { provider: "", id: "", label: "", apiKey: "", baseUrl: "", thinking: false };
    this.requestUpdate();
  };
  closeAddModel = () => { this.showAddModelDialog = false; this.requestUpdate(); };
  submitAddModel = () => {
    const f = this.addModelForm;
    if (!f.provider || !f.id || !f.label) return;
    fetch("/api/models/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: f.provider, id: f.id, label: f.label,
        thinking: f.thinking, apiKey: f.apiKey, baseUrl: f.baseUrl
      })
    }).then(() => {
      this.showAddModelDialog = false;
      this.loadModels();
      this.selectModel(f.provider, f.id, f.label, f.thinking, false);
    }).catch(() => {});
  };
  async loadModels() {
    try {
      const res = await fetch("/api/models");
      const models = await res.json();
      if (Array.isArray(models)) {
        (this.agent!.state as any).availableModels = models;
        (this.agent!.state as any)._state.availableModels = models;
        this.requestUpdate();
      }
    } catch (_) {}
  }

  renderModelDropdown() {
    const recents = JSON.parse(localStorage.getItem("pi-recent-models") || "[]");
    const alist = (this.agent?.state as any)?.availableModels || [];
    const builtin = alist.filter((m: any) => m.builtin !== false);
    const custom = alist.filter((m: any) => m.builtin === false);
    const recentShown = new Set<string>();
    const parts: any[] = [];
    if (recents.length > 0) {
      parts.push(html`<div class="model-section-title">Recent</div>`);
      for (const r of recents.slice(0, 3)) {
        const key = r.provider + "/" + r.id;
        if (recentShown.has(key)) continue;
        recentShown.add(key);
        parts.push(html`<div class="model-option${this.modelId === r.id && this.modelProvider === r.provider ? ' active' : ''}" @click=${() => this.selectModel(r.provider, r.id, r.label, r.thinking, r.builtin)}><span>${r.label}</span><span class="model-option-sub">${r.provider}</span></div>`);
      }
    }
    if (builtin.length > 0) {
      parts.push(html`<div class="model-section-title">Built-in</div>`);
      for (const m of builtin) {
        const key = m.provider + "/" + m.id;
        if (recentShown.has(key)) continue;
        recentShown.add(key);
        parts.push(html`<div class="model-option${this.modelId === m.id && this.modelProvider === m.provider ? ' active' : ''}" @click=${() => this.selectModel(m.provider, m.id, m.label, m.thinking, m.builtin)}><span>${m.label}</span><span class="model-option-sub">${m.provider}</span></div>`);
      }
    }
    if (custom.length > 0) {
      parts.push(html`<div class="model-section-title">Custom</div>`);
      for (const m of custom) {
        parts.push(html`<div class="model-option${this.modelId === m.id && this.modelProvider === m.provider ? ' active' : ''}" @click=${() => this.selectModel(m.provider, m.id, m.label, m.thinking, m.builtin)}><span>${m.label}</span><span class="model-option-sub">${m.provider}</span><span class="model-delete-btn" @click=${(e: Event) => this.deleteCustomModel(m.provider, m.id, e)} title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></div>`);
      }
    }
    parts.push(html`<div class="model-dropdown-divider"></div>`);
    parts.push(html`<div class="model-option model-add-btn" @click=${this.openAddModel}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add model</div>`);
    return parts;
  }

  toggleTerminal = () => { this.showTerminal = !this.showTerminal; this.requestUpdate(); };

  private toggleTheme = () => {
    const next = this.theme === "dark" ? "" : "dark";
    this.theme = next;
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next === "dark" ? "dark" : "light");
  };

  async toggleFileTab(relPath: string, name: string) {
    const existing = this.tabs.findIndex(t => t.path === relPath);
    if (existing >= 0) {
      if (this.activeTab === existing) {
        this.tabs = this.tabs.filter((_, i) => i !== existing);
        this.activeTab = Math.min(this.activeTab, this.tabs.length - 1);
      } else { this.activeTab = existing; }
      this.requestUpdate(); return;
    }
    const newTab: FileTab = { path: relPath, name, content: "" };
    this.tabs = [...this.tabs, newTab];
    this.activeTab = this.tabs.length - 1;
    this.requestUpdate();
    const absPath = this.sessionCwd.replace(/\/+$/, "") + "/" + relPath;
    try {
      const res = await fetch("/api/file/read?path=" + encodeURIComponent(absPath));
      if (res.ok) {
        const data = await res.json();
        const idx = this.tabs.findIndex(t => t.path === relPath);
        if (idx >= 0) { this.tabs[idx].content = data.content || ""; this.requestUpdate(); }
      }
    } catch {}
  }

  closeTab = (index: number, e: Event) => {
    e.stopPropagation();
    this.tabs = this.tabs.filter((_, i) => i !== index);
    this.activeTab = Math.min(this.activeTab, this.tabs.length - 1);
    this.requestUpdate();
  };

  // Resize logic
  private onResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    this.resizeStartX = e.clientX; this.resizeStartW = this.tabPanelWidth; this.resizing = true;
    document.addEventListener("mousemove", this.onResizeMove);
    document.addEventListener("mouseup", this.onResizeEnd);
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  };
  private resizeStartX = 0; private resizeStartW = 0; private resizing = false;
  private onResizeMove = (e: MouseEvent) => {
    if (!this.resizing) return;
    // Get the main row element directly via shadow-aware lookup
    const row = this.shadowRoot?.querySelector(".main-row") || this.querySelector(".main-row");
    if (!row) return;
    const dx = e.clientX - this.resizeStartX;
    const cw = (row as HTMLElement).getBoundingClientRect().width;
    const newW = Math.min(65, Math.max(15, this.resizeStartW + (dx / cw) * 100));
    this.tabPanelWidth = Math.round(newW); this.requestUpdate();
  };
  private onResizeEnd = () => {
    this.resizing = false;
    document.removeEventListener("mousemove", this.onResizeMove);
    document.removeEventListener("mouseup", this.onResizeEnd);
    document.body.style.cursor = ""; document.body.style.userSelect = "";
  };

  // Global drag-drop for file tree
  private dragExpandTimer = 0;
  private dragHoverStart = 0;
  private dragHoverNode: string | null = null;
  private onGlobalDragOver = (e: DragEvent) => {
    e.preventDefault();
    const sidebar = this.querySelector(".sidebar");
    if (sidebar && sidebar.contains(e.target as Node)) {
      if (!this.fileTreeDragging) { this.fileTreeDragging = true; this.requestUpdate(); }
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const treeNode = target?.closest(".tree-node") as HTMLElement | null;
      // Clear previous drop target highlight
      if (this.dropTargetNode) {
        const prev = this.querySelector(".tree-node.drop-target");
        if (prev) prev.classList.remove("drop-target");
        this.dropTargetNode = null;
      }
      if (treeNode) {
        const name = treeNode.querySelector(".name")?.textContent?.trim() || "";
        const icon = treeNode.querySelector(".icon svg");
        const isFolder = icon && (icon.outerHTML.indexOf("M22 19a2 2 0 0 1-2 2H4") > 0 || icon.outerHTML.indexOf("M4 19.5A2.5") > 0);
        if (isFolder) {
          treeNode.classList.add("drop-target");
          this.dropTargetNode = name;
          this.dropHintText = "释放到 " + name + " 目录"; // 释放到 X 目录
          // Timestamp-based auto-expand: only set timer once per node hover
          if (this.dragHoverNode !== name) {
            this.dragHoverNode = name;
            this.dragHoverStart = Date.now();
          } else if (Date.now() - this.dragHoverStart > 600) {
            // Auto-expand: only if directory is NOT already expanded
            const ft = this.querySelector("file-tree") as any;
            const alreadyExpanded = ft && ft.expanded && ft.expanded.has(name);
            if (!alreadyExpanded) {
              treeNode.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }
            this.dragHoverNode = null;
          }
        } else {
          this.dragHoverNode = null;
          this.dropHintText = "释放到当前目录"; // 释放到当前目录
        }
        const rect = treeNode.getBoundingClientRect();
        this.dropHintX = rect.left;
        this.dropHintY = rect.bottom + 4;
      } else {
        this.dragHoverNode = null;
        this.dropHintText = "拖放文件到此处上传"; // 拖放文件到此处上传
        this.dropHintX = e.clientX;
        this.dropHintY = e.clientY + 20;
      }
      this.requestUpdate();
    }
  };
  private onGlobalDragLeave = (e: DragEvent) => {
    const sidebar = this.querySelector(".sidebar");
    if (sidebar && !sidebar.contains(e.relatedTarget as Node)) {
      this.fileTreeDragging = false;
      this.dragHoverNode = null;
      this.dragHoverStart = 0;
      if (this.dropTargetNode) {
        const prev = this.querySelector(".tree-node.drop-target");
        if (prev) prev.classList.remove("drop-target");
        this.dropTargetNode = null;
      }
      this.requestUpdate();
    }
  };
  private onGlobalDrop = (e: DragEvent) => {
    e.preventDefault();
    this.fileTreeDragging = false; this.requestUpdate();
    this.dragHoverNode = null; this.dragHoverStart = 0;
    if (this.dropTargetNode) {
      const prev = this.querySelector(".tree-node.drop-target");
      if (prev) prev.classList.remove("drop-target");
      this.dropTargetNode = null;
    }
    // Determine drop target directory
    const target = document.elementFromPoint(e.clientX, e.clientY);
    let dropCwd = this.sessionCwd;
    if (target) {
      const treeNode = target.closest(".tree-node");
      if (treeNode) {
        const name = treeNode.querySelector(".name")?.textContent?.trim();
        const icon = treeNode.querySelector(".icon svg");
        const isFolder = icon && (icon.outerHTML.indexOf("M22 19a2 2 0 0 1-2 2H4") > 0 || icon.outerHTML.indexOf("M4 19.5A2.5") > 0);
        dropCwd = this.sessionCwd.replace(/\/+$/, "") + "/" + (isFolder ? name : "");
      }
    }
    // Actually upload the files
    if (e.dataTransfer?.files) {
      this.uploadDroppedFiles(e.dataTransfer.files, dropCwd);
    }
  };
  async downloadFile(node: any) {
    if (!node || node.type === "directory") return;
    const a = document.createElement("a");
    a.href = "/api/file/download?path=" + encodeURIComponent(this.sessionCwd + "/" + node.path);
    a.download = node.name;
    a.click();
  }
  async deleteFileNode(node: any) {
    if (!node || !confirm("Delete " + node.name + "?")) return;
    try {
      await fetch("/api/file/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: this.sessionCwd + "/" + node.path }),
      });
      const ft = this.querySelector("file-tree") as any;
      if (ft && ft.loadDir) { try { await ft.loadDir(this.sessionCwd); } catch(e) {} }
    } catch(e: any) { console.error(e); }
  }

  async uploadDroppedFiles(files: FileList, cwd: string) {
    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const relPath = (file as any).webkitRelativePath || file.name;
        const fullPath = cwd.replace(/\/+$/, "") + "/" + relPath;
        await fetch("/api/file/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: fullPath, content: base64, encoding: "base64" }),
        });
      } catch(e: any) { console.error("Upload error:", e); }
    }
    // Refresh file tree
    const ft = this.querySelector("file-tree") as any;
    if (ft && ft.loadDir) {
      try { await ft.loadDir(this.sessionCwd); } catch(e) {}
    }
  }
  async runTerminalCommand(cmd: string, input: HTMLTextAreaElement) {
    this.terminalContent += this.terminalCwd + " $ " + cmd + "\n";
    input.value = "";
    this.requestUpdate();
    // Handle cd locally
    const cdMatch = cmd.trim().match(/^cd\s+(.+)$/);
    if (cdMatch) {
      const target = cdMatch[1].trim();
      let newCwd = target.startsWith("/") ? target : this.terminalCwd.replace(/\/+$/, "") + "/" + target;
      // Normalize path
      const parts = newCwd.split("/").filter(function(p) { return p && p !== "."; });
      const resolved = [];
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === "..") { if (resolved.length > 0) resolved.pop(); }
        else { resolved.push(parts[i]); }
      }
      newCwd = "/" + resolved.join("/");
      this.terminalCwd = newCwd || "/";
      this.terminalContent += "(changed to " + this.terminalCwd + ")\n";
      this.requestUpdate();
      return;
    }
    try {
      const res = await fetch("/api/shell/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, cwd: this.terminalCwd }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.stdout) this.terminalContent += data.stdout;
        if (data.stderr) this.terminalContent += data.stderr;
        if (!data.stdout && !data.stderr) this.terminalContent += "(no output)\n";
      } else {
        this.terminalContent += "(command failed)\n";
      }
    } catch(e: any) {
      this.terminalContent += "(error: " + e.message + ")\n";
    }
    this.requestUpdate();
  }

  private addLineNumbers(html: string): string {
    const lines = html.split("\n");
    return lines.map((line, i) => '<span class="code-line"><span class="line-num">' + (i + 1) + '</span>' + line + '</span>').join("\n");
  }

  render() {
    if (this.error) {
      return html`<div class="error-wrap">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div class="err-msg">${this.error}</div>
        <button @click=${() => { this.error = ""; this.connectedCallback(); }}>Retry</button>
      </div>`;
    }
    if (!this.ready || !this.chatPanel) {
      return html`<div class="error-wrap"><div class="spinner"></div><span>Loading...</span></div>`;
    }

    const sid = this.sessionId.slice(0, 8);
    const showWelcome = !this.hasMessages && this.tabs.length === 0;
    const activeTabData = this.tabs[this.activeTab];

    return html`
      <div class="chat-wrapper">
        <div class="topbar">
          <a class="back" href="#" @click=${(e: Event) => { e.preventDefault(); window.location.hash = ""; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg> Sessions
          </a>
          <span class="divider">&#183;</span><span class="sid">${sid}</span>
          <span class="divider">&#183;</span><span class="sid" style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px">${this.sessionCwd}</span>
          <div style="flex:1"></div>
          <div class="thinking-pill" @click=${this.toggleThinking} title="Thinking: ${this.thinkingLevel}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span class="thinking-label">${this.thinkingLevel}</span>
          </div>
          <div class="model-select-wrap" style="position:relative">
            <button class="model-pill" @click=${this.toggleModelDropdown} title="Switch model">
              <span class="model-pill-name">${this.modelLabel}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            ${this.showModelDropdown ? html`
              <div class="model-dropdown">
                ${this.renderModelDropdown()}
              </div>
            ` : ""}
          </div>

          <button class="theme-btn" @click=${this.toggleTerminal} title="终端">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          </button>
          <button class="theme-btn" @click=${this.toggleTheme} title="${this.theme === 'dark' ? '亮色' : '暗色'}">
            ${this.theme === "dark"
              ? html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
              : html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`}
          </button>
        </div>
        ${this.showAddModelDialog ? html`
          <div class="modal-overlay" @click=${this.closeAddModel}></div>
          <div class="model-dialog">
            <div class="model-dialog-header">
              <span>Add Model</span>
              <button class="model-dialog-close" @click=${this.closeAddModel}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="model-dialog-body">
              <div class="model-dialog-row">
                <div class="model-dialog-field">
                  <label>Provider ID</label>
                  <input type="text" placeholder="e.g. openai" .value=${this.addModelForm.provider} @input=${(e: InputEvent) => { this.addModelForm = { ...this.addModelForm, provider: (e.target as HTMLInputElement).value }; }}>
                </div>
                <div class="model-dialog-field">
                  <label>Model ID</label>
                  <input type="text" placeholder="e.g. gpt-4o" .value=${this.addModelForm.id} @input=${(e: InputEvent) => { this.addModelForm = { ...this.addModelForm, id: (e.target as HTMLInputElement).value }; }}>
                </div>
              </div>
              <div class="model-dialog-row">
                <div class="model-dialog-field">
                  <label>Display Name</label>
                  <input type="text" placeholder="e.g. GPT-4o" .value=${this.addModelForm.label} @input=${(e: InputEvent) => { this.addModelForm = { ...this.addModelForm, label: (e.target as HTMLInputElement).value }; }}>
                </div>
              </div>
              <div class="model-dialog-row">
                <div class="model-dialog-field" style="flex:1">
                  <label>API Key <span style="color:var(--text-weaker);font-weight:400">(optional)</span></label>
                  <input type="password" placeholder="sk-..." .value=${this.addModelForm.apiKey} @input=${(e: InputEvent) => { this.addModelForm = { ...this.addModelForm, apiKey: (e.target as HTMLInputElement).value }; }}>
                </div>
              </div>
              <div class="model-dialog-row">
                <div class="model-dialog-field" style="flex:1">
                  <label>Base URL <span style="color:var(--text-weaker);font-weight:400">(optional)</span></label>
                  <input type="text" placeholder="https://api.openai.com/v1" .value=${this.addModelForm.baseUrl} @input=${(e: InputEvent) => { this.addModelForm = { ...this.addModelForm, baseUrl: (e.target as HTMLInputElement).value }; }}>
                </div>
              </div>
              <div class="model-dialog-row">
                <label class="model-dialog-checkbox">
                  <input type="checkbox" .checked=${this.addModelForm.thinking} @change=${(e: Event) => { this.addModelForm = { ...this.addModelForm, thinking: (e.target as HTMLInputElement).checked }; }}>
                  <span>Thinking / Reasoning support</span>
                </label>
              </div>
            </div>
            <div class="model-dialog-footer">
              <button class="model-dialog-cancel" @click=${this.closeAddModel}>Cancel</button>
              <button class="model-dialog-submit" @click=${this.submitAddModel} ?disabled=${!this.addModelForm.provider || !this.addModelForm.id || !this.addModelForm.label}>Add Model</button>
            </div>
          </div>
        ` : ""}
        <div class="main-row" style="flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden">
          <!-- Sidebar -->
          <div class="sidebar" style="width:260px;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-base);border-right:0.5px solid rgba(255,255,255,0.07);flex-shrink:0;position:relative">
            <div class="sidebar-header">
              <span style="font-size:12px;font-weight:500;color:var(--text-weak);letter-spacing:0.04em">FILES</span>
              <file-upload></file-upload>
            </div>
            <file-tree rootpath=${this.sessionCwd} style="flex:1;overflow-y:auto;min-height:0;padding:4px 0"></file-tree>
            <div class="ft-drop-overlay ${this.fileTreeDragging ? 'active' : ''}"></div>
            <div class="ft-drop-hint ${this.fileTreeDragging ? 'active' : ''}" style="left:${this.dropHintX || 0}px;top:${this.dropHintY || 0}px">${this.dropHintText || '拖放文件到此处上传'}</div>
          </div>

          <!-- Tab panel -->
          ${this.tabs.length > 0 ? html`
            <div class="tab-panel" style="width:${this.tabPanelWidth}%;min-width:180px;display:flex;flex-direction:column;border-right:0.5px solid rgba(255,255,255,0.07);background:var(--bg-base);flex-shrink:0">
              <div class="tab-bar">
                ${this.tabs.map((t, i) => html`
                  <div class="tab ${i === this.activeTab ? 'active' : ''}" @click=${() => { this.activeTab = i; this.requestUpdate(); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span class="tab-name">${t.name}</span>
                    <button class="tab-close" @click=${(e: Event) => this.closeTab(i, e)}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                `)}
              </div>
              <div class="tab-content">
                ${activeTabData ? html`
                  <pre class="preview-code">${activeTabData.content ? unsafeHTML(this.addLineNumbers(highlightCode(activeTabData.content, activeTabData.name))) : html`<span class="preview-loading">Loading...</span>`}</pre>
                ` : ""}
              </div>
            </div>
            <div class="resize-handle${this.resizing ? ' active' : ''}" @mousedown=${this.onResizeStart}></div>
          ` : ""}

          <!-- Chat -->
          <div style="flex:1;min-height:0;display:flex;flex-direction:column;position:relative">
            ${showWelcome ? html`
              <div class="welcome">
                <div class="welcome-inner">
                  <div class="logo"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
                  <div class="title">What can I help with?</div>
                  <div class="subtitle">Type a message below to start a conversation</div>
                </div>
              </div>
            ` : ""}
            ${this.chatPanel}
          </div>
        </div>


      </div>
        ${this.showTerminal ? html`
          <div class="terminal-panel">
            <div class="terminal-header">
              <span class="terminal-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg> Terminal
              </span>
              <button class="close-btn" @click=${this.toggleTerminal}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="terminal-body">
              <div class="terminal-output-wrap"><pre class="terminal-output">${this.terminalContent}</pre></div>
              <div class="terminal-input-wrap">
                <span class="terminal-prompt">$</span>
                <textarea class="terminal-input" placeholder="type a command..." rows="1"
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const el = e.target as HTMLTextAreaElement;
                      const cmd = el.value.trim();
                      if (cmd) this.runTerminalCommand(cmd, el);
                    }
                  }}></textarea>
              </div>
            </div>
          </div>
        ` : ""}

        ${this.contextMenuVisible && this.contextMenuNode ? html`
          <div class="context-menu" style="left:${this.contextMenuX}px;top:${this.contextMenuY}px">
            ${this.contextMenuNode.type === "file" ? html`
              <div class="context-item" @click=${() => this.downloadFile(this.contextMenuNode)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download
              </div>
            ` : ""}
            <div class="context-item danger" @click=${() => this.deleteFileNode(this.contextMenuNode)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete
            </div>
          </div>
        ` : ""}
    `;
  }
}
