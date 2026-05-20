import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  size?: number;
}

@customElement("file-tree")
export class FileTree extends LitElement {
  @property() rootPath = "/root";
  @state() nodes: FileNode[] = [];
  @state() private expanded = new Set<string>();
  @state() private selected: string | null = null;
  @state() private loading = false;

  static styles = css`
    :host { display: block; overflow-y: auto; font-size: 0.8125rem; user-select: none; }
    .tree-node { display: flex; align-items: center; padding: 0.125rem 0.5rem; cursor: pointer; border-radius: 4px; gap: 0.25rem; white-space: nowrap; }
    .tree-node:hover { background: #f1f5f9; }
    .tree-node.selected { background: #dbeafe; color: #1d4ed8; }
    .tree-node .icon { width: 16px; text-align: center; flex-shrink: 0; font-size: 0.75rem; }
    .tree-node .name { overflow: hidden; text-overflow: ellipsis; }
    .tree-node .size { margin-left: auto; color: #94a3b8; font-size: 0.6875rem; flex-shrink: 0; }
    .children { padding-left: 1rem; }
    .loading-text { padding: 0.5rem; color: #94a3b8; font-size: 0.75rem; }
    .empty-text { padding: 0.5rem; color: #94a3b8; font-size: 0.75rem; }
  `;

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    await this.loadDir(this.rootPath);
  }

  async loadDir(path: string) {
    this.loading = true;
    try {
      const res = await fetch(`/api/file/list?path=${encodeURIComponent(path)}`);
      if (res.ok) this.nodes = await res.json();
    } catch {}
    this.loading = false;
    this.requestUpdate();
  }

  async toggle(dir: FileNode, e: Event) {
    e.stopPropagation();
    if (this.expanded.has(dir.path)) {
      this.expanded.delete(dir.path);
      this.requestUpdate();
      return;
    }
    this.expanded.add(dir.path);
    if (dir.children === undefined || dir.children.length === 0) {
      try {
        const res = await fetch("/api/file/list?path=" + encodeURIComponent(this.rootPath.replace(/\/+$/, "") + "/" + dir.path));
        if (res.ok) {
          const loaded = await res.json();
          const found = this.findNode(this.nodes, dir.path);
          if (found) found.children = loaded;
        }
      } catch {}
    }
    this.requestUpdate();
  }

  private findNode(nodes: FileNode[], path: string): FileNode | null {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.children) {
        const found = this.findNode(n.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  select(node: FileNode, e: Event) {
    e.stopPropagation();
    this.selected = node.path;
    this.dispatchEvent(new CustomEvent("file-select", { detail: node, bubbles: true, composed: true }));
    if (node.type === "directory") this.toggle(node, e);
  }

  contextMenu(node: FileNode, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.selected = node.path;
    this.dispatchEvent(new CustomEvent("file-contextmenu", {
      detail: { node, x: e.clientX, y: e.clientY },
      bubbles: true, composed: true
    }));
  }

  private icon(node: FileNode) {
    if (node.type === "directory") {
      return this.expanded.has(node.path) ? "📂" : "📁";
    }
    const ext = node.name.split(".").pop()?.toLowerCase();
    const icons: Record<string, string> = {
      ts: "🟦", tsx: "⚛️", js: "🟨", jsx: "⚛️", py: "🐍", rs: "🦀",
      go: "🔵", java: "☕", rb: "💎", php: "🐘", css: "🎨", html: "🌐",
      md: "📝", json: "📋", yaml: "⚙️", yml: "⚙️", toml: "⚙️", lock: "🔒",
      gitignore: "🙈", env: "🔑", svg: "🖼️", png: "🖼️", jpg: "🖼️",
      pdf: "📕", zip: "📦", tar: "📦", gz: "📦", sh: "💻", bash: "💻",
    };
    return icons[ext || ""] || "📄";
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  renderNode(node: FileNode) {
    const isExpanded = this.expanded.has(node.path);
    const isSelected = this.selected === node.path;
    return html`
      <div class="tree-node ${isSelected ? 'selected' : ''}"
           @click=${(e: Event) => this.select(node, e)}
           @contextmenu=${(e: MouseEvent) => this.contextMenu(node, e)}>
        <span class="icon">${this.icon(node)}</span>
        <span class="name">${node.name}</span>
        ${node.size ? html`<span class="size">${this.formatSize(node.size)}</span>` : ""}
      </div>
      ${node.children && isExpanded ? html`
        <div class="children">${node.children.map(c => this.renderNode(c))}</div>
      ` : ""}
    `;
  }

  render() {
    if (this.loading) return html`<div class="loading-text">Loading...</div>`;
    if (this.nodes.length === 0) return html`<div class="empty-text">Empty directory</div>`;
    return html`${this.nodes.map(n => this.renderNode(n))}`;
  }
}
