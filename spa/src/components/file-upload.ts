import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("file-upload")
export class FileUpload extends LitElement {
  @state() private dragging = false;
  @state() private uploading = false;
  @state() private dragCounter = 0;

  static styles = css`
    :host { display: block; }
    .upload-btn { display: flex; align-items: center; gap: 0.25rem; padding: 0.375rem 0.5rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; cursor: pointer; font-size: 0.75rem; color: #64748b; transition: all 0.12s; }
    .upload-btn:hover { border-color: #1d4ed8; color: #1d4ed8; background: #eff6ff; }
    .upload-btn.uploading { opacity: 0.5; pointer-events: none; }
    .drag-overlay { display: none; }
    .drag-overlay.active { display: flex; position: fixed; inset: 0; background: rgba(29,78,216,0.08); border: 3px dashed #1d4ed8; z-index: 9998; align-items: center; justify-content: center; font-size: 1.25rem; color: #1d4ed8; font-weight: 600; }
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

  openFolderPicker() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.multiple = true;
    inp.setAttribute("webkitdirectory", "");
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
           @click=${() => this.openPicker()} title="Upload files (click for files, drag for folders)">
        📤 Upload
      </div>
    `;
  }
}
