import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("file-upload")
export class FileUpload extends LitElement {
  @state() private dragging = false;
  @state() private uploading = false;

  static styles = css``;
  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    // Only listen on host element, not document-level
    this.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); this.dragging = true; });
    this.addEventListener("dragleave", () => { this.dragging = false; });
    this.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); this.dragging = false; this.handleDrop(e as DragEvent); });
  }

  openPicker() {
    const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true;
    inp.onchange = () => { if (inp.files) this.uploadFiles(inp.files); };
    inp.click();
  }

  async handleDrop(e: DragEvent) {
    if (e.dataTransfer?.files) await this.uploadFiles(e.dataTransfer.files);
  }

  async uploadFiles(files: FileList) {
    this.uploading = true; this.requestUpdate();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const base64 = await this.readAsBase64(f);
        const filePath = (f as any).webkitRelativePath || f.name;
        await fetch("/api/file/write", {
          method: "POST", headers: { "Content-Type": "application/json" },
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
      ${this.dragging ? html`<div class="drag-overlay"><span>拖放到文件夹以上传</span></div>` : ""}
      <div class="upload-btn ${this.uploading ? 'uploading' : ''}" @click=${() => this.openPicker()} title="上传文件到当前目录">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        上传
      </div>
    `;
  }
}
