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
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .chat-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }
    .topbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid #e5e7eb;
      background: #fff;
      flex-shrink: 0;
      min-height: 40px;
    }
    .topbar a {
      text-decoration: none;
      color: #3b82f6;
      font-size: 0.8125rem;
      font-weight: 500;
    }
    .topbar a:hover { text-decoration: underline; }
    .topbar .sid {
      color: #9ca3af;
      font-size: 0.75rem;
      font-family: ui-monospace, monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chat-area {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .loading-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 1rem;
      color: #6b7280;
      font-size: 0.875rem;
    }
    .error-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 0.75rem;
      color: #dc2626;
      font-size: 0.875rem;
      text-align: center;
      padding: 2rem;
    }
    .error-wrap button {
      padding: 0.5rem 1rem;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8125rem;
    }
  `;

  createRenderRoot() {
    return this;
  }

  async connectedCallback() {
    super.connectedCallback();
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
    this.chatPanel.style.flex = "1";
    this.chatPanel.style.minHeight = "0";
    this.chatPanel.style.display = "flex";
    this.chatPanel.style.flexDirection = "column";

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
          <div>⚠️ ${this.error}</div>
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
          <span>Loading chat...</span>
        </div>
      `;
    }

    return html`
      <div class="chat-shell">
        <div class="topbar">
          <a href="#" @click=${(e: Event) => { e.preventDefault(); window.location.hash = ""; }}>
            ← Sessions
          </a>
          <span class="sid">${this.sessionId.slice(0, 8)}...</span>
        </div>
        <div class="chat-area">${this.chatPanel}</div>
      </div>
    `;
  }
}
