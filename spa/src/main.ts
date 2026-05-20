import "./app.css";
import { html, render } from "lit";
import { setAppStorage } from "@earendil-works/pi-web-ui";
import "./pages/session-list";
import "./pages/session-chat";
import "./components/file-tree";
import "./components/file-upload";
import "./components/file-context-menu";
import "./components/slash-commands";
import "./components/session-stats";

// Initialize minimal AppStorage mock for web mode.
// The pi-web-ui ChatPanel calls ti() internally which requires AppStorage.
// We provide a no-op backend since auth/model selection is handled server-side.
setAppStorage({
  settings: {
    get: async () => undefined,
    set: async () => {},
    subscribe: () => () => {},
  },
  providerKeys: {
    get: async () => undefined,
    set: async () => {},
    subscribe: () => () => {},
  },
  sessions: {
    getAllMetadata: async () => [],
    subscribe: () => () => {},
  },
  customProviders: {
    getAll: async () => [],
    subscribe: () => () => {},
  },
  backend: {
    getQuotaInfo: async () => ({ usage: 0, quota: 0 }),
    requestPersistence: async () => false,
  },
} as any);

class AppRoot {
  currentRoute = "";
  private errorDismissed = false;

  constructor() {
    window.addEventListener("hashchange", () => this.route());
    window.addEventListener("error", (e) => this.showGlobalError(e.message));
    window.addEventListener("unhandledrejection", (e) => {
      this.showGlobalError(e.reason?.message || "Unknown error");
    });
    this.route();
  }

  private showGlobalError(msg: string) {
    if (this.errorDismissed) return;
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.innerHTML = `<span>${msg}</span><button>Dismiss</button>`;
    banner.querySelector("button")!.onclick = () => {
      banner.remove();
      this.errorDismissed = true;
    };
    document.body.appendChild(banner);
    setTimeout(() => { banner.remove(); this.errorDismissed = true; }, 5000);
  }

  route() {
    const hash = window.location.hash.slice(1);
    this.currentRoute = hash;
    this.render();
  }

  render() {
    const root = document.getElementById("app")!;

    if (!this.currentRoute) {
      render(
        html`<session-list
          .onSelect=${(id: string) => {
            window.location.hash = `#/session/${id}`;
          }}
        ></session-list>`,
        root
      );
      return;
    }

    const match = this.currentRoute.match(/^\/session\/(.+)$/);
    if (match) {
      const sessionId = match[1];
      render(
        html`<session-chat .sessionId=${sessionId}></session-chat>`,
        root
      );
      return;
    }

    window.location.hash = "";
  }
}

new AppRoot();
