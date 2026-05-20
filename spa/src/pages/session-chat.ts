import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ChatPanel } from "@earendil-works/pi-web-ui";
import { HttpAgent } from "../http-agent";

const THEME_KEY = "pi-theme";

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
  private chatPanel?: ChatPanel;
  private agent?: HttpAgent;

  static styles = css`
    .loading-wrap {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 12px; color: var(--text-weak); font-size: 14px;
      background: var(--bg-base);
    }
    .loading-wrap .hint { font-size: 13px; color: var(--text-weaker); }
    .error-wrap {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 10px; background: var(--bg-base);
      text-align: center; padding: 32px;
    }
    .error-wrap .err-msg { color: #b91c1c; font-size: 14px; font-weight: 500; }
    .error-wrap button { margin-top: 8px; padding: 6px 18px; background: var(--accent); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .error-wrap button:hover { background: #1d4ed8; }
    .theme-btn svg, .back svg { display: block; flex-shrink: 0; }
  `;

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    this.style.display = "flex";
    this.style.flexDirection = "column";
    this.style.flex = "1";
    this.style.minHeight = "0";

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
      if (node && node.type === "file") {
        this.openPreview(node.path);
      }
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
      onBeforeSend: () => {},
      onApiKeyRequired: async () => true,
    });

    // Load session cwd for file tree
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const sessions = await res.json();
        const s = sessions.find((s: any) => s.id === this.sessionId);
        if (s && s.cwd) this.sessionCwd = s.cwd;
      }
    } catch {}
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
        this.previewContent = data.content || "(empty)";
      } else {
        this.previewContent = "(failed to load)";
      }
    } catch {
      this.previewContent = "(error loading file)";
    }
    this.previewLoading = false;
    this.requestUpdate();
  }

  closePreview() {
    this.previewPath = "";
    this.previewContent = "";
    this.requestUpdate();
  }

  render() {
    if (this.error) {
      return html`
        <div class="error-wrap">
          <div class="err-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div class="err-msg">${this.error}</div>
          <button @click=${() => { this.error = ""; this.connectedCallback(); }}>Retry</button>
        </div>
      `;
    }

    if (!this.ready || !this.chatPanel) {
      return html`
        <div class="loading-wrap">
          <div class="spinner"></div>
          <span>Loading chat interface...</span>
          <span class="hint">Session ${this.sessionId.slice(0, 8)}</span>
        </div>
      `;
    }

    const sid = this.sessionId.slice(0, 8);

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
        <div style="flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden;position:relative">
          <div class="sidebar" style="width:260px;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-base,#f8f8f8);border-right:0.5px solid rgba(0,0,0,0.07);flex-shrink:0">
            <div class="sidebar-header">
              <span style="font-size:12px;font-weight:500;color:var(--text-weak,#8f8f8f);letter-spacing:0.04em">FILES</span>
              <file-upload></file-upload>
            </div>
            <file-tree rootpath=${this.sessionCwd} style="flex:1;overflow-y:auto;min-height:0;padding:4px 0"></file-tree>
          </div>
          <div style="flex:1;min-height:0;display:flex;flex-direction:column;position:relative">
            ${this.previewPath ? html`
              <div class="preview-panel" style="max-height:35%">
                <div class="preview-header">
                  <span>${this.previewPath}</span>
                  <button class="close-btn" @click=${this.closePreview}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div class="preview-body">
                  ${this.previewLoading
                    ? html`<div class="preview-loading">Loading...</div>`
                    : html`<pre>${this.previewContent}</pre>`}
                </div>
              </div>
            ` : ""}
            <div style="flex:1;min-height:0;display:flex;flex-direction:column;position:relative">
              <div class="welcome">
                <div class="welcome-inner">
                  <div class="logo">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <div class="title">What can I help with?</div>
                  <div class="subtitle">Type a message below to start a conversation</div>
                </div>
              </div>
              ${this.chatPanel}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
