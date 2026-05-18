import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("session-chat")
export class SessionChat extends LitElement {
  @property() sessionId = "";
  @state() messages: any[] = [];
  @state() input = "";
  @state() streaming = false;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-width: 900px;
      margin: 0 auto;
      font-family: system-ui, sans-serif;
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }
    .msg {
      padding: 0.5rem 0;
    }
    .msg.user { color: #3b82f6; }
    .msg.assistant { color: #111; }
    .input-area {
      display: flex;
      padding: 1rem;
      border-top: 1px solid #e5e7eb;
    }
    input {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
    }
    button {
      margin-left: 0.5rem;
      padding: 0.5rem 1rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    button:disabled { opacity: 0.5; }
    a { color: #3b82f6; }
  `;

  async send() {
    if (!this.input.trim() || this.streaming) return;
    const text = this.input;
    this.input = "";
    this.streaming = true;

    this.messages = [...this.messages, { role: "user", content: text }];

    try {
      const res = await fetch(`/api/session/${this.sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          try {
            const event = JSON.parse(json);
            this.handleSSE(event, currentContent);
            if (event.type === "message_update") {
              const delta = event.delta?.text || event.delta?.TextDelta;
              if (delta) currentContent += delta;
            }
          } catch {}
        }
      }

      this.messages = [...this.messages, { role: "assistant", content: currentContent }];
    } catch (e) {
      this.messages = [...this.messages, { role: "error", content: "Connection lost" }];
    }
    this.streaming = false;
  }

  handleSSE(_event: any, _content: string) {
    // Placeholder for future streaming UI updates
    this.requestUpdate();
  }

  handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  render() {
    return html`
      <a href="#">← Sessions</a>
      <p style="color:#6b7280;margin-top:0">Session: ${this.sessionId}</p>
      <div class="messages">
        ${this.messages.map(
          (m) => html`
            <div class="msg ${m.role === "user" ? "user" : "assistant"}">
              <strong>${m.role}</strong>: ${m.content}
            </div>
          `
        )}
      </div>
      <div class="input-area">
        <input
          type="text"
          .value=${this.input}
          @input=${(e: InputEvent) => this.input = (e.target as HTMLInputElement).value}
          @keydown=${this.handleKeydown}
          placeholder="Type a message..."
        />
        <button @click=${this.send} ?disabled=${this.streaming}>Send</button>
      </div>
    `;
  }
}
