import type { Signal } from "./analysis-types";

export interface HistoryEntry extends Signal {
  outcome: "pending" | "won" | "lost" | "invalidated" | "expired";
  resultNote?: string;
}

const KEY = "impera.signal-history.v1";

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 500)));
  } catch {
    /* ignore */
  }
}

export function upsertHistory(entries: HistoryEntry[], updated: HistoryEntry): HistoryEntry[] {
  const idx = entries.findIndex((e) => e.id === updated.id);
  if (idx >= 0) {
    const next = [...entries];
    next[idx] = updated;
    return next;
  }
  return [updated, ...entries].slice(0, 500);
}
