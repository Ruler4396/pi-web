import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  size?: number;
}

const folderSvg = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
const folderOpenSvg = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5L10 7h10a2 2 0 0 1 2 2v1"/></svg>`;
const fileSvg = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

const extColors: Record<string, string> = {
  ts: "#3178c6", tsx: "#3178c6", js: "#f0db4f", jsx: "#f0db4f",
  py: "#3572a5", rs: "#dea584", go: "#00add8", rb: "#cc342d",
  css: "#563d7c", html: "#e34c26", md: "#083fa1", json: "#292929",
  yaml: "#cb171e", yml: "#cb171e", toml: "#9c4221", svg: "#ffb13b",
  sh: "#4eaa25", bash: "#4eaa25", sql: "#dad8d8", dockerfile: "#0db7ed",
};

@customElement("file-tree")
export class FileTree extends LitElement {
  @property() rootPath = "/root";
  @state() nodes: FileNode[] = [];
  @state() private expanded = new Set<string>();
  @state() private selected: string | null = null;
  @state() private loading = false;

  static styles = css`
    :host { display: block; overflow-y: auto; font-size: 13px; user-select: none; }
    .tree-node { display: flex; align-items: center; padding: 2px 8px; cursor: pointer; border-radius: 4px; gap: 6px; white-space: nowrap; color: var(--text-base, #6f6f6f); }
    .tree-node:hover { background: rgba(0,0,0,0.04); }
    .tree-node.selected { background: rgba(37,99,235,0.08); color: #2563eb; }
    .icon { display: flex; align-items: center; flex-shrink: 0; width: 16px; height: 16px; color: var(--text-weak, #8f8f8f); }
    .tree-node.selected .icon { color: #2563eb; }
    .name { overflow: hidden; text-overflow: ellipsis; }
    .ext-badge { font-size: 9px; font-weight: 600; padding: 0 3px; border-radius: 2px; flex-shrink: 0; line-height: 14px; opacity: 0.7; }
    .size { margin-left: auto; color: var(--text-weaker, #b0b0b0); font-size: 11px; flex-shrink: 0; }
    .children { padding-left: 16px; }
    .loading-text { padding: 8px; color: var(--text-weaker, #b0b0b0); font-size: 12px; }
    .empty-text { padding: 8px; color: var(--text-weaker, #b0b0b0); font-size: 12px; }
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
        const absPath = this.rootPath.replace(/\/+$/, "") + "/" + dir.path;
        const res = await fetch("/api/file/list?path=" + encodeURIComponent(absPath));
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

  private extBadge(name: string) {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (!ext || ext === name) return html``;
    const color = extColors[ext] || "#6f6f6f";
    return html`<span class="ext-badge" style="background:${color}15;color:${color}">${ext}</span>`;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  renderNode(node: FileNode) {
    const isExpanded = this.expanded.has(node.path);
    const isSelected = this.selected === node.path;
    const isDir = node.type === "directory";
    return html`
      <div class="tree-node ${isSelected ? "selected" : ""}"
           @click=${(e: Event) => this.select(node, e)}
           @contextmenu=${(e: MouseEvent) => this.contextMenu(node, e)}>
        <span class="icon">${isDir ? (isExpanded ? folderOpenSvg : folderSvg) : fileSvg}</span>
        <span class="name">${node.name}</span>
        ${isDir ? "" : this.extBadge(node.name)}
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
