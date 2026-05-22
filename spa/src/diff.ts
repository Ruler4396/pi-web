export function renderDiff(diffText: string, maxLen = 8000): string {
  if (!diffText) return "";
  const truncated = diffText.length > maxLen ? diffText.slice(0, maxLen) + "\n... (truncated)" : diffText;
  const lines = truncated.split("\n");
  let result = "";
  for (const line of lines) {
    let cls = "";
    let text = escapeHtml(line);
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("@@")) {
      cls = "dl-hdr";
    } else if (line.startsWith("+")) {
      cls = "dl-add";
    } else if (line.startsWith("-")) {
      cls = "dl-rem";
    }
    result += `<span class="dl ${cls}">${text || " "}</span>\n`;
  }
  return result;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
