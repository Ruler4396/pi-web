import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderDiff } from "../diff";

@customElement("diff-preview")
export class DiffPreview extends LitElement {
  @property() filePath = "";
  @property() sessionCwd = "";
  @state() diffText = "";
  @state() loading = true;
  @state() empty = false;

  static styles = css`
    :host { display: block; margin-top: 8px; font-size: 12px; }
    .dp-loading { color: var(--text-weaker); font-family: ui-sans-serif,system-ui,sans-serif; font-size: 11px; padding: 4px 0; }
    .dp-empty { color: var(--text-weaker); font-style: italic; font-size: 11px; }
    .dp-actions { display: flex; gap: 6px; margin-top: 6px; }
    .dp-btn {
      padding: 2px 8px; font-size: 11px; border: none; border-radius: 4px;
      cursor: pointer; font-family: ui-sans-serif,system-ui,sans-serif;
    }
    .dp-btn.undo { background: rgba(239,68,68,0.1); color: #ef4444; }
    .dp-btn.undo:hover { background: rgba(239,68,68,0.2); }
    .dp-btn.copy { background: rgba(37,99,235,0.08); color: #2563eb; }
    .dp-btn.copy:hover { background: rgba(37,99,235,0.15); }
    .diff-view { white-space: pre; tab-size: 4; margin: 0; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size: 11px; line-height: 1.45; max-height: 400px; overflow-y: auto; background: var(--bg-weak); border-radius: 4px; padding: 6px 8px; }
    .dl { display: block; white-space: pre; padding: 0 2px; }
    .dl-hdr { color: #6b7280; font-weight: 600; }
    .dl-add { background: rgba(34,197,94,0.12); color: #22c55e; }
    .dl-rem { background: rgba(239,68,68,0.12); color: #ef4444; }
  `;

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    await this.fetchDiff();
  }

  async fetchDiff() {
    this.loading = true;
    try {
      const cwd = encodeURIComponent(this.sessionCwd);
      const fp = encodeURIComponent(this.filePath);
      const res = await fetch(`/api/git/diff?cwd=${cwd}&path=${fp}`);
      if (res.ok) {
        const data = await res.json();
        this.diffText = data.diff || "";
        this.empty = data.empty !== false && !this.diffText;
      }
    } catch {}
    this.loading = false;
    this.requestUpdate();
  }

  async undo() {
    try {
      await fetch("/api/shell/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `git checkout -- ${JSON.stringify(this.filePath)}`,
          cwd: this.sessionCwd,
        }),
      });
      this.diffText = "";
      this.empty = true;
      this.requestUpdate();
      this.dispatchEvent(new CustomEvent("file-reverted", { bubbles: true, composed: true }));
    } catch {}
  }

  copyDiff() {
    navigator.clipboard.writeText(this.diffText).catch(() => {});
    this.dispatchEvent(new CustomEvent("toast", { detail: { text: "Diff copied" }, bubbles: true, composed: true }));
  }

  render() {
    if (this.loading) return html`<span class="dp-loading">Loading diff...</span>`;
    if (this.empty) return html`<span class="dp-empty">No changes to show</span>`;
    return html`
      <pre class="diff-view">${unsafeHTML(renderDiff(this.diffText))}</pre>
      <div class="dp-actions">
        <button class="dp-btn undo" @click=${this.undo}>Undo this change</button>
        <button class="dp-btn copy" @click=${this.copyDiff}>Copy diff</button>
      </div>
    `;
  }
}
