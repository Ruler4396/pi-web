import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ChatPanel } from "@earendil-works/pi-web-ui";
import { HttpAgent } from "../http-agent";

@customElement("session-chat")
export class SessionChat extends LitElement {
  @property() sessionId = "";
  @state() private ready = false;
  @state() private error = "";
  private chatPanel?: ChatPanel;
  private agent?: HttpAgent;

  static styles = css`
    .topbar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 1.125rem;
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      flex-shrink: 0;
      min-height: 44px;
    }
    .topbar .back {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      text-decoration: none;
      color: #64748b;
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      transition: all 0.12s;
    }
    .topbar .back:hover {
      color: #1d4ed8;
      background: #eff6ff;
    }
    .topbar .divider {
      color: #cbd5e1;
      font-size: 0.75rem;
      user-select: none;
    }
    .topbar .sid {
      color: #94a3b8;
      font-size: 0.75rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

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

    return html`
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;background:#fff">
        <div class="topbar">
          <a class="back" href="#" @click=${(e: Event) => {
            e.preventDefault();
            window.location.hash = "";
          }}>
            ← Sessions
          </a>
          <span class="divider">·</span>
          <span class="sid">${this.sessionId.slice(0, 8)}...</span>
        </div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:column">${this.chatPanel}</div>
      </div>
    `;
  }
}
