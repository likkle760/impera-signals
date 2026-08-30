import type { TradeLogEntry } from "./types";

const KEY = "impera.tradeLog.v1";
const MAX_ENTRIES = 2000;

/**
 * TradeLogger — persistent (localStorage) record of signals, orders, trades,
 * backtests and reports. Provides auditable history for reviewing the model and
 * verifying that what was "signalled" matches what happened. Client-only.
 */
export class TradeLogger {
  private entries: TradeLogEntry[];

  constructor() {
    this.entries = this.load();
  }

  private load(): TradeLogEntry[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.entries.slice(0, MAX_ENTRIES)));
    } catch {
      /* storage full/blocked — drop oldest */
      this.entries = this.entries.slice(0, Math.floor(MAX_ENTRIES / 2));
      try { window.localStorage.setItem(KEY, JSON.stringify(this.entries)); } catch { /* ignore */ }
    }
  }

  push(partial: Omit<TradeLogEntry, "id" | "ts">): TradeLogEntry {
    const entry: TradeLogEntry = {
      id: `tl-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      ts: Date.now(),
      ...partial
    };
    this.entries.unshift(entry);
    this.entries = this.entries.slice(0, MAX_ENTRIES);
    this.persist();
    return entry;
  }

  all(): TradeLogEntry[] {
    return [...this.entries];
  }

  byKind(kind: TradeLogEntry["kind"]): TradeLogEntry[] {
    return this.entries.filter((e) => e.kind === kind);
  }

  bySymbol(symbol: string): TradeLogEntry[] {
    return this.entries.filter((e) => e.symbol === symbol);
  }

  clear(): void {
    this.entries = [];
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
    }
  }
}
