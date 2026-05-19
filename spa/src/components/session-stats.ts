import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("session-stats")
export class SessionStats extends LitElement {
  @property({ type: Number }) messageCount = 0;
  @property({ type: String }) model = "deepseek-chat";
  @property({ type: String }) thinking = "off";
  @property({ type: Boolean }) isStreaming = false;

  static styles = css`
    :host { display: block; }
    .stats-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.25rem 0.75rem;
      font-size: 0.6875rem;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      background: #fafbfc;
      gap: 0.5rem;
      user-select: none;
    }
    .stat-item { display: flex; align-items: center; gap: 0.25rem; }
    .stat-item.clickable { cursor: pointer; }
    .stat-item.clickable:hover { color: #1d4ed8; }
    .thinking-badge { font-weight: 500; }
  `;

  createRenderRoot() { return this; }

  private thinkingColor(): string {
    const colors: Record<string, string> = {
      off: "#94a3b8", minimal: "#16a34a", low: "#2563eb",
      medium: "#ca8a04", high: "#ea580c", xhigh: "#dc2626",
    };
    return colors[this.thinking] || "#94a3b8";
  }

  render() {
    return html`
      <div class="stats-bar">
        <span class="stat-item">${'\u{1F4AC}'} ${this.messageCount} messages</span>
        <span class="stat-item clickable" @click=${() => this.dispatchEvent(new CustomEvent("stats-model-click", { bubbles: true, composed: true }))}>
          ${'\u{1F916}'} ${this.model}
        </span>
        <span class="stat-item clickable thinking-badge" style="color:${this.thinkingColor()}"
              @click=${() => this.dispatchEvent(new CustomEvent("stats-thinking-click", { bubbles: true, composed: true }))}>
          ${'\u{1F9E0}'} ${this.thinking}
        </span>
      </div>
    `;
  }
}
