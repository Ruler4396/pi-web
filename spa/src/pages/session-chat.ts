import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { ChatPanel } from "@earendil-works/pi-web-ui";
import { HttpAgent } from "../http-agent";
import { notify, getNotifySettings, setNotifySettings, requestBrowserPermission } from "../notifications";
import { renderDiff } from "../diff";
import { setupToolRenderers } from "../tool-renderers";

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
  @state() modelProvider = "deepseek"; @state() modelId = "deepseek-v4-flash"; @state() modelLabel = "DeepSeek V4 Flash";
  @state() thinkingLevel = "off";
  @state() availableThinkingLevels: string[] = ["off","low","medium","high","max"];
  get modelSupportsThinking(): boolean {
    const models = (this.agent?.state as any)?.availableModels || [];
    const cur = models.find((m: any) => m.id === this.modelId);
    if (cur?.thinking && cur?.thinkingLevels?.length) {
      this.availableThinkingLevels = cur.thinkingLevels;
    }
    if (cur?.contextLimit) {
      this.contextMax = cur.contextLimit;
    }
    return cur?.thinking === true;
  }
  @state() showAddModelDialog = false;
  @state() showSettings = false;
  @state() showShortcuts = false; @state() showConfig = false;
  @state() piConfig = { defaultProvider: "deepseek", defaultModel: "deepseek-v4-flash", defaultThinkingLevel: "off", theme: "dark", hideThinkingBlock: false, language: "zh", notifySound: true, notifyBrowser: false }; @state() showSlashCommands = false; @state() slashIdx = 0;
  slashCommands = [
    { cmd: "/help", desc: "显示快捷键", action: "ui" },
    { cmd: "/clear", desc: "清空对话", action: "ui" },
    { cmd: "/models", desc: "选择模型", action: "ui" },
    { cmd: "/config", desc: "系统配置", action: "ui" },
    { cmd: "/theme dark", desc: "暗色模式", action: "ui" },
    { cmd: "/theme light", desc: "亮色模式", action: "ui" },
    { cmd: "/keys", desc: "API 密钥", action: "ui" },
    { cmd: "/init", desc: "初始化项目分析", action: "ai" },
    { cmd: "/plan", desc: "制定实施计划", action: "ai" },
    { cmd: "/goal", desc: "设定长期目标，自主迭代执行", action: "ai" },
    { cmd: "/fork", desc: "分支对话", action: "ai" },
    { cmd: "/compact", desc: "压缩上下文", action: "ai" },
    { cmd: "/btw", desc: "临时提问，不污染对话", action: "ai" },
  ];
  @state() toasts: {id: number, text: string, type: string}[] = [];
  @state() showSearch = false;
  @state() searchQuery = "";
  @state() searchResults: {file: string, line: number, content: string}[] = [];
  @state() searchLoading = false;
  @state() gitBranch = "";
  @state() gitClean = true;
  @state() gitFiles: Record<string, string> = {};
  @state() showGitDiff = false;
  @state() showCommitPanel = false;
  @state() commitMsg = "";
  @state() diffContent = "";
  @state() diffLoading = false;
  _gitInterval: any = null;
  @state() runningTools: string[] = [];
  @state() showNewFileDialog = false;
  @state() newFileName = "";
  _msgObserver: MutationObserver | null = null;
  _knownMessages = new WeakSet<Element>();
  @state() showContextDetail = false; contextTokens = 0; contextMax = 1048576; // DeepSeek V4 1M context
  @state() apiKeys: Record<string, string> = {};
  _newKeyName = ""; _newKeyValue = ""; _globalKeydown: any = null; _ctxInterval: any = null;
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
    this._globalKeydown = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        this.toggleShortcuts();
      }
      if (e.key === "," && e.ctrlKey) {
        e.preventDefault();
        this.toggleConfig();
      }
      if (e.key === "Escape") {
        if (this.showShortcuts) { this.showShortcuts = false; this.requestUpdate(); return; }
        if (this.showSettings) { this.showSettings = false; this.requestUpdate(); return; }
        if (this.showAddModelDialog) { this.showAddModelDialog = false; this.requestUpdate(); return; }
        if (this.showModelDropdown) { this.showModelDropdown = false; this.requestUpdate(); return; }
        if (this.showThinkingDropdown) { this.showThinkingDropdown = false; this.requestUpdate(); return; }
      }
    };
    document.addEventListener("keydown", this._globalKeydown);
    const saved = localStorage.getItem(THEME_KEY);
    if (!saved || saved === "" || saved === "dark") {
      this.theme = "dark";
      document.documentElement.dataset.theme = "dark";
      localStorage.setItem(THEME_KEY, "dark");
    } else if (saved === "light") {
      this.theme = "";
      document.documentElement.dataset.theme = "";
    }
    // Restore persisted model and thinking level
    try {
      const saved = JSON.parse(localStorage.getItem("pi-current-model") || "");
      if (saved?.id) { this.modelProvider = saved.provider; this.modelId = saved.id; this.modelLabel = saved.label; }
    } catch {}
    const savedThink = localStorage.getItem("pi-current-thinking");
    if (savedThink) this.thinkingLevel = savedThink;

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
    this.addEventListener("toast", ((e: CustomEvent) => {
      if (e.detail?.text) this.showToast("info", e.detail.text);
    }) as EventListener);
    this.addEventListener("file-reverted", (() => {
      this.fetchGitStatus();
      if (this.showGitDiff) this.fetchGitDiff();
    }) as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._globalKeydown) document.removeEventListener("keydown", this._globalKeydown);
    clearInterval(this.msgInterval);
    clearInterval(this._gitInterval);
    this._msgObserver?.disconnect();
    this.chatPanel?.remove();
    this.chatPanel = undefined;
    document.removeEventListener("dragover", this.onGlobalDragOver);
    document.removeEventListener("dragleave", this.onGlobalDragLeave);
    document.removeEventListener("drop", this.onGlobalDrop);
  }

  async initChat() {
    this.agent = new HttpAgent(this.sessionId);
    this.agent.subscribe((event: any) => {
      if (event.type === "agent_end" && event.messages?.length) {
        const lastMsg = event.messages[event.messages.length - 1];
        const text = lastMsg?.content?.map?.((c: any) => c.text || "").join("")?.slice(0, 100) || "";
        notify("Pi Agent", text || "Task completed");
      }
      if (event.type === "tool_execution_end") {
        const tn = (event.toolName || "").toLowerCase();
        if (tn === "write_file" || tn === "write" || tn === "edit_file" || tn === "edit" || tn === "bash") {
          setTimeout(() => {
            this.fetchGitStatus();
            if (this.showGitDiff) this.fetchGitDiff();
          }, 300);
        }
        this.runningTools = this.runningTools.filter(t => t !== event.toolName);
        this.requestUpdate();
      }
      if (event.type === "tool_execution_start") {
        const tn = event.toolName || "";
        if (!this.runningTools.includes(tn)) {
          this.runningTools = [...this.runningTools, tn];
          this.requestUpdate();
        }
      }
    });
    this.chatPanel = new ChatPanel();
    this.chatPanel.style.display = "flex"; this.chatPanel.style.flexDirection = "column";
    this.chatPanel.style.flex = "1"; this.chatPanel.style.minHeight = "0";
    await this.chatPanel.setAgent(this.agent as any, {
      onBeforeSend: () => { this.hasMessages = true; this.requestUpdate(); },
      onApiKeyRequired: async () => true,
    });

    // Hook slash command on message editor textarea
    const installSlashHook = () => {
      // ChatPanel uses light DOM, message-editor is nested under agent-interface
      const cp = this.chatPanel;
      const editor = (cp as any)?.querySelector("message-editor") || this.querySelector("message-editor");
      if (!editor) { setTimeout(installSlashHook, 500); return; }
      const ta = (editor as any).shadowRoot?.querySelector("textarea") || editor.querySelector("textarea");
      if (!ta) { setTimeout(installSlashHook, 500); return; }
      ta.addEventListener("input", (e: InputEvent) => {
        const val = (e.target as HTMLTextAreaElement).value;
        if (val === "/") { this.showSlashCommands = true; this.slashIdx = 0; this.requestUpdate(); }
        else if (this.showSlashCommands && !val.startsWith("/")) { this.showSlashCommands = false; this.requestUpdate(); }
        else if (this.showSlashCommands && val.length > 1) {
          const q = val.slice(1).toLowerCase();
          this.slashIdx = this.slashCommands.findIndex(c => c.cmd.startsWith("/" + q));
          if (this.slashIdx < 0) this.slashIdx = 0;
          this.requestUpdate();
        }
      });
      ta.addEventListener("keydown", (e: KeyboardEvent) => {
        if (!this.showSlashCommands) return;
        if (e.key === "ArrowDown") { e.preventDefault(); this.slashIdx = (this.slashIdx + 1) % this.slashCommands.length; this.requestUpdate(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); this.slashIdx = (this.slashIdx - 1 + this.slashCommands.length) % this.slashCommands.length; this.requestUpdate(); }
        else if (e.key === "Enter" && this.showSlashCommands) {
          e.preventDefault();
          const cmd = this.slashCommands[this.slashIdx];
          if (cmd) { (e.target as HTMLTextAreaElement).value = cmd.cmd + " "; this.showSlashCommands = false; this.requestUpdate(); }
        }
        else if (e.key === "Escape") { this.showSlashCommands = false; this.requestUpdate(); }
      });
    };
    setTimeout(installSlashHook, 1000);
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const sessions = await res.json();
        const s = sessions.find((s: any) => s.id === this.sessionId);
        if (s?.cwd) { this.sessionCwd = s.cwd; this.terminalCwd = s.cwd; }
      }
    } catch {}
    this.fetchGitStatus();
    this._gitInterval = window.setInterval(() => this.fetchGitStatus(), 10000);
    this.msgInterval = window.setInterval(() => {
      if (this.agent && this.agent.state.messages.length > 0 && !this.hasMessages) {
        this.hasMessages = true; this.requestUpdate();
      }
    }, 500);
    setupToolRenderers(this.sessionCwd);
    this._setupMessageObserver();
    this.requestUpdate();
  }

  toggleModelDropdown = () => { this.showModelDropdown = !this.showModelDropdown; this.requestUpdate(); };
  selectModel = (provider: string, id: string, label: string, thinking: boolean, builtin: boolean) => {
    this.modelProvider = provider; this.modelId = id; this.modelLabel = label;
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
    localStorage.setItem("pi-current-model", JSON.stringify({ provider, id, label }));
    this.requestUpdate();
  };
  deleteCustomModel = (provider: string, modelId: string, e: Event) => {
    e.stopPropagation();
    fetch("/api/models/delete/" + encodeURIComponent(provider) + "/" + encodeURIComponent(modelId), { method: "DELETE" })
      .then(() => { this.loadModels(); this.requestUpdate(); })
      .catch(() => {});
  };
  @state() showThinkingDropdown = false;
  toggleThinkingMenu = () => { this.showThinkingDropdown = !this.showThinkingDropdown; this.requestUpdate(); };
  setThinkingLevel = (level: string) => {
    this.thinkingLevel = level;
    this.showThinkingDropdown = false;
    if (this.agent) this.agent.setThinking(level).catch(() => {});
    localStorage.setItem("pi-current-thinking", level);
    this.requestUpdate();
  };

  async fetchGitStatus() {
    try {
      const res = await fetch("/api/git/status?cwd=" + encodeURIComponent(this.sessionCwd));
      if (res.ok) {
        const data = await res.json();
        this.gitBranch = data.branch || "";
        this.gitClean = data.clean !== false;
        const map: Record<string, string> = {};
        if (data.files) {
          for (const f of data.files) {
            map[f.path] = f.status;
          }
        }
        this.gitFiles = map;
      }
    } catch {}
  }

  async fetchGitDiff() {
    this.diffContent = "";
    this.diffLoading = true;
    this.requestUpdate();
    try {
      const res = await fetch("/api/git/diff?cwd=" + encodeURIComponent(this.sessionCwd));
      if (res.ok) {
        const data = await res.json();
        this.diffContent = data.diff || "";
      }
    } catch {}
    this.diffLoading = false;
    this.requestUpdate();
  }

  toggleGitDiff() {
    this.showGitDiff = !this.showGitDiff;
    this.showCommitPanel = false;
    if (this.showGitDiff) this.fetchGitDiff();
    this.requestUpdate();
  }

  estimateTokens(): number {
    let chars = 0;
    if (this.agent) {
      for (const msg of this.agent.state.messages as any[]) {
        const content = Array.isArray(msg.content)
          ? msg.content.map((c: any) => c.text || c.thinking || "").join("")
          : String(msg.content || "");
        chars += content.length;
      }
    }
    return Math.ceil(chars / 3);
  }

  getContextPercentage(): number {
    const tokens = this.estimateTokens();
    return this.contextMax > 0 ? tokens / this.contextMax : 0;
  }

  getContextTokens(): number {
    return this.contextTokens > 0 ? this.contextTokens : this.estimateTokens();
  }

  private _setupMessageObserver() {
    this._msgObserver?.disconnect();
    this._msgObserver = new MutationObserver(() => {
      this._injectMessageButtons();
    });
    const cp = this.chatPanel;
    if (cp) {
      this._msgObserver.observe(cp, { childList: true, subtree: true });
    }
  }

  private _injectMessageButtons() {
    if (!this.chatPanel) return;
    const cp = this.chatPanel;
    const userMessages = cp.querySelectorAll("user-message");
    userMessages.forEach((el) => {
      if (this._knownMessages.has(el)) return;
      this._knownMessages.add(el);
      const btn = document.createElement("button");
      btn.className = "msg-edit-btn";
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      btn.title = "Edit message";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const textEl = el.querySelector("markdown-block, p, .text-content");
        let text = textEl?.textContent?.trim() || "";
        if (!text) {
          const allText = el.textContent?.trim() || "";
          text = allText;
        }
        if (text && this.chatPanel?.agentInterface) {
          this.chatPanel.agentInterface.setInput(text, []);
        }
      });
      el.appendChild(btn);
    });

    const assistantMessages = cp.querySelectorAll("assistant-message");
    const lastAm = assistantMessages[assistantMessages.length - 1];
    if (lastAm && !this._knownMessages.has(lastAm)) {
      this._knownMessages.add(lastAm);
      const btn = document.createElement("button");
      btn.className = "msg-regen-btn";
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
      btn.title = "Regenerate response";
      btn.addEventListener("click", async (_e) => {
        const msgs = this.agent?.state.messages as any[];
        if (!msgs || msgs.length < 2) return;
        const lastUser = [...msgs].reverse().find((m: any) => m.role === "user");
        if (!lastUser) return;
        const text = Array.isArray(lastUser.content)
          ? lastUser.content.map((c: any) => c.text || "").join("")
          : String(lastUser.content || "");
        if (text && this.chatPanel?.agentInterface) {
          this.chatPanel.agentInterface.sendMessage(text);
        }
      });
      lastAm.appendChild(btn);
    }
  }

  toggleNewFileDialog() {
    this.showNewFileDialog = !this.showNewFileDialog;
    this.newFileName = "";
    this.requestUpdate();
  }

  async createNewFile() {
    const name = this.newFileName.trim();
    if (!name) return;
    const fullPath = this.sessionCwd.replace(/\/+$/, "") + "/" + name;
    if (name.endsWith("/")) {
      try {
        await fetch("/api/shell/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: `mkdir -p ${JSON.stringify(fullPath.slice(0, -1))}`, cwd: this.sessionCwd }),
        });
      } catch {}
    } else {
      try {
        await fetch("/api/file/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: fullPath, content: "" }),
        });
      } catch {}
    }
    this.newFileName = "";
    this.showNewFileDialog = false;
    const ft = this.querySelector("file-tree") as any;
    if (ft?.loadDir) { try { await ft.loadDir(this.sessionCwd); } catch(_) {} }
    this.fetchGitStatus();
    this.requestUpdate();
  }

  showToast(type: string, text: string) {
    const id = Date.now();
    this.toasts = [...this.toasts, { id, text, type }];
    this.requestUpdate();
    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== id);
      this.requestUpdate();
    }, 3500);
  }

  toggleSearch() {
    this.showSearch = !this.showSearch;
    if (!this.showSearch) { this.searchQuery = ""; this.searchResults = []; }
    this.requestUpdate();
    if (this.showSearch) {
      setTimeout(() => {
        const input = this.querySelector(".search-input") as HTMLInputElement;
        input?.focus();
      }, 100);
    }
  }

  async doSearch() {
    const q = this.searchQuery.trim();
    if (!q || q.length < 2) { this.searchResults = []; this.requestUpdate(); return; }
    this.searchLoading = true;
    this.requestUpdate();
    try {
      const res = await fetch("/api/shell/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `grep -rn --color=never -I ${JSON.stringify(q)} . 2>/dev/null | head -200`,
          cwd: this.sessionCwd,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const lines = (data.stdout || "").split("\n").filter((l: string) => l.trim());
        this.searchResults = lines.map((l: string) => {
          const m = l.match(/^([^:]+):(\d+):(.*)$/);
          return m ? { file: m[1], line: parseInt(m[2]), content: m[3] } : { file: l, line: 0, content: "" };
        }).filter((r: any) => r.file !== "." && !r.file.startsWith("./."));
      }
    } catch {}
    this.searchLoading = false;
    this.requestUpdate();
  }

  searchResultClick(file: string, line: number) {
    const name = file.split("/").pop() || file;
    this.toggleFileTab(file, name);
    this.showSearch = false;
    this.requestUpdate();
  }

  async undoFile(filePath: string) {
    try {
      const res = await fetch("/api/shell/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `git checkout -- ${JSON.stringify(filePath)}`,
          cwd: this.sessionCwd,
        }),
      });
      if (res.ok) {
        this.showToast("info", "Reverted: " + filePath);
        this.fetchGitStatus();
        if (this.showGitDiff) this.fetchGitDiff();
        const ft = this.querySelector("file-tree") as any;
        if (ft?.loadDir) ft.loadDir(this.sessionCwd).catch(() => {});
      }
    } catch {}
  }

  async undoAll() {
    try {
      const res = await fetch("/api/shell/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "git checkout -- . 2>/dev/null; git clean -fd 2>/dev/null",
          cwd: this.sessionCwd,
        }),
      });
      if (res.ok) {
        this.showToast("info", "All changes reverted");
        this.fetchGitStatus();
        if (this.showGitDiff) this.fetchGitDiff();
        const ft = this.querySelector("file-tree") as any;
        if (ft?.loadDir) ft.loadDir(this.sessionCwd).catch(() => {});
      }
    } catch {}
  }

  toggleCommitPanel() {
    this.showCommitPanel = !this.showCommitPanel;
    this.showGitDiff = false;
    if (this.showCommitPanel) this.fetchGitDiff();
    this.requestUpdate();
  }

  async doCommit() {
    if (!this.commitMsg.trim()) return;
    const cmd = "git add -A && git commit -m " + JSON.stringify(this.commitMsg) + " && git push";
    try {
      const res = await fetch("/api/shell/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, cwd: this.sessionCwd }),
      });
      if (res.ok) {
        const data = await res.json();
        this.terminalContent += this.sessionCwd + " $ git commit && git push\n" + (data.stdout || "") + (data.stderr || "") + "\n";
        this.commitMsg = "";
        this.showCommitPanel = false;
        this.fetchGitStatus();
        this.requestUpdate();
        this.showToast("info", "Committed & pushed");
      }
    } catch {}
  }

  handleCommand(cmd: string) {
    var c = cmd.trim().toLowerCase();
    if (c === "/help") { this.showShortcuts = true; this.requestUpdate(); return; }
    if (c === "/keys" || c === "/settings") { this.toggleSettings(); return; }
    if (c === "/config") { this.toggleConfig(); return; }
    if (c === "/models") { this.showModelDropdown = true; this.requestUpdate(); return; }
    if (c === "/theme dark") { this.theme = "dark"; document.documentElement.dataset.theme = "dark"; localStorage.setItem("pi-theme", "dark"); this.requestUpdate(); return; }
    if (c === "/theme light") { this.theme = ""; document.documentElement.dataset.theme = "light"; localStorage.setItem("pi-theme", "light"); this.requestUpdate(); return; }
    if (c === "/clear") {
      if (this.agent) { this.agent.state.messages = []; }
      this.hasMessages = false; this.requestUpdate(); return;
    }
    // /btw: send to agent with btw flag (don't persist to main history)
    if (c.startsWith("/btw ")) {
      return; // http-agent handles this
    }
    // /goal: start autonomous agent loop (pi_rust handles iteration)
    if (c.startsWith("/goal ")) {
      return; // pi_rust handles autonomous execution
    }
    // Pass-through AI commands
    if (["/fork", "/plan", "/init", "/compact"].some(x => c === x || c.startsWith(x + " "))) {
      return;
    }
  }

  toggleConfig = async () => {
    this.showConfig = !this.showConfig;
    if (this.showConfig) {
      try { const r = await fetch("/api/config"); this.piConfig = await r.json(); } catch {}
      const ns = getNotifySettings();
      this.piConfig = { ...this.piConfig, notifySound: ns.sound, notifyBrowser: ns.browser };
    }
    this.requestUpdate();
  };
  saveConfig = async () => {
    await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(this.piConfig) });
    setNotifySettings({ sound: this.piConfig.notifySound, browser: this.piConfig.notifyBrowser });
    const { notifySound: _, notifyBrowser: __, ...serverConfig } = this.piConfig;
    // Apply theme
    const t = serverConfig.theme;
    this.theme = t === "dark" ? "dark" : "";
    document.documentElement.dataset.theme = t === "dark" ? "dark" : "light";
    localStorage.setItem("pi-theme", t);
    // Apply default model
    if (serverConfig.defaultModel && this.modelId !== serverConfig.defaultModel) {
      this.modelProvider = serverConfig.defaultProvider || "deepseek";
      this.modelId = serverConfig.defaultModel;
    }
    this.thinkingLevel = serverConfig.defaultThinkingLevel || "off";
    this.showConfig = false;
    this.requestUpdate();
    // Request browser permission if enabled
    if (this.piConfig.notifyBrowser) requestBrowserPermission();
  };

  toggleShortcuts = () => { this.showShortcuts = !this.showShortcuts; this.requestUpdate(); };

  toggleSettings = async () => {
    this.showSettings = !this.showSettings;
    if (this.showSettings) {
      try {
        const res = await fetch("/api/keys");
        this.apiKeys = await res.json();
      } catch (_) {}
    }
    this.requestUpdate();
  };
  saveApiKeys = async () => {
    await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.apiKeys),
    });
    this.showSettings = false;
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
      parts.push(html`<div class="model-section-title">最近使用</div>`);
      for (const r of recents.slice(0, 3)) {
        const key = r.provider + "/" + r.id;
        if (recentShown.has(key)) continue;
        recentShown.add(key);
        parts.push(html`<div class="model-option${this.modelId === r.id && this.modelProvider === r.provider ? ' active' : ''}" @click=${() => this.selectModel(r.provider, r.id, r.label, r.thinking, r.builtin)}><span>${r.label}</span><span class="model-option-sub">${r.provider}</span></div>`);
      }
    }
    if (builtin.length > 0) {
      parts.push(html`<div class="model-section-title">内置模型</div>`);
      for (const m of builtin) {
        const key = m.provider + "/" + m.id;
        if (recentShown.has(key)) continue;
        recentShown.add(key);
        parts.push(html`<div class="model-option${this.modelId === m.id && this.modelProvider === m.provider ? ' active' : ''}" @click=${() => this.selectModel(m.provider, m.id, m.label, m.thinking, m.builtin)}><span>${m.label}</span><span class="model-option-sub">${m.provider}</span></div>`);
      }
    }
    if (custom.length > 0) {
      parts.push(html`<div class="model-section-title">自定义</div>`);
      for (const m of custom) {
        parts.push(html`<div class="model-option${this.modelId === m.id && this.modelProvider === m.provider ? ' active' : ''}" @click=${() => this.selectModel(m.provider, m.id, m.label, m.thinking, m.builtin)}><span>${m.label}</span><span class="model-option-sub">${m.provider}</span><span class="model-delete-btn" @click=${(e: Event) => this.deleteCustomModel(m.provider, m.id, e)} title="删除"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></div>`);
      }
    }
    parts.push(html`<div class="model-dropdown-divider"></div>`);
    parts.push(html`<div class="model-option model-add-btn" @click=${this.openAddModel}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> 添加模型</div>`);
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
          ${this.runningTools.length > 0 ? html`
            <div class="tool-indicator">
              <span class="tool-spinner"></span>
              <span class="tool-label">${this.runningTools[0]}</span>
            </div>
          ` : ""}
          <div style="flex:1"></div>
          ${this.modelSupportsThinking ? html`<div class="thinking-wrap" style="position:relative">
            <button class="thinking-pill thinking-${this.thinkingLevel}" @click=${this.toggleThinkingMenu} title="思考: ${this.thinkingLevel}">
              <span class="thinking-dot"></span>
              <span class="thinking-label">${this.thinkingLevel === "off" ? "Off" : this.thinkingLevel.charAt(0).toUpperCase() + this.thinkingLevel.slice(1)}</span>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            ${this.showThinkingDropdown ? html`
              <div class="thinking-dropdown">
                ${this.availableThinkingLevels.map(lvl => {
                  const labels: Record<string, string> = { off: "关", low: "低", medium: "中", high: "高", max: "最大", xhigh: "XHigh" };
                  return html`<div class="model-option thinking-opt-${lvl} ${this.thinkingLevel === lvl ? "active" : ""}" @click=${() => this.setThinkingLevel(lvl)}>${labels[lvl] || lvl}</div>`;
                })}
              </div>
            ` : ""}
          </div>` : ""}
          <div class="model-select-wrap" style="position:relative">
            <button class="model-pill" @click=${this.toggleModelDropdown} title="切换模型">
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
          <button class="theme-btn" @click=${this.toggleSettings} title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button class="theme-btn" @click=${this.toggleTheme} title="${this.theme === 'dark' ? '亮色' : '暗色'}">
            ${this.theme === "dark"
              ? html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
              : html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`}
          </button>
          <button class="theme-btn" @click=${this.toggleShortcuts} title="快捷键 (?)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
        </div>
        ${this.showShortcuts ? html`
          <div class="shortcuts-panel">
            <div class="shortcuts-header">
              <span>键盘快捷键</span>
              <button class="shortcuts-close" @click=${() => { this.showShortcuts = false; this.requestUpdate(); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="shortcuts-body">
              <div class="shortcuts-section">全局</div>
              <div class="shortcut-row"><kbd>?</kbd><span>切换快捷键面板</span></div>
              <div class="shortcut-row"><kbd>Esc</kbd><span>关闭对话框 / 下拉菜单</span>
              <div class="shortcut-row"><kbd>Ctrl+,</kbd><span>系统配置</span></div></div>
              <div class="shortcuts-section">编辑器</div>
              <div class="shortcut-row"><kbd>Enter</kbd><span>发送消息</span></div>
              <div class="shortcut-row"><kbd>Shift+Enter</kbd><span>换行</span></div>
              <div class="shortcuts-section">终端</div>
              <div class="shortcut-row"><kbd>Enter</kbd><span>执行命令</span></div>
              <div class="shortcuts-section">输入框</div>
              <div class="shortcut-row"><kbd>/</kbd><span>打开命令菜单 (上下键选择, 回车确认)</span></div>
            </div>
          </div>
        ` : ""}
        ${this.showSettings ? html`
          <div class="modal-overlay" @click=${() => { this.showSettings = false; this.requestUpdate(); }}></div>
          <div class="model-dialog" style="width:400px">
            <div class="model-dialog-header">
              <span>API 密钥</span>
              <button class="model-dialog-close" @click=${() => { this.showSettings = false; this.requestUpdate(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="model-dialog-body" style="max-height:60vh;overflow-y:auto">
              ${Object.keys(this.apiKeys).length === 0 ? html`<div style="color:var(--text-weaker);font-size:13px;padding:20px 0;text-align:center">未配置 API 密钥</div>` : ""}
              ${Object.entries(this.apiKeys).map(([name, value]) => html`
                <div class="model-dialog-row" style="align-items:flex-end">
                  <div class="model-dialog-field" style="flex:1">
                    <label>${name}</label>
                    <input type="password" .value=${value || ""} @input=${(e: InputEvent) => { this.apiKeys = { ...this.apiKeys, [name]: (e.target as HTMLInputElement).value }; }}>
                  </div>
                  <button style="width:28px;height:28px;padding:4px;background:none;border:none;border-radius:4px;cursor:pointer;color:var(--text-weaker);flex-shrink:0;margin-bottom:1px" @click=${() => { const newKeys = { ...this.apiKeys }; delete newKeys[name]; this.apiKeys = newKeys; this.requestUpdate(); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              `)}
              <div class="model-dialog-row" style="align-items:flex-end">
                <div class="model-dialog-field" style="flex:1">
                  <label>添加密钥</label>
                  <input type="text" placeholder="密钥名称" .value=${this._newKeyName || ""} @input=${(e: InputEvent) => { this._newKeyName = (e.target as HTMLInputElement).value; }}>
                </div>
                <div class="model-dialog-field" style="flex:1">
                  <label>&nbsp;</label>
                  <input type="password" placeholder="值" .value=${this._newKeyValue || ""} @input=${(e: InputEvent) => { this._newKeyValue = (e.target as HTMLInputElement).value; }}>
                </div>
                <button style="width:28px;height:28px;padding:4px;background:none;border:none;border-radius:4px;cursor:pointer;color:var(--accent);flex-shrink:0;margin-bottom:1px" @click=${() => { if (this._newKeyName) { this.apiKeys = { ...this.apiKeys, [this._newKeyName!]: this._newKeyValue || "" }; this._newKeyName = ""; this._newKeyValue = ""; this.requestUpdate(); } }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
            </div>
            <div class="model-dialog-footer">
              <div style="font-size:11px;color:var(--text-weaker);flex:1;padding-top:4px">密钥保存在 keys.json，注入为 pi 进程的环境变量</div>
              <button class="model-dialog-cancel" @click=${() => { this.showSettings = false; this.requestUpdate(); }}>取消</button>
              <button class="model-dialog-submit" @click=${this.saveApiKeys}>保存</button>
            </div>
          </div>
        ` : ""}
        ${this.showConfig ? html`
          <div class="modal-overlay" @click=${() => { this.showConfig = false; this.requestUpdate(); }}></div>
          <div class="model-dialog" style="width:400px">
            <div class="model-dialog-header">
              <span>系统配置</span>
              <button class="model-dialog-close" @click=${() => { this.showConfig = false; this.requestUpdate(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="model-dialog-body" style="max-height:60vh;overflow-y:auto">
              <div class="model-dialog-section-title">默认行为</div>
              <div class="model-dialog-row">
                <div class="model-dialog-field">
                  <label>默认思考等级</label>
                  <select style="padding:7px 10px;font-size:13px;border:none;border-radius:6px;background:var(--bg-weak);color:var(--text-base);font-family:ui-sans-serif,system-ui,sans-serif;outline:none;box-shadow:0 0 0 1px var(--border-color)" .value=${this.piConfig.defaultThinkingLevel} @change=${(e: Event) => { this.piConfig = { ...this.piConfig, defaultThinkingLevel: (e.target as HTMLSelectElement).value }; }}>
                    <option value="off">关</option>
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="max">最大</option>
                  </select>
                </div>
              </div>
              <div class="model-dialog-section-title">外观</div>
              <div class="model-dialog-row">
                <div class="model-dialog-field">
                  <label>主题</label>
                  <select style="padding:7px 10px;font-size:13px;border:none;border-radius:6px;background:var(--bg-weak);color:var(--text-base);font-family:ui-sans-serif,system-ui,sans-serif;outline:none;box-shadow:0 0 0 1px var(--border-color)" .value=${this.piConfig.theme} @change=${(e: Event) => { this.piConfig = { ...this.piConfig, theme: (e.target as HTMLSelectElement).value }; }}>
                    <option value="dark">暗色</option>
                    <option value="light">亮色</option>
                  </select>
                </div>
                <div class="model-dialog-field">
                  <label>语言</label>
                  <select style="padding:7px 10px;font-size:13px;border:none;border-radius:6px;background:var(--bg-weak);color:var(--text-base);font-family:ui-sans-serif,system-ui,sans-serif;outline:none;box-shadow:0 0 0 1px var(--border-color)" .value=${this.piConfig.language} @change=${(e: Event) => { this.piConfig = { ...this.piConfig, language: (e.target as HTMLSelectElement).value }; }}>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
              <div class="model-dialog-section-title">通知</div>
              <div class="model-dialog-row">
                <label class="model-dialog-checkbox">
                  <input type="checkbox" .checked=${this.piConfig.notifySound} @change=${(e: Event) => { this.piConfig = { ...this.piConfig, notifySound: (e.target as HTMLInputElement).checked }; }}>
                  <span>任务完成时播放提示音</span>
                </label>
              </div>
              <div class="model-dialog-row">
                <label class="model-dialog-checkbox">
                  <input type="checkbox" .checked=${this.piConfig.notifyBrowser} @change=${(e: Event) => { this.piConfig = { ...this.piConfig, notifyBrowser: (e.target as HTMLInputElement).checked }; }}>
                  <span>任务完成时浏览器桌面通知</span>
                </label>
              </div>
              <div class="model-dialog-section-title">对话</div>
              <div class="model-dialog-row">
                <label class="model-dialog-checkbox">
                  <input type="checkbox" .checked=${this.piConfig.hideThinkingBlock} @change=${(e: Event) => { this.piConfig = { ...this.piConfig, hideThinkingBlock: (e.target as HTMLInputElement).checked }; }}>
                  <span>默认折叠思考块</span>
                </label>
              </div>
            </div>
            <div class="model-dialog-footer">
              <button class="model-dialog-cancel" @click=${() => { this.showConfig = false; this.requestUpdate(); }}>取消</button>
              <button class="model-dialog-submit" @click=${this.saveConfig}>保存</button>
            </div>
          </div>
        ` : ""}
        ${this.showAddModelDialog ? html`
          <div class="modal-overlay" @click=${this.closeAddModel}></div>
          <div class="model-dialog">
            <div class="model-dialog-header">
              <span>添加模型</span>
              <button class="model-dialog-close" @click=${this.closeAddModel}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="model-dialog-body">
              <div class="model-dialog-row">
                <div class="model-dialog-field">
                  <label>厂商 ID</label>
                  <input type="text" placeholder="例如 openai" .value=${this.addModelForm.provider} @input=${(e: InputEvent) => { this.addModelForm = { ...this.addModelForm, provider: (e.target as HTMLInputElement).value }; }}>
                </div>
                <div class="model-dialog-field">
                  <label>模型 ID</label>
                  <input type="text" placeholder="例如 gpt-4o" .value=${this.addModelForm.id} @input=${(e: InputEvent) => { this.addModelForm = { ...this.addModelForm, id: (e.target as HTMLInputElement).value }; }}>
                </div>
              </div>
              <div class="model-dialog-row">
                <div class="model-dialog-field">
                  <label>显示名称</label>
                  <input type="text" placeholder="例如 GPT-4o" .value=${this.addModelForm.label} @input=${(e: InputEvent) => { this.addModelForm = { ...this.addModelForm, label: (e.target as HTMLInputElement).value }; }}>
                </div>
              </div>
              <div class="model-dialog-row">
                <div class="model-dialog-field" style="flex:1">
                  <label>API 密钥 <span style="color:var(--text-weaker);font-weight:400">(可选)</span></label>
                  <input type="password" placeholder="sk-..." .value=${this.addModelForm.apiKey} @input=${(e: InputEvent) => { this.addModelForm = { ...this.addModelForm, apiKey: (e.target as HTMLInputElement).value }; }}>
                </div>
              </div>
              <div class="model-dialog-row">
                <div class="model-dialog-field" style="flex:1">
                  <label>接口地址 <span style="color:var(--text-weaker);font-weight:400">(可选)</span></label>
                  <input type="text" placeholder="https://api.openai.com/v1" .value=${this.addModelForm.baseUrl} @input=${(e: InputEvent) => { this.addModelForm = { ...this.addModelForm, baseUrl: (e.target as HTMLInputElement).value }; }}>
                </div>
              </div>
              <div class="model-dialog-row">
                <label class="model-dialog-checkbox">
                  <input type="checkbox" .checked=${this.addModelForm.thinking} @change=${(e: Event) => { this.addModelForm = { ...this.addModelForm, thinking: (e.target as HTMLInputElement).checked }; }}>
                  <span>支持思考 / 推理</span>
                </label>
              </div>
            </div>
            <div class="model-dialog-footer">
              <button class="model-dialog-cancel" @click=${this.closeAddModel}>取消</button>
              <button class="model-dialog-submit" @click=${this.submitAddModel} ?disabled=${!this.addModelForm.provider || !this.addModelForm.id || !this.addModelForm.label}>添加模型</button>
            </div>
          </div>
        ` : ""}
        <div class="main-row" style="flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden">
          <!-- Sidebar -->
          <div class="sidebar" style="width:260px;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-base);border-right:0.5px solid rgba(255,255,255,0.07);flex-shrink:0;position:relative">
            <div class="sidebar-header">
              <span style="font-size:12px;font-weight:500;color:var(--text-weak);letter-spacing:0.04em">FILES</span>
              <div class="sidebar-header-actions">
                <button class="file-action-btn" @click=${this.toggleSearch} title="Search in files">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
                <button class="file-action-btn" @click=${this.toggleNewFileDialog} title="New file/folder">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <file-upload></file-upload>
              </div>
            </div>
            ${this.showSearch ? html`
              <div class="search-bar">
                <input class="search-input" placeholder="Search files..." .value=${this.searchQuery} @input=${(e: InputEvent) => { this.searchQuery = (e.target as HTMLInputElement).value; }} @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this.doSearch(); if (e.key === "Escape") { this.showSearch = false; this.requestUpdate(); } }}>
                <div class="search-results ${this.searchResults.length > 0 || this.searchLoading ? 'active' : ''}">
                  ${this.searchLoading ? html`<div class="search-loading">Searching...</div>` : ""}
                  ${this.searchResults.length > 0 ? html`
                    ${this.searchResults.slice(0, 80).map((r: any) => html`
                      <div class="search-result" @click=${() => this.searchResultClick(r.file, r.line)}>
                        <span class="sr-file">${r.file}</span>
                        <span class="sr-line">:${r.line}</span>
                        <span class="sr-text">${r.content.slice(0, 100)}</span>
                      </div>
                    `)}
                    ${this.searchResults.length > 80 ? html`<div class="search-more">... ${this.searchResults.length - 80} more results</div>` : ""}
                  ` : ""}
                </div>
              </div>
            ` : ""}
            ${this.showNewFileDialog ? html`
              <div class="new-file-dialog">
                <input class="new-file-input" placeholder="filename.ts or folder/" .value=${this.newFileName} @input=${(e: InputEvent) => { this.newFileName = (e.target as HTMLInputElement).value; }} @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this.createNewFile(); if (e.key === "Escape") { this.showNewFileDialog = false; this.requestUpdate(); } }}>
                <button class="file-action-btn primary" @click=${this.createNewFile} ?disabled=${!this.newFileName.trim()}>Create</button>
              </div>
            ` : ""}
            <file-tree rootpath=${this.sessionCwd} .gitStatus=${this.gitFiles} style="flex:1;overflow-y:auto;min-height:0;padding:4px 0"></file-tree>
            <div class="sidebar-footer">
              ${this.gitBranch ? html`
                <div class="git-bar">
                  <span class="git-branch-label">${this.gitBranch}</span>
                  <span class="git-dirty-dot ${this.gitClean ? 'clean' : 'dirty'}"></span>
                  <span class="git-action-btn" @click=${this.toggleGitDiff} title="Git Diff">Diff</span>
                  <span class="git-action-btn" @click=${this.toggleCommitPanel} title="Commit & Push">Commit</span>
                </div>
              ` : html`<div class="git-bar"><span style="font-size:11px;color:var(--text-weaker)">not a git repo</span></div>`}
            </div>
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
            <div class="context-bar ${this.getContextPercentage() > 0.8 ? 'ctx-crit' : ''} ${this.getContextPercentage() > 0.95 ? 'ctx-danger' : ''}" @click=${() => { this.showContextDetail = !this.showContextDetail; this.requestUpdate(); }}>
              <div class="context-bar-fill ${this.getContextPercentage() > 0.8 ? 'ctx-warn' : ''}" style="width:${Math.min(100, this.getContextPercentage() * 100)}%"></div>
              <span class="context-bar-text"><span class="ctx-label">上下文</span> ${this.getContextTokens().toLocaleString()} / ${this.contextMax >= 1000000 ? (this.contextMax/1048576).toFixed(0) + "M" : (this.contextMax/1000).toFixed(0) + "k"}</span>
              ${this.getContextPercentage() > 0.85 ? html`<span class="ctx-compact-hint" @click=${(e: Event) => { e.stopPropagation(); if (this.chatPanel?.agentInterface) { const editor = this.chatPanel.querySelector("message-editor"); const ta = (editor as any)?.shadowRoot?.querySelector("textarea") || editor?.querySelector("textarea"); if (ta) { (ta as HTMLTextAreaElement).value = "/compact "; ta.focus(); } } }}>Compact</span>` : ""}
              ${this.showContextDetail ? html`
                <div class="context-detail">
                  <div class="ctx-detail-row"><span>已用 token</span><span>${this.getContextTokens().toLocaleString()}</span></div>
                  <div class="ctx-detail-row"><span>总量限制</span><span>${this.contextMax >= 1000000 ? (this.contextMax/1048576).toFixed(0) + "M" : (this.contextMax/1000).toFixed(0) + "k"}</span></div>
                  <div class="ctx-detail-row"><span>使用率</span><span>${(this.getContextPercentage() * 100).toFixed(1)}%</span></div>
                  <div class="ctx-detail-row"><span>消息数</span><span>${this.agent?.state.messages.length || 0}</span></div>
                  <div class="ctx-detail-row"><span>模型</span><span>${this.modelLabel}</span></div>
                  <div class="ctx-detail-row"><span>思考等级</span><span>${this.thinkingLevel}</span></div>
                  <div class="ctx-detail-row"><span>流式状态</span><span>${this.agent?.state.isStreaming ? '进行中' : '空闲'}</span></div>
                  <div class="ctx-detail-row"><span>估算方式</span><span>字符数 ÷ 3</span></div>
                </div>
              ` : ""}
            </div>
            <div class="slash-dropdown ${this.showSlashCommands ? 'active' : ''}">
              ${this.slashCommands.map((c, i) => html`
                ${i === 7 ? html`<div class="slash-section">AI 指令</div>` : ""}
                <div class="slash-item${i === this.slashIdx ? ' selected' : ''}" @click=${() => {
                  const cp = this.chatPanel;
                  const editor = (cp as any)?.querySelector("message-editor") || this.querySelector("message-editor");
                  const ta = (editor as any)?.shadowRoot?.querySelector("textarea") || editor?.querySelector("textarea");
                  if (ta) { (ta as HTMLTextAreaElement).value = c.cmd + " "; ta.focus(); }
                  this.showSlashCommands = false;
                  this.requestUpdate();
                }}>
                  <span class="slash-label">${c.cmd}</span>
                  <span class="slash-desc">${c.desc}</span>
                  ${c.action === "ai" ? html`<span class="slash-badge">AI</span>` : ""}
                </div>
              `)}
            </div>
            ${this.chatPanel}
          </div>
        </div>


      </div>
        ${this.showGitDiff ? html`
          <div class="git-panel">
            <div class="terminal-header">
              <span class="terminal-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Git Diff
              </span>
              <div class="git-panel-actions">
                ${!this.gitClean ? html`<button class="terminal-action-btn" @click=${() => { fetch("/api/shell/exec", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "git add -A", cwd: this.sessionCwd }) }).then(() => { this.fetchGitStatus(); this.fetchGitDiff(); }); }}>Stage All</button>` : ""}
                ${!this.gitClean ? html`<button class="terminal-action-btn undo-all" @click=${this.undoAll}>Undo All</button>` : ""}
                <button class="close-btn" @click=${() => { this.showGitDiff = false; this.requestUpdate(); }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div class="git-panel-body">
              ${this.diffLoading ? html`<div class="spinner" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"></div>` : ""}
              ${Object.keys(this.gitFiles).length > 0 ? html`
                <div class="git-file-list">
                  ${Object.entries(this.gitFiles).map(([path, status]) => html`
                    <div class="git-file-item">
                      <span class="git-file-status git-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                      <span class="git-file-path">${path}</span>
                      <button class="git-file-undo" @click=${() => this.undoFile(path)} title="Undo this file">Undo</button>
                    </div>
                  `)}
                </div>
              ` : ""}
              ${this.diffContent ? html`<pre class="diff-view">${unsafeHTML(renderDiff(this.diffContent))}</pre>` : html`<div class="diff-empty">No changes</div>`}
            </div>
          </div>
        ` : ""}
        ${this.showCommitPanel ? html`
          <div class="git-panel">
            <div class="terminal-header">
              <span class="terminal-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Commit & Push
              </span>
              <button class="close-btn" @click=${() => { this.showCommitPanel = false; this.requestUpdate(); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="git-panel-body" style="display:flex;flex-direction:column;gap:8px">
              ${this.diffLoading ? html`<div class="spinner" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"></div>` : ""}
              <div class="commit-diff-preview" style="max-height:160px;overflow-y:auto;flex-shrink:0">
                ${this.diffContent ? html`<pre class="diff-view" style="max-height:160px">${unsafeHTML(renderDiff(this.diffContent, 4000))}</pre>` : html`<div class="diff-empty">No staged changes</div>`}
              </div>
              <textarea class="commit-input" placeholder="Commit message..." .value=${this.commitMsg} @input=${(e: InputEvent) => { this.commitMsg = (e.target as HTMLTextAreaElement).value; }} rows="3"></textarea>
              <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="terminal-action-btn" @click=${() => { this.showCommitPanel = false; this.requestUpdate(); }}>Cancel</button>
                <button class="terminal-action-btn primary" ?disabled=${!this.commitMsg.trim()} @click=${this.doCommit}>Commit & Push</button>
              </div>
            </div>
          </div>
        ` : ""}
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
