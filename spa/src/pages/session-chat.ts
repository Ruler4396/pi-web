import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { ChatPanel } from "@earendil-works/pi-web-ui";
import { HttpAgent } from "../http-agent";

const THEME_KEY = "pi-theme";

function highlightCode(code: string, filename: string): string {
  const ext = (filename.split(".").pop() || "").toLowerCase();
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
  @state() private showTerminal = false;
  @state() private terminalContent = "";
  @state() private tabs: FileTab[] = [];
  @state() private activeTab = 0;
  @state() private tabPanelWidth = 42; // percentage
  private chatPanel?: ChatPanel;
  private agent?: HttpAgent;
  private msgInterval = 0;

  static styles = css`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .loading-wrap, .error-wrap {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 12px; background: var(--bg-base);
    }
    .error-wrap .err-msg { color: #b91c1c; font-size: 14px; font-weight: 500; }
    .error-wrap button { margin-top: 8px; padding: 6px 18px; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .resize-handle {
      width: 3px; cursor: col-resize; flex-shrink: 0;
      background: transparent; transition: background 0.15s;
      position: relative; z-index: 2;
    }
    .resize-handle:hover, .resize-handle.active { background: rgba(37,99,235,0.3); }
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
      const node = e.detail;
      if (node && node.type === "file") this.toggleFileTab(node.path, node.name);
    }) as EventListener);
  }

  async initChat() {
    this.agent = new HttpAgent(this.sessionId);
    this.chatPanel = new ChatPanel();
    this.chatPanel.style.display = "flex";
    this.chatPanel.style.flexDirection = "column";
    this.chatPanel.style.flex = "1";
    this.chatPanel.style.minHeight = "0";
    await this.chatPanel.setAgent(this.agent as any, {
      onBeforeSend: () => { this.hasMessages = true; this.requestUpdate(); },
      onApiKeyRequired: async () => true,
    });
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const sessions = await res.json();
        const s = sessions.find((s: any) => s.id === this.sessionId);
        if (s?.cwd) this.sessionCwd = s.cwd;
      }
    } catch {}
    this.msgInterval = window.setInterval(() => {
      if (this.agent && this.agent.state.messages.length > 0 && !this.hasMessages) {
        this.hasMessages = true; this.requestUpdate();
      }
    }, 500);
    this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.msgInterval);
    this.chatPanel?.remove();
    this.chatPanel = undefined;
  }

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
      } else {
        this.activeTab = existing;
      }
      this.requestUpdate();
      return;
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

  toggleTerminal = () => {
    this.showTerminal = !this.showTerminal;
    this.requestUpdate();
  };

  private resizeStartX = 0;
  private resizeStartW = 0;
  private resizing = false;

  onResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    this.resizeStartX = e.clientX;
    this.resizeStartW = this.tabPanelWidth;
    this.resizing = true;
    document.addEventListener("mousemove", this.onResizeMove);
    document.addEventListener("mouseup", this.onResizeEnd);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  onResizeMove = (e: MouseEvent) => {
    if (!this.resizing) return;
    const container = this.querySelector<HTMLElement>(".main-row");
    if (!container) return;
    const dx = e.clientX - this.resizeStartX;
    const cw = container.getBoundingClientRect().width;
    const newW = Math.min(65, Math.max(20, this.resizeStartW + (dx / cw) * 100));
    this.tabPanelWidth = Math.round(newW);
    this.requestUpdate();
  };

  onResizeEnd = () => {
    this.resizing = false;
    document.removeEventListener("mousemove", this.onResizeMove);
    document.removeEventListener("mouseup", this.onResizeEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  async runTerminalCommand(cmd: string, input: HTMLTextAreaElement) {
    this.terminalContent += "$ " + cmd + "\n";
    input.value = "";
    this.requestUpdate();
    try {
      const res = await fetch("/api/file/read?path=" + encodeURIComponent("/tmp/term-test"));
      this.terminalContent += "(terminal not connected)\n";
    } catch {
      this.terminalContent += "(command failed)\n";
    }
    this.requestUpdate();
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
      return html`<div class="loading-wrap"><div class="spinner"></div><span>Loading...</span></div>`;
    }

    const sid = this.sessionId.slice(0, 8);
    const showWelcome = !this.hasMessages && this.tabs.length === 0;
    const activeTabData = this.tabs[this.activeTab];
    const hasResize = this.tabs.length > 0;

    return html`
      <div class="chat-wrapper">
        <div class="topbar">
          <a class="back" href="#" @click=${(e: Event) => { e.preventDefault(); window.location.hash = ""; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Sessions
          </a>
          <span class="divider">&#183;</span>
          <span class="sid" title="Session ID">${sid}</span>
          <span class="divider">&#183;</span>
          <span class="sid" style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px">${this.sessionCwd}</span>
          <div style="flex:1"></div>
          <button class="theme-btn" @click=${this.toggleTerminal} title="终端">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          </button>
          <button class="theme-btn" @click=${this.toggleTheme} title="${this.theme === 'dark' ? '切换亮色' : '切换暗色'}">
            ${this.theme === "dark"
              ? html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
              : html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`}
          </button>
        </div>

        <div class="main-row" style="flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden">
          <!-- Sidebar -->
          <div class="sidebar" style="width:260px;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-base);border-right:0.5px solid rgba(255,255,255,0.07);flex-shrink:0">
            <div class="sidebar-header">
              <span style="font-size:12px;font-weight:500;color:var(--text-weak);letter-spacing:0.04em">FILES</span>
              <file-upload></file-upload>
            </div>
            <file-tree rootpath=${this.sessionCwd} style="flex:1;overflow-y:auto;min-height:0;padding:4px 0"></file-tree>
          </div>

          <!-- Tab panel -->
          ${this.tabs.length > 0 ? html`
            <div class="tab-panel" style="width:${this.tabPanelWidth}%;min-width:200px;display:flex;flex-direction:column;border-right:0.5px solid rgba(255,255,255,0.07);background:var(--bg-base);flex-shrink:0">
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
                  <pre class="preview-code">${activeTabData.content ? unsafeHTML(highlightCode(activeTabData.content, activeTabData.name)) : html`<span class="preview-loading">Loading...</span>`}</pre>
                ` : ""}
              </div>
            </div>
            <div class="resize-handle ${this.resizing ? 'active' : ''}"
              @mousedown=${this.onResizeStart}></div>
          ` : ""}

          <!-- Chat -->
          <div style="flex:1;min-height:0;display:flex;flex-direction:column;position:relative">
            ${showWelcome ? html`
              <div class="welcome">
                <div class="welcome-inner">
                  <div class="logo">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <div class="title">What can I help with?</div>
                  <div class="subtitle">Type a message below to start a conversation</div>
                </div>
              </div>
            ` : ""}
            ${this.chatPanel}
          </div>
        </div>

        ${this.showTerminal ? html`
          <div class="terminal-panel">
            <div class="terminal-header">
              <span class="terminal-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                Terminal
              </span>
              <button class="close-btn" @click=${this.toggleTerminal}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="terminal-body">
              <textarea class="terminal-input" placeholder="$ type a command..."
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const cmd = (e.target as HTMLTextAreaElement).value.trim(); if (cmd) this.runTerminalCommand(cmd, e.target as HTMLTextAreaElement); }
                }}></textarea>
              <pre class="terminal-output">${this.terminalContent}</pre>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }
}
