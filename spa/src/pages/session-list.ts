import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

interface DirEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

const chatSvg = html`<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const plusSvg = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const folderSvg = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
const folderOpenSvg = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5L10 7h10a2 2 0 0 1 2 2v1"/></svg>`;
const chevronRightSvg = html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
const archiveSvg = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
const trashSvg = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const upSvg = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>`;

@customElement("session-list")
export class SessionList extends LitElement {
  @state() private sessions: any[] = [];
  @state() private loading = true;
  @state() private error = "";
  @state() private showDialog = false;
  @state() private cwd = "/root";
  @state() private dirEntries: DirEntry[] = [];
  @state() private loadingDirs = false;
  @state() private renamingId = "";
  @state() private renameValue = "";

  static styles = css`
    .icon-active { background: #eff6ff; color: #2563eb; }
    .icon-idle { background: var(--bg-weak, #f3f3f3); color: var(--text-weaker, #b0b0b0); }
    .status-active { background: #dcfce7; color: #15803d; }
    .status-idle { background: var(--bg-weak, #f3f3f3); color: var(--text-weak, #8f8f8f); }
    .btn-icon.archive:hover { background: #eff6ff; color: #2563eb; }
    .btn-icon.delete:hover { background: #fef2f2; color: #dc2626; }
    .dir-item .arrow { margin-left: auto; color: var(--text-weaker); flex-shrink: 0; display: flex; align-items: center; }
    .dir-loading { padding: 16px; text-align: center; color: var(--text-weaker); font-size: 13px; }
    .btn-cancel { background: var(--bg-weak); color: var(--text-weak); }
    .btn-cancel:hover { background: rgba(0,0,0,0.08); }
    .rename-input {
      width: 100%; padding: 2px 6px; font-size: 13px; border: none; border-radius: 4px;
      background: var(--bg-weak); color: var(--text-strong);
      font-family: ui-sans-serif, system-ui, sans-serif;
      outline: none; box-shadow: 0 0 0 1px var(--border-color);
    }
    .btn-icon.rename { color: var(--text-weaker); }
    .btn-icon.rename:hover { background: #eff6ff; color: #2563eb; }
  `;

  onSelect?: (id: string) => void;

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    const saved = localStorage.getItem("pi-theme");
    if (!saved || saved === "dark") {
      document.documentElement.dataset.theme = "dark";
    }
    this.loadSessions();
  }

  async loadSessions() {
    this.loading = true; this.error = "";
    try {
      const res = await fetch("/api/session");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.sessions = await res.json();
    } catch (e: any) {
      this.error = e.message || "Failed to load sessions";
      this.sessions = [];
    } finally { this.loading = false; }
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
    this.cwd = "/root";
    this.showDialog = true;
    this.error = "";
    this.loadDirs("/root");
  }

  cancelDialog() {
    this.showDialog = false;
  }

  async confirmCreateSession() {
    this.showDialog = false;
    this.loading = true; this.error = "";
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: this.cwd }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (this.onSelect) this.onSelect(data.id);
    } catch (e: any) {
      this.error = e.message || "Failed to create session";
    } finally { this.loading = false; }
  }

  async loadDirs(path: string) {
    this.loadingDirs = true; this.dirEntries = []; this.requestUpdate();
    try {
      const res = await fetch(`/api/file/list?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const all = await res.json();
        this.dirEntries = all.filter((e: any) => e.type === "directory");
      }
    } catch {}
    this.loadingDirs = false; this.requestUpdate();
  }

  navigateTo(dirName: string) {
    this.cwd = this.cwd.replace(/\/+$/, "") + "/" + dirName;
    this.loadDirs(this.cwd);
  }

  navigateUp() {
    if (this.cwd === "/" || this.cwd === "/root") return;
    const parts = this.cwd.split("/").filter(Boolean);
    parts.pop();
    this.cwd = "/" + parts.join("/") || "/";
    this.loadDirs(this.cwd);
  }

  private handleDialogKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") this.cancelDialog();
  }

  private shortId(id: string) { return id.length > 8 ? id.slice(0, 8) : id; }

  startRename(s: any, e: Event) {
    e.stopPropagation();
    this.renamingId = s.id;
    this.renameValue = s.name || s.cwd || s.id.slice(0, 8);
    this.requestUpdate();
    setTimeout(() => {
      const input = this.querySelector(".rename-input") as HTMLInputElement;
      input?.focus();
      input?.select();
    }, 50);
  }

  async saveRename(sessionId: string) {
    const name = this.renameValue.trim();
    if (!name) { this.renamingId = ""; this.requestUpdate(); return; }
    try {
      const res = await fetch(`/api/session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok || res.status === 204) {
        this.sessions = this.sessions.map(s => s.id === sessionId ? { ...s, name } : s);
      }
    } catch {}
    this.renamingId = "";
    this.requestUpdate();
  }

  cancelRename() {
    this.renamingId = "";
    this.requestUpdate();
  }

  render() {
    return html`
      <div class="container" style="min-height:400px">
        <div class="actions">
          <button class="btn-new" @click=${this.openNewSessionDialog} ?disabled=${this.loading}>
            ${plusSvg} 新建会话
          </button>
        </div>
        ${this.error ? html`<div class="error-msg">${this.error}</div>` : ""}
        ${this.loading
          ? html`<div class="loading-wrap"><div class="spinner"></div></div>`
          : this.sessions.length === 0
            ? html`<div class="empty-state">
                <div class="empty-icon">${chatSvg}</div>
                <h2>No sessions yet</h2>
                <p>Create a session to start coding with AI.</p>
              </div>`
            : html`<div class="session-list">
                ${this.sessions.map(
                  (s: any) => html`
                    <div class="session-card" @click=${() => this.onSelect?.(s.id)}>
                      <div class="session-icon ${s.active ? 'icon-active' : 'icon-idle'}">
                        ${(s.name || s.cwd || s.id || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div class="session-body">
                        ${this.renamingId === s.id
                          ? html`<input class="rename-input" .value=${this.renameValue} @input=${(e: InputEvent) => { this.renameValue = (e.target as HTMLInputElement).value; }} @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this.saveRename(s.id); if (e.key === "Escape") this.cancelRename(); }} @click=${(e: Event) => e.stopPropagation()}>`
                          : html`
                            <div class="session-title">${s.name || s.cwd || this.shortId(s.id)}</div>
                            <div class="session-sub">${s.id?.slice(0, 8) || "..."}</div>
                          `}
                      </div>
                      <span class="session-status ${s.active ? 'status-active' : 'status-idle'}">
                        ${s.active ? "Active" : "Idle"}
                      </span>
                      <button class="btn-icon rename" @click=${(e: Event) => this.startRename(s, e)} title="Rename session">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="btn-icon archive" @click=${(e: Event) => this.archiveSession(s.id, e)} title="Archive session">
                        ${archiveSvg}
                      </button>
                      <button class="btn-icon delete" @click=${(e: Event) => this.deleteSession(s.id, e)} title="Delete session">
                        ${trashSvg}
                      </button>
                    </div>
                  `
                )}
              </div>`}
      </div>

      ${this.showDialog
        ? html`<div class="dialog-overlay" @click=${this.cancelDialog}>
            <div class="dialog" @click=${(e: Event) => e.stopPropagation()} @keydown=${this.handleDialogKeydown}>
              <h3>新建会话</h3>
              <p class="hint">选择此会话的工作目录</p>
              <div class="path-bar">
                <button class="up-btn" @click=${this.navigateUp} title="Parent directory">${upSvg}</button>
                <span class="path-text">${this.cwd}</span>
              </div>
              <div class="dir-list">
                ${this.loadingDirs
                  ? html`<div class="dir-loading" style="min-height:40px;display:flex;align-items:center;justify-content:center">加载中...</div>`
                  : this.dirEntries.length === 0
                    ? html`<div class="dir-loading">No subdirectories</div>`
                    : this.dirEntries.map((d: DirEntry) => html`
                        <div class="dir-item" @click=${() => this.navigateTo(d.name)}>
                          ${folderSvg}
                          <span>${d.name}</span>
                          <span class="arrow">${chevronRightSvg}</span>
                        </div>
                      `)}
              </div>
              <div class="dialog-buttons">
                <button class="btn-cancel" @click=${this.cancelDialog}>Cancel</button>
                <button class="btn-confirm" @click=${this.confirmCreateSession}>Create in ${this.cwd}</button>
              </div>
            </div>
          </div>`
        : ""}
    `;
  }
}
