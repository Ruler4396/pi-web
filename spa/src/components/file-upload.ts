import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

const uploadSvg = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;

@customElement("file-upload")
export class FileUpload extends LitElement {
  @state() private dragging = false;
  @state() private uploading = false;
  @state() private dragCounter = 0;

  static styles = css`
    :host { display: block; }
    .upload-btn { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--bg-base, #f8f8f8); border: 0.5px solid rgba(0,0,0,0.1); border-radius: 4px; cursor: pointer; font-size: 12px; color: var(--text-weak, #8f8f8f); transition: all 0.12s; }
    .upload-btn:hover { border-color: rgba(37,99,235,0.4); color: #2563eb; background: rgba(37,99,235,0.04); }
    .upload-btn.uploading { opacity: 0.4; pointer-events: none; }
    .drag-overlay { display: none; }
    .drag-overlay.active { display: flex; position: fixed; inset: 0; background: rgba(37,99,235,0.06); border: 2px dashed rgba(37,99,235,0.5); z-index: 9998; align-items: center; justify-content: center; font-size: 16px; color: #2563eb; font-weight: 500; }
  `;

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    document.addEventListener("dragover", (e) => { e.preventDefault(); this.dragCounter++; this.dragging = true; this.requestUpdate(); });
    document.addEventListener("dragleave", () => { this.dragCounter--; if (this.dragCounter <= 0) { this.dragging = false; this.dragCounter = 0; } this.requestUpdate(); });
    document.addEventListener("drop", (e) => { e.preventDefault(); this.dragging = false; this.dragCounter = 0; this.handleDrop(e); this.requestUpdate(); });
  }

  openPicker() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.multiple = true;
    inp.onchange = () => {
      if (inp.files) this.uploadFiles(inp.files);
    };
    inp.click();
  }

  async handleDrop(e: DragEvent) {
    if (e.dataTransfer?.files) {
      await this.uploadFiles(e.dataTransfer.files);
    }
  }

  async uploadFiles(files: FileList) {
    this.uploading = true;
    this.requestUpdate();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const base64 = await this.readAsBase64(f);
        const filePath = (f as any).webkitRelativePath || f.name;
        await fetch("/api/file/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath, content: base64, encoding: "base64" }),
        });
      } catch {}
    }
    this.uploading = false;
    this.dispatchEvent(new CustomEvent("file-changed", { bubbles: true, composed: true }));
    this.requestUpdate();
  }

  readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  render() {
    return html`
      <div class="drag-overlay ${this.dragging ? 'active' : ''}">
        Drop files to upload
      </div>
      <div class="upload-btn ${this.uploading ? 'uploading' : ''}"
           @click=${() => this.openPicker()} title="Upload files">
        ${uploadSvg} Upload
      </div>
    `;
  }
}
