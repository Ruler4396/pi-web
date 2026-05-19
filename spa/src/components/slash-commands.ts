import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface SlashCommand {
  name: string;
  description: string;
  icon: string;
  action: string;
}

@customElement("slash-commands")
export class SlashCommands extends LitElement {
  @property({ type: Boolean }) visible = false;
  @property({ type: String }) filter = "";
  @property({ type: Object }) position: { x: number; y: number } = { x: 0, y: 0 };

  @state() private selectedIndex = 0;

  commands: SlashCommand[] = [
    { name: "/file", description: "Read a file", icon: "\u{1F4C4}", action: "file" },
    { name: "/write", description: "Write to a file", icon: "\u{270F}\u{FE0F}", action: "write" },
    { name: "/bash", description: "Run a shell command", icon: "\u{1F4BB}", action: "bash" },
    { name: "/search", description: "Search codebase", icon: "\u{1F50D}", action: "search" },
    { name: "/clear", description: "Clear conversation", icon: "\u{1F5D1}\u{FE0F}", action: "clear" },
    { name: "/model", description: "Switch AI model", icon: "\u{1F916}", action: "model" },
    { name: "/export", description: "Export as Markdown", icon: "\u{1F4E5}", action: "export" },
    { name: "/help", description: "Show all shortcuts", icon: "\u{2753}", action: "help" },
  ];

  static styles = css`
    .popup {
      position: fixed;
      z-index: 10001;
      background: #fff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      max-height: 300px;
      overflow-y: auto;
      min-width: 260px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      font-size: 0.8125rem;
    }
    .item:hover {
      background: #f1f5f9;
    }
    .item.selected {
      background: #dbeafe;
      color: #1d4ed8;
    }
    .icon {
      width: 16px;
      text-align: center;
      flex-shrink: 0;
    }
    .name {
      font-weight: 500;
      white-space: nowrap;
    }
    .description {
      color: #94a3b8;
      font-size: 0.75rem;
      margin-left: auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;

  createRenderRoot() {
    return this;
  }

  private get filteredCommands(): SlashCommand[] {
    if (!this.filter) return this.commands;
    const f = this.filter.toLowerCase();
    return this.commands.filter(
      (c) =>
        c.name.toLowerCase().includes(f) ||
        c.description.toLowerCase().includes(f)
    );
  }

  selectCommand(cmd: SlashCommand) {
    this.dispatchEvent(
      new CustomEvent("slash-select", {
        detail: cmd,
        bubbles: true,
        composed: true,
      })
    );
    this.visible = false;
  }

  navigateUp() {
    const max = this.filteredCommands.length;
    if (max === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + max) % max;
  }

  navigateDown() {
    const max = this.filteredCommands.length;
    if (max === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % max;
  }

  getSelected(): SlashCommand | undefined {
    const cmds = this.filteredCommands;
    if (cmds.length === 0) return undefined;
    if (this.selectedIndex < 0 || this.selectedIndex >= cmds.length) {
      return cmds[0];
    }
    return cmds[this.selectedIndex];
  }

  protected override updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("filter")) {
      this.selectedIndex = 0;
    }
  }

  render() {
    if (!this.visible) return html``;

    const cmds = this.filteredCommands;
    if (cmds.length === 0) return html``;

    return html`
      <div
        class="popup"
        style="left:${this.position.x}px;top:${this.position.y}px;"
      >
        ${cmds.map(
          (cmd, i) => html`
            <div
              class="item ${i === this.selectedIndex ? "selected" : ""}"
              @click=${() => this.selectCommand(cmd)}
            >
              <span class="icon">${cmd.icon}</span>
              <span class="name">${cmd.name}</span>
              <span class="description">${cmd.description}</span>
            </div>
          `
        )}
      </div>
    `;
  }
}
