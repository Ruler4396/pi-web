import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { ChatPanel } from "@earendil-works/pi-web-ui";
import { HttpAgent } from "../http-agent";

const THEME_KEY = "pi-theme";

// Simple syntax highlighting by extension
function highlightCode(code: string, filename: string): string {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  let escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Keywords for common languages
  const kw = "fn|let|mut|const|var|function|class|return|if|else|for|while|match|impl|pub|use|mod|struct|enum|trait|async|await|import|export|from|def|self|yield|raise|try|catch|throw|new|static|void|int|string|bool|type|interface|extends|implements|package|private|protected|public|final";

  // Rust-specific keywords
  if (["rs"].includes(ext)) {
    escaped = escaped.replace(/\b(fn|let|mut|pub|use|mod|struct|enum|impl|trait|match|self|async|await|where|for|in|if|else|return|loop|while|break|continue|move|ref|dyn|unsafe|type|as|const|static|crate|super)\b/g,
      '<span class="hl-kw">$1</span>');
    escaped = escaped.replace(/\b([A-Z][a-zA-Z0-9]*)\b/g, '<span class="hl-type">$1</span>');
  }

  // Generic keywords for other languages
  if (!["rs"].includes(ext)) {
    escaped = escaped.replace(new RegExp(`\\b(${kw})\\b`, "g"), '<span class="hl-kw">$1</span>');
  }

  // Strings
  escaped = escaped.replace(/"([^"\\]|\\.)*"/g, '<span class="hl-str">$&</span>');
  escaped = escaped.replace(/'([^'\\]|\\.)*'/g, '<span class="hl-str">$&</span>');
  escaped = escaped.replace(/`([^`\\]|\\.)*`/g, '<span class="hl-str">$&</span>');

  // Comments
  escaped = escaped.replace(/(\/\/.*$)/gm, '<span class="hl-cmt">$1</span>');
  escaped = escaped.replace(/(#.*$)/gm, '<span class="hl-cmt">$1</span>');

  // Numbers
  escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');

  return escaped;
}

@customElement("session-chat")
export class SessionChat extends LitElement {
  @property() sessionId = "";
  @state() private ready = false;
  @state() private error = "";
  @state() private theme: "dark" | "" = "";
  @state() private previewPath = "";
  @state() private previewContent = "";
  @state() private previewLoading = false;
  @state() private sessionCwd = "/root";
  @state() private hasMessages = false;
  private chatPanel?: ChatPanel;
  private agent?: HttpAgent;

  static styles = css`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .loading-wrap, .error-wrap {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 12px; background: var(--bg-base, #f8f8f8);
    }
    .error-wrap .err-msg { color: #b91c1c; font-size: 14px; font-weight: 500; }
    .error-wrap button { margin-top: 8px; padding: 6px 18px; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .error-wrap button:hover { background: #1d4ed8; }
    .loading-wrap .hint { font-size: 13px; color: var(--text-weaker, #b0b0b0); }
  `;

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "") {
      this.theme = saved;
      document.documentElement.dataset.theme = saved;
    }

    try {
      await this.initChat();
      this.ready = true;
    } catch (e: any) {
      this.error = e.message || "Failed to initialize chat";
    }
    this.requestUpdate();

    this.addEventListener("file-select", ((e: CustomEvent) => {
      const node = e.detail;
      if (node && node.type === "file") this.openPreview(node.path);
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

    // Load session cwd
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const sessions = await res.json();
        const s = sessions.find((s: any) => s.id === this.sessionId);
        if (s && s.cwd) this.sessionCwd = s.cwd;
      }
    } catch {}

    // Poll for messages to show/hide welcome
    setInterval(() => {
      if (this.agent && this.agent.state.messages.length > 0 && !this.hasMessages) {
        this.hasMessages = true;
        this.requestUpdate();
      }
    }, 500);

    this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.chatPanel?.remove();
    this.chatPanel = undefined;
  }

  private toggleTheme = () => {
    const next = this.theme === "dark" ? "" : "dark";
    this.theme = next;
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  };

  async openPreview(relPath: string) {
    this.previewPath = relPath;
    this.previewContent = "";
    this.previewLoading = true;
    this.requestUpdate();
    try {
      const absPath = this.sessionCwd.replace(/\/+$/, "") + "/" + relPath;
      const res = await fetch("/api/file/read?path=" + encodeURIComponent(absPath));
      if (res.ok) {
        const data = await res.json();
        this.previewContent = data.content || "";
      }
    } catch {}
    this.previewLoading = false;
    this.requestUpdate();
  }

  closePreview = () => {
    this.previewPath = "";
    this.previewContent = "";
    this.requestUpdate();
  };

  render() {
    if (this.error) {
      return html`<div class="error-wrap">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div class="err-msg">${this.error}</div>
        <button @click=${() => { this.error = ""; this.connectedCallback(); }}>Retry</button>
      </div>`;
    }

    if (!this.ready || !this.chatPanel) {
      return html`<div class="loading-wrap">
        <div class="spinner"></div><span>Loading...</span>
        <span class="hint">Session ${this.sessionId.slice(0, 8)}</span>
      </div>`;
    }

    const sid = this.sessionId.slice(0, 8);
    const showWelcome = !this.hasMessages && !this.previewPath;

    return html`
      <div class="chat-wrapper">
        <div class="topbar">
          <a class="back" href="#" @click=${(e: Event) => { e.preventDefault(); window.location.hash = ""; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Sessions
          </a>
          <div style="flex:1"></div>
          <button class="theme-btn" @click=${this.toggleTheme} title="Toggle theme">
            ${this.theme === "dark"
              ? html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
              : html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`}
          </button>
          <span class="divider">&#183;</span>
          <span class="sid" title="Session ID">${sid}&hellip;</span>
        </div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden">
          <!-- Sidebar -->
          <div class="sidebar" style="width:260px;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-base,#f8f8f8);border-right:0.5px solid rgba(0,0,0,0.07);flex-shrink:0">
            <div class="sidebar-header">
              <span style="font-size:12px;font-weight:500;color:var(--text-weak,#8f8f8f);letter-spacing:0.04em">FILES</span>
              <file-upload></file-upload>
            </div>
            <file-tree rootpath=${this.sessionCwd} style="flex:1;overflow-y:auto;min-height:0;padding:4px 0"></file-tree>
          </div>

          <!-- Right: preview + chat split -->
          <div style="flex:1;min-height:0;display:flex;flex-direction:column;position:relative">
            ${this.previewPath ? html`
              <div class="preview-panel" style="flex:0 0 35%;min-height:120px">
                <div class="preview-header">
                  <span class="preview-path">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    ${this.previewPath}
                  </span>
                  <button class="close-btn" @click=${this.closePreview} title="Close preview">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div class="preview-body">
                  ${this.previewLoading
                    ? html`<div class="preview-loading">Loading...</div>`
                    : html`<pre class="preview-code">${unsafeHTML(highlightCode(this.previewContent, this.previewPath))}</pre>`}
                </div>
              </div>
              <div class="preview-resize-handle" style="height:1px;background:rgba(0,0,0,0.06);flex-shrink:0"></div>
            ` : ""}
            <div style="flex:1;min-height:0;display:flex;flex-direction:column;position:relative">
              ${showWelcome ? html`
                <div class="welcome">
                  <div class="welcome-inner">
                    <div class="logo">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <div class="title">What can I help with?</div>
                    <div class="subtitle">Type a message below to start a conversation</div>
                  </div>
                </div>
              ` : ""}
              ${this.chatPanel}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
