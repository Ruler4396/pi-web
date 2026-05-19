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
      overflow-y: auto;
      background: #f8fafc;
    }

    .container {
      max-width: 720px;
      width: 100%;
      margin: 0 auto;
      padding: 2.5rem 1.5rem;
    }

    .hero {
      text-align: center;
      margin-bottom: 2.5rem;
    }
    .hero h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 0.5rem;
      letter-spacing: -0.02em;
    }
    .hero p {
      font-size: 0.9375rem;
      color: #64748b;
      margin: 0;
    }

    .actions {
      display: flex;
      justify-content: center;
      margin-bottom: 2rem;
    }
    .btn-new {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.625rem 1.5rem;
      background: #1d4ed8;
      color: #fff;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-size: 0.9375rem;
      font-weight: 600;
      transition: all 0.15s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
    }
    .btn-new:hover {
      background: #1e40af;
      transform: translateY(-1px);
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .btn-new:disabled {
      opacity: 0.6;
      cursor: default;
      transform: none;
    }

    .session-list {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .session-card {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      padding: 1rem 1.125rem;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.18s;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .session-card:hover {
      border-color: #93c5fd;
      box-shadow: 0 4px 12px rgba(59,130,246,0.12);
      transform: translateY(-1px);
    }

    .session-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      font-weight: 700;
      flex-shrink: 0;
    }
    .icon-active {
      background: linear-gradient(135deg, #dbeafe, #bfdbfe);
      color: #1d4ed8;
    }
    .icon-idle {
      background: #f1f5f9;
      color: #94a3b8;
    }

    .session-body {
      flex: 1;
      min-width: 0;
    }
    .session-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #1e293b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 0.1875rem;
    }
    .session-sub {
      font-size: 0.75rem;
      color: #94a3b8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .session-status {
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 0.25rem 0.625rem;
      border-radius: 8px;
      flex-shrink: 0;
      letter-spacing: 0.01em;
    }
    .status-active {
      background: #dcfce7;
      color: #15803d;
    }
    .status-idle {
      background: #f1f5f9;
      color: #64748b;
    }

    .empty-state {
      text-align: center;
      padding: 3.5rem 1.5rem;
    }
    .empty-state .empty-icon {
      font-size: 2.5rem;
      margin-bottom: 0.75rem;
    }
    .empty-state h2 {
      font-size: 1.125rem;
      color: #334155;
      margin: 0 0 0.375rem;
    }
    .empty-state p {
      font-size: 0.875rem;
      color: #94a3b8;
      margin: 0;
    }

    .error-msg {
      background: #fef2f2;
      color: #b91c1c;
      padding: 0.875rem 1rem;
      border-radius: 10px;
      font-size: 0.875rem;
      margin-bottom: 1.25rem;
      border: 1px solid #fecaca;
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

  private shortId(id: string) {
    return id.length > 8 ? id.slice(0, 8) : id;
  }

  render() {
    return html`
      <div class="container">
        <div class="hero">
          <h1>Pi Web</h1>
          <p>AI-powered coding assistant</p>
        </div>

        <div class="actions">
          <button class="btn-new" @click=${this.createSession} ?disabled=${this.loading}>
            + New Session
          </button>
        </div>

        ${this.error ? html`<div class="error-msg">${this.error}</div>` : ""}

        ${this.loading
          ? html`<div class="loading-wrap"><div class="spinner"></div></div>`
          : this.sessions.length === 0
            ? html`<div class="empty-state">
                <div class="empty-icon">💬</div>
                <h2>No sessions yet</h2>
                <p>Create your first session to start coding with AI.</p>
              </div>`
            : html`<div class="session-list">
                ${this.sessions.map(
                  (s: any) => html`
                    <div class="session-card" @click=${() => this.onSelect?.(s.id)}>
                      <div class="session-icon ${s.active ? 'icon-active' : 'icon-idle'}">
                        ${(s.id || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div class="session-body">
                        <div class="session-title">${this.shortId(s.id)}</div>
                        <div class="session-sub">${s.file?.split("/").pop() || "session"}</div>
                      </div>
                      <span class="session-status ${s.active ? 'status-active' : 'status-idle'}">
                        ${s.active ? "Active" : "Idle"}
                      </span>
                    </div>
                  `
                )}
              </div>`}
      </div>
    `;
  }
}
