import { html } from "lit";
import { registerToolRenderer, renderHeader } from "@earendil-works/pi-web-ui";
import type { ToolRenderer, ToolRenderResult } from "@earendil-works/pi-web-ui";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import "./components/diff-preview";

interface FileWriteParams {
  path?: string;
  filePath?: string;
  filename?: string;
}

let cwd = "/root";

export function setupToolRenderers(sessionCwd: string) {
  cwd = sessionCwd;

  registerToolRenderer("write_file", writeFileRenderer);
  registerToolRenderer("write", writeFileRenderer);
  registerToolRenderer("edit_file", editFileRenderer);
  registerToolRenderer("edit", editFileRenderer);
}

function extractPath(params: FileWriteParams | undefined): string {
  return params?.path || params?.filePath || params?.filename || "";
}

const writeFileRenderer: ToolRenderer<FileWriteParams> = {
  render(params: FileWriteParams | undefined, result: ToolResultMessage | undefined, isStreaming?: boolean): ToolRenderResult {
    const filePath = extractPath(params);
    if (isStreaming) {
      return {
        content: html`${renderHeader("inprogress", "", `Writing ${filePath || "file"}...`)}`,
        isCustom: false,
      };
    }

    if (result?.isError) {
      const errText = result.content ? result.content.map((c: any) => c.text || "").join("") : "Unknown error";
      return {
        content: html`${renderHeader("error", "", `Failed to write ${filePath}`)}<pre style="color:#ef4444;font-size:12px">${errText}</pre>`,
        isCustom: false,
      };
    }

    return {
      content: html`
        ${renderHeader("complete", "", filePath ? `Wrote ${filePath}` : "Wrote file")}
        ${filePath ? html`<diff-preview .filePath=${filePath} .sessionCwd=${cwd}></diff-preview>` : ""}
      `,
      isCustom: false,
    };
  },
};

interface EditParams extends FileWriteParams {
  oldString?: string;
  newString?: string;
}

const editFileRenderer: ToolRenderer<EditParams> = {
  render(params: EditParams | undefined, result: ToolResultMessage | undefined, isStreaming?: boolean): ToolRenderResult {
    const filePath = extractPath(params);
    if (isStreaming) {
      return {
        content: html`${renderHeader("inprogress", "", `Editing ${filePath || "file"}...`)}`,
        isCustom: false,
      };
    }

    if (result?.isError) {
      const errText = result.content ? result.content.map((c: any) => c.text || "").join("") : "Unknown error";
      return {
        content: html`${renderHeader("error", "", `Failed to edit ${filePath}`)}<pre style="color:#ef4444;font-size:12px">${errText}</pre>`,
        isCustom: false,
      };
    }

    return {
      content: html`
        ${renderHeader("complete", "", filePath ? `Edited ${filePath}` : "Edited file")}
        ${filePath ? html`<diff-preview .filePath=${filePath} .sessionCwd=${cwd}></diff-preview>` : ""}
      `,
      isCustom: false,
    };
  },
};
