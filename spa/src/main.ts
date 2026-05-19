import "./app.css";
import { html, render } from "lit";
import "./pages/session-list";
import "./pages/session-chat";

class AppRoot {
  currentRoute = "";

  constructor() {
    window.addEventListener("hashchange", () => this.route());
    this.route();
  }

  route() {
    const hash = window.location.hash.slice(1);
    this.currentRoute = hash;
    this.render();
  }

  render() {
    const root = document.getElementById("app")!;

    if (!this.currentRoute) {
      render(html`<session-list .onSelect=${(id: string) => {
        window.location.hash = `#/session/${id}`;
      }}></session-list>`, root);
      return;
    }

    const match = this.currentRoute.match(/^\/session\/(.+)$/);
    if (match) {
      const sessionId = match[1];
      render(html`<session-chat .sessionId=${sessionId}></session-chat>`, root);
      return;
    }

    render(html`<session-list></session-list>`, root);
  }
}

new AppRoot();
