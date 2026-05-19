import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ChatPanel, AgentInterface, ArtifactsPanel } from "@earendil-works/pi-web-ui";
import { HttpAgent } from "../http-agent";
import "../components/file-tree";
import "../components/file-context-menu";
import "../components/file-upload";
import { SlashCommands } from "../components/slash-commands";
import { SessionStats } from "../components/session-stats";
window.__components = { SlashCommands, SessionStats };

@customElement("session-chat")
export class SessionChat extends LitElement {
  @property() sessionId = "";
  @state() private ready = false;
  @state() private error = "";
  @state() private cwd = "/root";
  @state() private showWelcome = true;
  @state() private sidebarOpen = true;
  @state() private sidebarWidth = 260;
  @state() private resizing = false;
  private chatPanel?: ChatPanel;
  private agent?: HttpAgent;

  static styles = css`
    .topbar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 1.125rem;
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      flex-shrink: 0;
      min-height: 44px;
    }
    .topbar .back {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      text-decoration: none;
      color: #64748b;
      font-size: 0.8125rem;
      font-weight: 500;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      transition: all 0.12s;
    }
    .topbar .back:hover {
      color: #1d4ed8;
      background: #eff6ff;
    }
    .topbar .divider {
      color: #cbd5e1;
      font-size: 0.75rem;
      user-select: none;
    }
    .topbar .sid {
      color: #94a3b8;
      font-size: 0.75rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .loading-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      color: #64748b;
      font-size: 0.9375rem;
      background: #f8fafc;
    }
    .loading-wrap .hint {
      font-size: 0.8125rem;
      color: #94a3b8;
    }

    .error-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      background: #f8fafc;
      text-align: center;
      padding: 2rem;
    }
    .error-wrap .err-icon {
      font-size: 2rem;
      margin-bottom: 0.25rem;
    }
    .error-wrap .err-msg {
      color: #b91c1c;
      font-size: 0.9375rem;
      font-weight: 500;
    }
    .error-wrap button {
      margin-top: 0.5rem;
      padding: 0.5rem 1.25rem;
      background: #1d4ed8;
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .error-wrap button:hover {
      background: #1e40af;
    }
  `;

  createRenderRoot() {
    return this;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.style.display = "flex";
    this.style.flexDirection = "column";
    this.style.flex = "1";
    this.style.minHeight = "0";

    try {
      await this.initChat();
      await this.loadHistory();
      this.ready = true;
    } catch (e: any) {
      const msg = e.message || String(e);
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        this.error = "Connection lost. Check your network and try again.";
      } else if (msg.includes("pi") || msg.includes("process")) {
        this.error = "Agent process failed. Please create a new session.";
      } else if (msg.includes("500") || msg.includes("502")) {
        this.error = "Server error. The agent may be overloaded. Try again later.";
      } else {
        this.error = msg || "Failed to initialize chat";
      }
    }
    this.requestUpdate();
    this.setupKeyboard();
  }

  setupKeyboard() {
    const handler = (e: KeyboardEvent) => {
      const textarea = this.querySelector("textarea") as HTMLTextAreaElement;
      const slash = this.querySelector("slash-commands") as any;

      if (e.key === "/" && document.activeElement === textarea && !textarea.value) {
        const rect = textarea.getBoundingClientRect();
        if (slash) {
          slash.position = { x: rect.left, y: rect.bottom - 310 };
          slash.filter = "";
          slash.visible = true;
          slash.requestUpdate();
        }
        return;
      }
      if (slash && slash.visible) {
        if (e.key === "Escape") { slash.visible = false; e.preventDefault(); return; }
        if (e.key === "ArrowDown") { slash.navigateDown(); e.preventDefault(); return; }
        if (e.key === "ArrowUp") { slash.navigateUp(); e.preventDefault(); return; }
        if (e.key === "Enter") {
          const sel = slash.getSelected();
          if (sel) { this.onSlashSelect(new CustomEvent("x", { detail: sel })); slash.visible = false; }
          e.preventDefault();
          return;
        }
        if (e.key.length === 1) {
          const val = textarea ? textarea.value : "";
          slash.filter = val.slice(val.lastIndexOf("/"));
          return;
        }
      }

      if (e.ctrlKey && e.key === "b") { this.sidebarOpen = !this.sidebarOpen; e.preventDefault(); }
      if (e.key === "Escape" && !(slash && slash.visible)) { this.agent?.abort(); }
      if (e.ctrlKey && e.key === "Enter") {
        const btns = this.querySelectorAll("button");
        for (let i = 0; i < btns.length; i++) {
          const r = btns[i].getBoundingClientRect();
          if (r.width === 32 && r.height === 32 && r.left > 600) { btns[i].click(); break; }
        }
        e.preventDefault();
      }
      if (e.ctrlKey && e.key === "l") {
        if (textarea) { textarea.value = ""; textarea.focus(); }
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", handler);
  }

  async initChat() {
    this.agent = new HttpAgent(this.sessionId);
    this.chatPanel = new ChatPanel();
    this.chatPanel.style.display = "flex";
    this.chatPanel.style.flexDirection = "column";
    this.chatPanel.style.flex = "1";
    this.chatPanel.style.minHeight = "0";

    await this.chatPanel.setAgent(this.agent as any, {
      onBeforeSend: () => {
        this.showWelcome = false;
      },
      onApiKeyRequired: async () => true,
      onModelSelect: () => {
        this.showModelPicker();
      },
      onCostClick: () => {
        // Could show token usage popup
      },
      sandboxUrlProvider: () => "",
      toolsFactory: (_agent: any, _agentInterface: AgentInterface, _artifactsPanel: ArtifactsPanel) => {
        return this.agent ? this.agent.state.tools : [];
      },
    });
  }

  async loadHistory() {
    try {
      const res = await fetch(`/api/session/${this.sessionId}/message`);
      const data = await res.json();
      const msgs = data.messages || data || [];
      if (Array.isArray(msgs) && msgs.length > 0) {
        this.agent!.state.messages = msgs.map((m: any) => ({
          id: m.id || crypto.randomUUID(),
          sessionID: this.sessionId,
          role: m.role || "user",
          content: Array.isArray(m.content)
            ? m.content
            : [{ type: "text", text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
          stopReason: m.stopReason || "end_turn",
        }));
        this.showWelcome = false;
      } else {
        this.showWelcome = true;
      }
    } catch {
      this.showWelcome = true;
    }
  }

  showModelPicker() {
    const models = (this.agent?.state as any)?.availableModels || [];
    if (models.length === 0) return;
    const current = (this.agent?.state as any)?.model?.id || "";
    const items = models.map((m: any) =>
      `<option value="${m.provider}/${m.id}" ${m.id === current ? "selected" : ""}>${m.label}</option>`
    ).join("");
    const html = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center"
           onclick="this.remove()">
        <div style="background:#fff;border-radius:12px;padding:1.5rem;min-width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.2)"
             onclick="event.stopPropagation()">
          <h3 style="margin:0 0 1rem;font-size:1.125rem;font-weight:600">Select Model</h3>
          <select id="model-picker-select" style="width:100%;padding:0.5rem;border:1px solid #d1d5db;border-radius:8px;font-size:0.9375rem">
            ${items}
          </select>
          <div style="display:flex;gap:0.5rem;margin-top:1rem;justify-content:flex-end">
            <button onclick="this.closest('[style*=fixed]')?.remove()"
                    style="padding:0.5rem 1rem;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer">Cancel</button>
            <button id="model-picker-confirm"
                    style="padding:0.5rem 1rem;border:none;border-radius:8px;background:#1d4ed8;color:#fff;cursor:pointer;font-weight:500">Apply</button>
          </div>
        </div>
      </div>`;
    const overlay = document.createElement("div");
    overlay.innerHTML = html;
    document.body.appendChild(overlay.firstElementChild!);
    const select = document.getElementById("model-picker-select") as HTMLSelectElement;
    document.getElementById("model-picker-confirm")!.onclick = async () => {
      const [provider, modelId] = select.value.split("/");
      await this.agent?.setModel(provider, modelId);
      document.body.querySelector("[style*=fixed]")?.remove();
      this.requestUpdate();
    };
  }

  editCwd() {
    const newCwd = prompt("Working directory:", this.cwd);
    if (newCwd && newCwd !== this.cwd) {
      this.cwd = newCwd;
      fetch(`/api/session/${this.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: newCwd }),
      }).catch(() => {});
      this.requestUpdate();
    }
  }

  private startResize(e: MouseEvent) {
    e.preventDefault();
    this.resizing = true;
    const startX = e.clientX;
    const startW = this.sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      this.sidebarWidth = Math.max(180, Math.min(500, startW + (ev.clientX - startX)));
    };
    const onUp = () => {
      this.resizing = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  private onFileContextMenu(e: CustomEvent) {
    const menu = this.querySelector("file-context-menu") || document.createElement("file-context-menu");
    if (!menu.parentElement) this.appendChild(menu);
    (menu as any).show(e.detail.node, e.detail.x, e.detail.y);
  }

  private onFileSelect(e: CustomEvent) {
    // Could preview file content
  }

  private onFileChanged() {
    const tree = this.querySelector("file-tree") as any;
    if (tree) tree.loadDir(this.cwd);
  }

  private onFileOpen(e: CustomEvent) {
    const node = e.detail;
    const textarea = this.querySelector("textarea") as HTMLTextAreaElement;
    if (textarea) {
      textarea.value = `Read the file: ${node.path}`;
      textarea.focus();
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  private onSlashSelect(e: CustomEvent) {
    const cmd = e.detail;
    const textarea = this.querySelector("textarea") as HTMLTextAreaElement;
    if (!textarea) return;
    if (cmd.action === "clear") textarea.value = "";
    else if (cmd.action === "model") this.showModelPicker();
    else if (cmd.action === "export") this.exportSession();
    else if (cmd.action === "help") this.showHelp();
    else textarea.value = cmd.name + " ";
    textarea.focus();
  }

  private showHelp() {
    alert("Keyboard Shortcuts:\n\nCtrl+B - Toggle sidebar\nEscape - Stop generation\nCtrl+Enter - Send message\nCtrl+L - Clear input\n/ - Slash commands");
  }

  private async exportSession() {
    try {
      const res = await fetch("/api/session/" + this.sessionId + "/export");
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "session-" + this.sessionId.slice(0, 8) + ".md";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {}
  }

  private onThinkingClick() {
    const levels = ["off", "minimal", "low", "medium", "high", "xhigh"];
    const current = (this.agent?.state?.thinkingLevel as string) || "off";
    const next = levels[(levels.indexOf(current) + 1) % levels.length];
    this.agent?.setThinking(next);
    this.requestUpdate();
  }

  renameSession() {
    const newName = prompt("Session name:", this.sessionId.slice(0, 8));
    if (newName && newName !== this.sessionId.slice(0, 8)) {
      fetch(`/api/session/${this.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      }).catch(() => {});
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.chatPanel?.remove();
    this.chatPanel = undefined;
  }

  render() {
    if (this.error) {
      return html`
        <div class="error-wrap">
          <div class="err-icon">⚠️</div>
          <div class="err-msg">${this.error}</div>
          <button @click=${() => { this.error = ""; this.connectedCallback(); }}>
            Retry
          </button>
        </div>
      `;
    }

    if (!this.ready || !this.chatPanel) {
      return html`
        <div class="loading-wrap">
          <div class="spinner"></div>
          <span>Loading chat interface...</span>
          <span class="hint">Connecting to session ${this.sessionId.slice(0, 8)}</span>
        </div>
      `;
    }
    return html`
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;background:#fff">
        <div class="topbar">
          <a class="back" href="#" @click=${(e: Event) => {
            e.preventDefault();
            window.location.hash = "";
          }}>
            ← Sessions
          </a>
          <span class="divider">·</span>
          <button class="toggle-sidebar" @click=${() => { this.sidebarOpen = !this.sidebarOpen; this.requestUpdate(); }}
                  title="Toggle sidebar (Ctrl+B)">
            ${this.sidebarOpen ? "◧" : "◨"}
          </button>
          <span class="divider">·</span>
          <span class="sid" @click=${() => this.renameSession()} title="Click to rename session">${this.sessionId.slice(0, 8)}</span>
          <span class="divider">·</span>
          <span class="cwd" @click=${() => this.editCwd()} title="Click to change working directory">
            ${this.cwd}
          </span>
        </div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden">
          ${this.sidebarOpen ? html`
            <div class="sidebar" style="width:${this.sidebarWidth}px">
              <div class="sidebar-header">
                <span>${this.cwd.split("/").pop() || this.cwd}</span>
                <file-upload @file-changed=${() => this.onFileChanged()}></file-upload>
              </div>
              <file-tree rootPath=${this.cwd}
                         @file-select=${(e: CustomEvent) => this.onFileSelect(e)}
                         @file-contextmenu=${(e: CustomEvent) => this.onFileContextMenu(e)}
                         @file-open=${(e: CustomEvent) => this.onFileOpen(e)}
                         @file-changed=${() => this.onFileChanged()}>
              </file-tree>
            </div>
            <div class="resize-handle ${this.resizing ? 'active' : ''}"
                 @mousedown=${(e: MouseEvent) => this.startResize(e)}></div>
          ` : ""}
          <div style="flex:1;min-height:0;display:flex;flex-direction:column;position:relative;min-width:0">
            ${this.chatPanel}
            ${this.showWelcome && this.agent && this.agent.state.messages.length === 0 ? this.renderWelcome() : ""}
          </div>
        </div>
        <slash-commands
          @slash-select=${(e: CustomEvent) => this.onSlashSelect(e)}>
        </slash-commands>
        <session-stats
          .messageCount=${this.agent?.state?.messages?.length || 0}
          .model=${(this.agent?.state as any)?.model?.label || "deepseek-chat"}
          .thinking=${(this.agent?.state?.thinkingLevel as string) || "off"}
          .isStreaming=${this.agent?.state?.isStreaming || false}
          @stats-model-click=${() => this.showModelPicker()}
          @stats-thinking-click=${() => this.onThinkingClick()}>
        </session-stats>
      </div>
    `;
  }

  renderWelcome() {
    const currentModel = (this.agent?.state as any)?.model?.label || "DeepSeek Chat";
    return html`
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.94);z-index:10;pointer-events:none">
        <div style="text-align:center;max-width:420px;padding:2rem">
          <div style="font-size:2.5rem;margin-bottom:0.75rem">pi</div>
          <h2 style="margin:0 0 0.5rem;font-size:1.25rem;font-weight:600;color:#111">Start a conversation</h2>
          <p style="margin:0 0 1rem;color:#64748b;font-size:0.875rem;line-height:1.5">
            Model &middot; ${currentModel} &ensp; Dir &middot; ${this.cwd}
          </p>
          <div style="background:#f1f5f9;border-radius:8px;padding:0.75rem 1rem;text-align:left">
            <p style="margin:0 0 0.5rem;font-size:0.75rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Try asking</p>
            <p style="margin:0.25rem 0;font-size:0.8125rem;color:#475569;cursor:pointer;pointer-events:auto"
               @click=${() => this.fillPrompt("What files are in this directory?")}>
              "What files are in this directory?"
            </p>
            <p style="margin:0.25rem 0;font-size:0.8125rem;color:#475569;cursor:pointer;pointer-events:auto"
               @click=${() => this.fillPrompt("Create a simple Python web server")}>
              "Create a simple Python web server"
            </p>
            <p style="margin:0.25rem 0;font-size:0.8125rem;color:#475569;cursor:pointer;pointer-events:auto"
               @click=${() => this.fillPrompt("Explain how the project is structured")}>
              "Explain how the project is structured"
            </p>
          </div>
        </div>
      </div>
    `;
  }

  fillPrompt(text: string) {
    const textarea = this.querySelector("textarea");
    if (textarea) {
      (textarea as HTMLTextAreaElement).value = text;
      (textarea as HTMLTextAreaElement).focus();
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    this.showWelcome = false;
    this.requestUpdate();
  }
}
