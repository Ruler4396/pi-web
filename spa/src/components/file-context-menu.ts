import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

@customElement("file-context-menu")
export class FileContextMenu extends LitElement {
  @property() node: FileNode | null = null;
  @property() x = 0;
  @property() y = 0;
  @property() visible = false;

  static styles = css`
    :host { position: fixed; z-index: 10000; }
    .menu { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.12); min-width: 160px; padding: 0.25rem 0; }
    .menu-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; cursor: pointer; font-size: 0.8125rem; color: #334155; transition: background 0.1s; }
    .menu-item:hover { background: #f1f5f9; }
    .menu-item.danger:hover { background: #fef2f2; color: #dc2626; }
    .menu-item .icon { width: 16px; text-align: center; }
    .separator { border-top: 1px solid #e2e8f0; margin: 0.25rem 0; }
  `;

  createRenderRoot() { return this; }

  show(node: FileNode, x: number, y: number) {
    this.node = node;
    this.x = x;
    this.y = y;
    this.visible = true;
    this.requestUpdate();
    setTimeout(() => this.hide(), 0); // listen for outside click
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
            <span class="icon">📖</span> Open in chat
          </div>
          <div class="menu-item" @click=${() => this.downloadFile()}>
            <span class="icon">📥</span> Download
          </div>
        ` : ""}
        <div class="menu-item" @click=${() => this.copyPath()}>
          <span class="icon">📋</span> Copy path
        </div>
        <div class="separator"></div>
        <div class="menu-item danger" @click=${() => this.deleteFile()}>
          <span class="icon">🗑️</span> Delete
        </div>
      </div>
    `;
  }
}
