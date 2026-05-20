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
  private chatPanel?: ChatPanel;
  private agent?: HttpAgent;

  static styles = css`
    .loading-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      color: #64748b;
      font-size: 0.9375rem;
      background: #f8fafc;
    }
    .loading-wrap .hint {
      font-size: 0.8125rem;
      color: #94a3b8;
    }

    .error-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      background: #f8fafc;
      text-align: center;
      padding: 2rem;
    }
    .error-wrap .err-icon {
      font-size: 2rem;
      margin-bottom: 0.25rem;
    }
    .error-wrap .err-msg {
      color: #b91c1c;
      font-size: 0.9375rem;
      font-weight: 500;
    }
    .error-wrap button {
      margin-top: 0.5rem;
      padding: 0.5rem 1.25rem;
      background: #1d4ed8;
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .error-wrap button:hover {
      background: #1e40af;
    }
  `;

  createRenderRoot() {
    return this;
  }

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

  render() {
    if (this.error) {
      return html`
        <div class="error-wrap">
          <div class="err-icon">⚠️</div>
          <div class="err-msg">${this.error}</div>
          <button @click=${() => { this.error = ""; this.connectedCallback(); }}>
            Retry
          </button>
        </div>
      `;
    }

    if (!this.ready || !this.chatPanel) {
      return html`
        <div class="loading-wrap">
          <div class="spinner"></div>
          <span>Loading chat interface...</span>
          <span class="hint">Connecting to session ${this.sessionId.slice(0, 8)}</span>
        </div>
      `;
    }

    const sid = this.sessionId.slice(0, 8);

    return html`
      <div class="chat-wrapper">
        <div class="topbar">
          <a class="back" href="#" @click=${(e: Event) => {
            e.preventDefault();
            window.location.hash = "";
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Sessions
          </a>
          <div style="flex:1"></div>
          <button class="theme-btn" @click=${this.toggleTheme} title="Toggle theme">
            ${this.theme === "dark"
              ? html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
              : html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`}
          </button>
          <span class="divider">&#183;</span>
          <span class="sid" title="Session ID">${sid}&hellip;</span>
        </div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden;position:relative">
          <div class="sidebar" style="width:260px;display:flex;flex-direction:column;overflow:hidden;background:#f8fafc;border-right:1px solid #e2e8f0;flex-shrink:0">
            <div class="sidebar-header" style="padding:0.75rem 1rem;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Files</span>
              <file-upload></file-upload>
            </div>
            <file-tree rootpath="/root" style="flex:1;overflow-y:auto;min-height:0"></file-tree>
          </div>
          <div style="flex:1;min-height:0;display:flex;flex-direction:column;position:relative">
            <div class="welcome">
              <div class="welcome-inner">
                <div class="logo">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div class="title">What can I help with?</div>
                <div class="subtitle">Type a message below to start a conversation</div>
              </div>
            </div>
            ${this.chatPanel}
          </div>
        </div>
      </div>
    `;
  }
}
