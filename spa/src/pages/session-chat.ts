import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ChatPanel } from "@earendil-works/pi-web-ui";
import { HttpAgent } from "../http-agent";

@customElement("session-chat")
export class SessionChat extends LitElement {
  @property() sessionId = "";
  private chatPanel?: ChatPanel;
  private agent?: HttpAgent;

  createRenderRoot() {
    return this;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.style.display = "flex";
    this.style.flexDirection = "column";
    this.style.height = "100%";
    await this.initChat();
  }

  async initChat() {
    this.agent = new HttpAgent(this.sessionId);
    this.chatPanel = new ChatPanel();
    this.chatPanel.style.flex = "1";
    this.chatPanel.style.minHeight = "0";

    await this.chatPanel.setAgent(this.agent as any, {
      onBeforeSend: () => {
        // Called before sending a message
      },
      onApiKeyRequired: async () => true,
    });

    this.requestUpdate();
  }

  render() {
    if (!this.chatPanel) {
      return html`<div class="flex items-center justify-center h-full">
        <div class="text-muted-foreground">Loading agent...</div>
      </div>`;
    }
    return html`
      <div class="flex flex-col h-full w-full">
        <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 shrink-0">
          <a href="#" class="text-sm text-blue-500 hover:text-blue-700" @click=${() => {
            window.location.hash = "";
          }}>← Sessions</a>
          <span class="text-xs text-gray-400">${this.sessionId.slice(0, 8)}...</span>
        </div>
        ${this.chatPanel}
      </div>
    `;
  }
}