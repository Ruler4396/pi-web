import "./app.css";
import { html, render } from "lit";
import "./pages/session-list";
import "./pages/session-chat";

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

    // Unknown route → back to session list
    window.location.hash = "";
  }
}

new AppRoot();
