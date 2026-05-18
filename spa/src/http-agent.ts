// HttpAgent: a drop-in replacement for pi-web-ui's Agent class
// that communicates via HTTP REST + SSE instead of direct LLM API calls.
//
// Usage:
//   const agent = new HttpAgent(sessionId);
//   agent.subscribe("message_update", (event) => { ... });
//   await agent.prompt("Write hello world");

export class HttpAgent {
  sessionId: string;
  private listeners: Map<string, Set<Function>> = new Map();
  private abortController: AbortController | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  subscribe(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  unsubscribe(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  async prompt(message: string) {
    this.abortController = new AbortController();

    try {
      const res = await fetch(`/api/session/${this.sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: this.abortController.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const eventData = JSON.parse(jsonStr);
            this.emit(eventData.type || "unknown", eventData);
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      this.emit("error", { error: err.message });
    }
  }

  abort() {
    this.abortController?.abort();
    fetch(`/api/session/${this.sessionId}/abort`, { method: "POST" }).catch(() => {});
  }

  setModel(provider: string, modelId: string) {
    fetch(`/api/session/${this.sessionId}/model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, modelId }),
    }).catch(() => {});
  }
}
