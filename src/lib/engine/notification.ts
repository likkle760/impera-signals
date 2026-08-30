export type AlertKind =
  | "NEW BUY"
  | "NEW SELL"
  | "NEW BUY LIMIT"
  | "NEW SELL LIMIT"
  | "SIGNAL TRIGGERED"
  | "SIGNAL INVALIDATED"
  | "TP HIT"
  | "SL HIT"
  | "RISK INCREASED"
  | "SETUP CANCELLED";

export interface AlertEvent {
  id: string;
  kind: AlertKind;
  message: string;
  timestamp: number;
}

export class NotificationEngine {
  private listeners = new Set<(e: AlertEvent) => void>();

  private lastFired = new Map<string, number>();

  notify(kind: AlertKind, message: string, dedupeKey?: string): AlertEvent | null {
    const now = Date.now();
    if (dedupeKey) {
      const last = this.lastFired.get(dedupeKey);
      if (last && now - last < 30_000) return null;
      this.lastFired.set(dedupeKey, now);
    }
    const event: AlertEvent = {
      id: `alert-${now}-${Math.floor(Math.random() * 10000)}`,
      kind,
      message,
      timestamp: now
    };
    for (const l of this.listeners) l(event);
    this.fireBrowser(kind, message);
    return event;
  }

  subscribe(fn: (e: AlertEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private fireBrowser(kind: AlertKind, message: string) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      try {
        new Notification("IMPERA SIGNALS V1", { body: `${kind}: ${message}` });
      } catch {
        /* ignore */
      }
    }
  }
}
