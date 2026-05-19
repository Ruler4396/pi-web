import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("session-list")
export class SessionList extends LitElement {
  @state() private sessions: any[] = [];
  @state() private loading = true;
  @state() private error = "";

  static styles = css`
    :host {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      max-width: 720px;
      width: 100%;
      margin: 0 auto;
      padding: 2rem 1rem;
      font-family: system-ui, -apple-system, sans-serif;
      overflow-y: auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      flex-shrink: 0;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #111;
      margin: 0;
    }
    .btn-new {
      padding: 0.5rem 1.25rem;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .btn-new:hover { background: #2563eb; }
    .btn-new:disabled { opacity: 0.5; cursor: default; }

    .session-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .session-card {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .session-card:hover {
      border-color: #3b82f6;
      box-shadow: 0 2px 8px rgba(59,130,246,0.1);
    }
    .session-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #eff6ff;
      color: #3b82f6;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.875rem;
      font-weight: 600;
      flex-shrink: 0;
    }
    .session-info {
      flex: 1;
      min-width: 0;
    }
    .session-id {
      font-size: 0.8125rem;
      color: #6b7280;
      font-family: ui-monospace, monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .session-meta {
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 0.125rem;
    }
    .session-badge {
      font-size: 0.6875rem;
      padding: 0.1875rem 0.5rem;
      border-radius: 6px;
      font-weight: 500;
      flex-shrink: 0;
    }
    .badge-active {
      background: #dcfce7;
      color: #16a34a;
    }
    .badge-idle {
      background: #f3f4f6;
      color: #6b7280;
    }
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: #9ca3af;
    }
    .empty-state h2 {
      font-size: 1.125rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }
    .error-msg {
      background: #fef2f2;
      color: #dc2626;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    .loading-wrap {
      display: flex;
      justify-content: center;
      padding: 3rem;
    }
  `;

  onSelect?: (id: string) => void;

  connectedCallback() {
    super.connectedCallback();
    this.loadSessions();
  }

  async loadSessions() {
    this.loading = true;
    this.error = "";
    try {
      const res = await fetch("/api/session");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.sessions = await res.json();
    } catch (e: any) {
      this.error = e.message || "Failed to load sessions";
      this.sessions = [];
    } finally {
      this.loading = false;
    }
  }

  async createSession() {
    this.error = "";
    try {
      const res = await fetch("/api/session", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (this.onSelect) this.onSelect(data.id);
    } catch (e: any) {
      this.error = e.message || "Failed to create session";
    }
  }

  render() {
    return html`
      <div class="header">
        <h1>Sessions</h1>
        <button class="btn-new" @click=${this.createSession} ?disabled=${this.loading}>
          + New Session
        </button>
      </div>

      ${this.error ? html`<div class="error-msg">${this.error}</div>` : ""}

      ${this.loading
        ? html`<div class="loading-wrap"><div class="spinner"></div></div>`
        : this.sessions.length === 0
          ? html`<div class="empty-state">
              <h2>No sessions yet</h2>
              <p>Create a new session to start chatting with the AI.</p>
            </div>`
          : html`<div class="session-list">
              ${this.sessions.map(
                (s: any) => html`
                  <div class="session-card" @click=${() => this.onSelect?.(s.id)}>
                    <div class="session-avatar">${(s.id || "?").slice(0, 2)}</div>
                    <div class="session-info">
                      <div class="session-id">${s.id}</div>
                      <div class="session-meta">${s.file?.split("/").pop() || ""}</div>
                    </div>
                    <span class="session-badge ${s.active ? "badge-active" : "badge-idle"}">
                      ${s.active ? "Active" : "Idle"}
                    </span>
                  </div>
                `
              )}
            </div>`}
    `;
  }
}
