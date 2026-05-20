import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("session-list")
export class SessionList extends LitElement {
  @state() private sessions: any[] = [];
  @state() private loading = true;
  @state() private error = "";
  @state() private showDialog = false;
  @state() private cwdInput = "/root";

  static styles = css`
    :host {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      background: var(--bg-base, #f8f8f8);
    }

    .container {
      max-width: 640px;
      width: 100%;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .hero {
      text-align: center;
      margin-bottom: 32px;
    }
    .hero .logo {
      margin-bottom: 16px;
      opacity: 0.3;
      color: var(--text-weak, #8f8f8f);
    }
    .hero h1 {
      font-size: 24px;
      font-weight: 500;
      color: var(--text-strong, #171717);
      margin: 0 0 4px;
      letter-spacing: -0.01em;
    }
    .hero p {
      font-size: 14px;
      color: var(--text-weak, #8f8f8f);
      margin: 0;
    }

    .actions {
      display: flex;
      justify-content: center;
      margin-bottom: 24px;
    }
    .btn-new {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 20px;
      background: var(--accent, #2563eb);
      color: #fff;
      border: none;
      border-radius: var(--radius-md, 6px);
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.12s;
    }
    .btn-new:hover {
      background: #1d4ed8;
    }
    .btn-new:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .session-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .session-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: var(--surface-raised, #ffffff);
      border-radius: var(--radius-lg, 8px);
      cursor: pointer;
      transition: box-shadow 0.12s, background 0.12s;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
    }
    .session-card:hover {
      box-shadow: 0 0 0 1px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
    }

    .session-icon {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md, 6px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .icon-active {
      background: #eff6ff;
      color: #2563eb;
    }
    .icon-idle {
      background: var(--bg-weak, #f3f3f3);
      color: var(--text-weaker, #b0b0b0);
    }

    .session-body {
      flex: 1;
      min-width: 0;
    }
    .session-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-strong, #171717);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 2px;
    }
    .session-sub {
      font-size: 12px;
      color: var(--text-weaker, #b0b0b0);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
    }

    .session-status {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: var(--radius-sm, 4px);
      flex-shrink: 0;
    }
    .status-active {
      background: #dcfce7;
      color: #15803d;
    }
    .status-idle {
      background: var(--bg-weak, #f3f3f3);
      color: var(--text-weak, #8f8f8f);
    }

    .btn-icon {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: var(--text-weaker, #b0b0b0);
      border-radius: var(--radius-sm, 4px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.12s;
      opacity: 0;
      padding: 0;
    }
    .session-card:hover .btn-icon { opacity: 1; }
    .btn-icon:hover { background: var(--bg-weak, #f3f3f3); }
    .btn-icon.archive:hover { background: #eff6ff; color: #2563eb; }
    .btn-icon.delete:hover { background: #fef2f2; color: #dc2626; }

    .empty-state {
      text-align: center;
      padding: 48px 20px;
    }
    .empty-state .empty-icon {
      margin-bottom: 12px;
      opacity: 0.25;
      color: var(--text-weak, #8f8f8f);
    }
    .empty-state h2 {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-strong, #171717);
      margin: 0 0 4px;
    }
    .empty-state p {
      font-size: 14px;
      color: var(--text-weak, #8f8f8f);
      margin: 0;
    }

    .error-msg {
      background: #fef2f2;
      color: #b91c1c;
      padding: 10px 14px;
      border-radius: var(--radius-md, 6px);
      font-size: 13px;
      margin-bottom: 16px;
      box-shadow: 0 0 0 1px rgba(220,38,38,0.15);
    }

    .loading-wrap {
      display: flex;
      justify-content: center;
      padding: 40px;
    }

    /* Dialog overlay */
    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .dialog {
      background: var(--surface-raised, #ffffff);
      border-radius: var(--radius-lg, 8px);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 16px 48px rgba(0,0,0,0.12);
      padding: 24px;
      width: 400px;
      max-width: 90vw;
    }
    .dialog h3 {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-strong, #171717);
      margin: 0 0 4px;
    }
    .dialog .hint {
      font-size: 13px;
      color: var(--text-weak, #8f8f8f);
      margin: 0 0 16px;
    }
    .dialog label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-weak, #8f8f8f);
      margin-bottom: 4px;
    }
    .dialog input {
      width: 100%;
      padding: 8px 10px;
      border: none;
      border-radius: var(--radius-md, 6px);
      font-size: 13px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      color: var(--text-strong, #171717);
      background: var(--bg-base, #f8f8f8);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.08);
      outline: none;
      transition: box-shadow 0.12s;
      margin-bottom: 20px;
    }
    .dialog input:focus {
      box-shadow: 0 0 0 2px rgba(37,99,235,0.3);
    }
    .dialog-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .dialog-buttons button {
      padding: 6px 16px;
      border: none;
      border-radius: var(--radius-md, 6px);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.12s;
    }
    .btn-cancel {
      background: var(--bg-weak, #f3f3f3);
      color: var(--text-weak, #8f8f8f);
    }
    .btn-cancel:hover { background: rgba(0,0,0,0.08); }
    .btn-confirm {
      background: var(--accent, #2563eb);
      color: #fff;
    }
    .btn-confirm:hover { background: #1d4ed8; }
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

  async deleteSession(id: string, e: Event) {
    e.stopPropagation();
    try {
      await fetch(`/api/session/${id}`, { method: "DELETE" });
      this.sessions = this.sessions.filter(s => s.id !== id);
    } catch {}
  }

  async archiveSession(id: string, e: Event) {
    e.stopPropagation();
    try {
      await fetch("/api/session/" + id + "/archive", { method: "POST" });
      this.sessions = this.sessions.filter(s => s.id !== id);
    } catch {}
  }

  openNewSessionDialog() {
    this.cwdInput = "/root";
    this.showDialog = true;
    this.error = "";
  }

  cancelDialog() {
    this.showDialog = false;
  }

  async confirmCreateSession() {
    this.showDialog = false;
    this.loading = true;
    this.error = "";
    try {
      const cwd = this.cwdInput.trim() || "/root";
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (this.onSelect) this.onSelect(data.id);
    } catch (e: any) {
      this.error = e.message || "Failed to create session";
    } finally {
      this.loading = false;
    }
  }

  private handleDialogKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") this.cancelDialog();
    if (e.key === "Enter") this.confirmCreateSession();
  }

  private shortId(id: string) {
    return id.length > 8 ? id.slice(0, 8) : id;
  }

  render() {
    return html`
      <div class="container">
        <div class="hero">
          <div class="logo">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h1>Pi Web</h1>
          <p>AI coding assistant</p>
        </div>

        <div class="actions">
          <button class="btn-new" @click=${this.openNewSessionDialog} ?disabled=${this.loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Session
          </button>
        </div>

        ${this.error ? html`<div class="error-msg">${this.error}</div>` : ""}

        ${this.loading
          ? html`<div class="loading-wrap"><div class="spinner"></div></div>`
          : this.sessions.length === 0
            ? html`<div class="empty-state">
                <div class="empty-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <h2>No sessions yet</h2>
                <p>Create a session to start coding with AI.</p>
              </div>`
            : html`<div class="session-list">
                ${this.sessions.map(
                  (s: any) => html`
                    <div class="session-card" @click=${() => this.onSelect?.(s.id)}>
                      <div class="session-icon ${s.active ? 'icon-active' : 'icon-idle'}">
                        ${(s.cwd || s.id || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div class="session-body">
                        <div class="session-title">${s.cwd || this.shortId(s.id)}</div>
                        <div class="session-sub">${s.id?.slice(0, 8) || "..."}</div>
                      </div>
                      <span class="session-status ${s.active ? 'status-active' : 'status-idle'}">
                        ${s.active ? "Active" : "Idle"}
                      </span>
                      <button class="btn-icon archive" @click=${(e: Event) => this.archiveSession(s.id, e)} title="Archive">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      <button class="btn-icon delete" @click=${(e: Event) => this.deleteSession(s.id, e)} title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  `
                )}
              </div>`}
      </div>

      ${this.showDialog
        ? html`<div class="dialog-overlay" @click=${this.cancelDialog}>
            <div class="dialog" @click=${(e: Event) => e.stopPropagation()} @keydown=${this.handleDialogKeydown}>
              <h3>New Session</h3>
              <p class="hint">Choose a working directory for this session.</p>
              <label for="cwd-input">Working Directory</label>
              <input
                id="cwd-input"
                type="text"
                .value=${this.cwdInput}
                @input=${(e: InputEvent) => { this.cwdInput = (e.target as HTMLInputElement).value; }}
                placeholder="/root"
                autofocus
              />
              <div class="dialog-buttons">
                <button class="btn-cancel" @click=${this.cancelDialog}>Cancel</button>
                <button class="btn-confirm" @click=${this.confirmCreateSession}>Create</button>
              </div>
            </div>
          </div>`
        : ""}
    `;
  }
}
