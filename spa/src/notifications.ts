const NOTIFY_KEY = "pi-notify-settings";

export interface NotifySettings {
  sound: boolean;
  browser: boolean;
}

let settings: NotifySettings = loadSettings();

function loadSettings(): NotifySettings {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { sound: true, browser: false };
}

export function getNotifySettings(): NotifySettings {
  return { ...settings };
}

export function setNotifySettings(s: Partial<NotifySettings>) {
  settings = { ...settings, ...s };
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(settings));
}

export async function requestBrowserPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

export function sendBrowserNotification(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {}
}

export function playSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

let lastNotifyTime = 0;
const NOTIFY_COOLDOWN = 5000;

export function notify(title: string, body: string) {
  const now = Date.now();
  if (now - lastNotifyTime < NOTIFY_COOLDOWN) return;
  lastNotifyTime = now;

  const s = getNotifySettings();
  if (s.sound) playSound();
  if (s.browser) sendBrowserNotification(title, body);
}
