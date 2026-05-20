import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

const openSvg = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const downloadSvg = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const copySvg = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const deleteSvg = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

@customElement("file-context-menu")
export class FileContextMenu extends LitElement {
  @property() node: FileNode | null = null;
  @property() x = 0;
  @property() y = 0;
  @property() visible = false;

  static styles = css`
    :host { position: fixed; z-index: 10000; }
    .menu { background: var(--surface-raised, #fff); border-radius: 8px; box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.12); min-width: 172px; padding: 4px 0; }
    .menu-item { display: flex; align-items: center; gap: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; color: var(--text-base, #6f6f6f); transition: background 0.1s; }
    .menu-item:hover { background: rgba(0,0,0,0.04); }
    .menu-item.danger:hover { background: rgba(220,38,38,0.06); color: #dc2626; }
    .menu-item .icon { display: flex; align-items: center; width: 14px; height: 14px; flex-shrink: 0; }
    .separator { border-top: 0.5px solid rgba(0,0,0,0.06); margin: 4px 0; }
  `;

  createRenderRoot() { return this; }

  show(node: FileNode, x: number, y: number) {
    this.node = node;
    this.x = x;
    this.y = y;
    this.visible = true;
    this.requestUpdate();
    setTimeout(() => this.hide(), 0);
  }

  hide() {
    this.visible = false;
    this.requestUpdate();
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", () => this.hide(), true);
  }

  async downloadFile() {
    if (!this.node || this.node.type === "directory") return;
    const a = document.createElement("a");
    a.href = `/api/file/download?path=${encodeURIComponent(this.node.path)}`;
    a.download = this.node.name;
    a.click();
    this.hide();
  }

  async deleteFile() {
    if (!this.node) return;
    if (!confirm(`Delete ${this.node.name}?`)) return;
    try {
      await fetch("/api/file/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: this.node.path }),
      });
      this.dispatchEvent(new CustomEvent("file-changed", { bubbles: true, composed: true }));
    } catch {}
    this.hide();
  }

  copyPath() {
    if (!this.node) return;
    navigator.clipboard.writeText(this.node.path).catch(() => {});
    this.hide();
  }

  openInChat() {
    if (!this.node) return;
    this.dispatchEvent(new CustomEvent("file-open", { detail: this.node, bubbles: true, composed: true }));
    this.hide();
  }

  render() {
    if (!this.visible || !this.node) return html``;
    return html`
      <div class="menu" style="left:${this.x}px;top:${this.y}px">
        ${this.node.type === "file" ? html`
          <div class="menu-item" @click=${() => this.openInChat()}>
            <span class="icon">${openSvg}</span> Open in chat
          </div>
          <div class="menu-item" @click=${() => this.downloadFile()}>
            <span class="icon">${downloadSvg}</span> Download
          </div>
        ` : ""}
        <div class="menu-item" @click=${() => this.copyPath()}>
          <span class="icon">${copySvg}</span> Copy path
        </div>
        <div class="separator"></div>
        <div class="menu-item danger" @click=${() => this.deleteFile()}>
          <span class="icon">${deleteSvg}</span> Delete
        </div>
      </div>
    `;
  }
}
