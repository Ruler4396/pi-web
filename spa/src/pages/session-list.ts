import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("session-list")
export class SessionList extends LitElement {
  @state() sessions: any[] = [];
  @state() loading = true;

  static styles = css`
    :host {
      display: block;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      font-family: system-ui, sans-serif;
    }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    .session-card {
      padding: 1rem;
      margin-bottom: 0.5rem;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
    }
    .session-card:hover { background: #f9fafb; }
    button {
      padding: 0.5rem 1rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 1rem;
    }
    button:hover { background: #2563eb; }
  `;

  onSelect?: (id: string) => void;

  connectedCallback() {
    super.connectedCallback();
    this.loadSessions();
  }

  async loadSessions() {
    try {
      const res = await fetch("/api/session");
      this.sessions = await res.json();
    } catch {
      this.sessions = [];
    }
    this.loading = false;
  }

  async createSession() {
    try {
      const res = await fetch("/api/session", { method: "POST" });
      const data = await res.json();
      if (this.onSelect) this.onSelect(data.id);
    } catch {}
  }

  render() {
    if (this.loading) return html`<p>Loading...</p>`;

    return html`
      <h1>Pi Web Sessions</h1>
      <button @click=${this.createSession}>+ New Session</button>
      ${this.sessions.map(
        (s: any) => html`
          <div class="session-card" @click=${() => this.onSelect?.(s.id)}>
            ${s.id} ${s.active ? "(active)" : ""}
          </div>
        `
      )}
    `;
  }
}
