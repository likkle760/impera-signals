import type { Direction, MarketRegime } from "../../types";

/**
 * Signal Journal (§43).
 *
 * Records every signal — INCLUDING signals that were NOT taken and no-trades —
 * so the strategy can be researched later. Each entry captures the full decision
 * context: timestamp, pair, direction, strategy, score, regime, HTF bias,
 * liquidity event, MSS/BOS, FVG, zone, entry/SL/TP, R:R, spread, news context,
 * and (after the trade) result, MFE and MAE.
 *
 * Persisted to localStorage (browser) mirroring the existing trade journal.
 */
export type JournalSignalOutcome = "WIN" | "LOSS" | "BREAKEVEN" | "OPEN" | "MISSED" | "CANCELLED";

export interface SignalJournalEntry {
  id: string;
  timestamp: number;
  symbol: string;
  direction: Direction | null;
  strategy: "SWING" | "SCALP" | "INTRADAY" | "WATCH";
  state: "WATCH" | "ARMED" | "LIVE" | "NO TRADE";
  score: number;
  regime: MarketRegime;
  htfBias: MarketRegime;
  session: string;
  liquidityEvent: string | null;
  structureBreak: "BOS" | "CHOCH" | "MSS" | null;
  fvg: string | null;
  zone: string | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  rr: number | null;
  spread: number | null;
  newsBlocked: boolean;
  reason: string;
  taken: boolean;
  // post-trade results
  outcome: JournalSignalOutcome;
  mfe: number | null;
  mae: number | null;
  holdingMs: number | null;
}

const KEY = "impera.signal-journal.v1";

export class SignalJournal {
  private entries: SignalJournalEntry[] = [];

  constructor(private persist: boolean = true) {
    if (persist && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) this.entries = JSON.parse(raw);
      } catch { this.entries = []; }
    }
  }

  record(entry: Omit<SignalJournalEntry, "id" | "timestamp" | "taken" | "outcome" | "mfe" | "mae" | "holdingMs"> & {
    taken?: boolean;
    outcome?: JournalSignalOutcome;
  }): SignalJournalEntry {
    const full: SignalJournalEntry = {
      id: `sj-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      timestamp: Date.now(),
      taken: entry.taken ?? false,
      outcome: entry.outcome ?? "OPEN",
      mfe: null,
      mae: null,
      holdingMs: null,
      ...entry
    };
    this.entries.push(full);
    this.flush();
    return full;
  }

  update(id: string, patch: Partial<SignalJournalEntry>): void {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return;
    Object.assign(e, patch);
    this.flush();
  }

  all(): SignalJournalEntry[] {
    return [...this.entries].reverse();
  }

  get length(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.flush();
  }

  private flush(): void {
    if (!this.persist || typeof window === "undefined") return;
    try { localStorage.setItem(KEY, JSON.stringify(this.entries)); } catch { /* ignore */ }
  }
}

/** Compute MFE/MAE from a high/low path relative to entry (in R). */
export function mfeMae(entry: number, sl: number, highs: number[], lows: number[], size = 1): { mfe: number; mae: number } {
  const risk = Math.abs(entry - sl);
  if (risk <= 0) return { mfe: 0, mae: 0 };
  let mfe = 0;
  let mae = 0;
  for (let i = 0; i < highs.length; i++) {
    const fav = highs[i] - entry;
    const adv = lows[i] - entry;
    if (fav > mfe) mfe = fav;
    if (adv < mae) mae = adv;
  }
  return { mfe: mfe / risk * size, mae: mae / risk * size };
}