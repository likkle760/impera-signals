/**
 * Forex correlation + DXY engine (§14, §15).
 *
 * §14: EURUSD BUY + GBPUSD BUY + AUDUSD BUY often represent the SAME macro idea
 * (USD weakness). We must not treat them as three independent trades. Track each
 * currency's net directional exposure across all candidate signals, collapse
 * correlated opportunities, and retain only the best representative (highest
 * quality, best R:R).
 *
 * §15: DXY is CONTEXT ONLY — it can strengthen a USD-pair read but must never
 * automatically decide the trade.
 */
export type Currency =
  | "USD" | "EUR" | "GBP" | "JPY" | "CHF" | "CAD" | "AUD" | "NZD";

export interface SignalExposure {
  symbol: string;
  direction: "BUY" | "SELL";
  /** currency pair legs */
  base: Currency;
  quote: Currency;
  quality: number;
  rr: number;
  /** if a correlated sibling dominates, set to its symbol */
  dedupedBy?: string;
  keep: boolean;
}

export interface CorrelationInput {
  signals: Array<{
    symbol: string;
    direction: "BUY" | "SELL";
    quality: number;
    rr: number;
  }>;
}

export interface CorrelationResult {
  /** per-currency net exposure: positive = that currency bought (strong) */
  netExposure: Record<string, number>;
  /** large magnitude signals a crowded USD view (e.g.) */
  prevailing: Currency;
  /** the deduped list (one representative per macro idea) */
  best: SignalExposure[];
  summary: string;
}

const CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];

/** Parse a symbol into (base, quote). Handles majors and cross, gold as USD. */
export function parsePair(symbol: string): { base: Currency; quote: Currency } {
  const s = symbol.toUpperCase();
  if (s === "XAUUSD" || s === "GC") return { base: "USD", quote: "USD" };
  for (let i = 3; i >= 2; i--) {
    if (s.length === 6) {
      const base = s.slice(0, i);
      const quote = s.slice(i);
      if (CURRENCIES.includes(base as Currency) && CURRENCIES.includes(quote as Currency)) {
        return { base: base as Currency, quote: quote as Currency };
      }
    }
  }
  // fall back: assume first 3 chars base, last 3 quote
  return { base: s.slice(0, 3) as Currency, quote: s.slice(3, 6) as Currency };
}

export class CorrelationEngine {
  resolve(input: CorrelationInput): CorrelationResult {
    const expo: Record<string, { long: number; short: number }> = {};
    const sdi = (c: string) => {
      if (!expo[c]) expo[c] = { long: 0, short: 0 };
      return expo[c];
    };

    const parsed: SignalExposure[] = input.signals.map((s) => {
      const { base, quote } = parsePair(s.symbol);
      // BUY EURUSD = EUR long + USD short.
      const long: Currency = s.direction === "BUY" ? base : quote;
      const short: Currency = s.direction === "BUY" ? quote : base;
      sdi(long).long += s.quality;
      sdi(short).short += s.quality;
      return { symbol: s.symbol, direction: s.direction, base, quote, quality: s.quality, rr: s.rr, keep: true };
    });

    const netExposure: Record<string, number> = {};
    for (const c of CURRENCIES) netExposure[c] = expo[c] ? expo[c].long - expo[c].short : 0;
    const prevailing = CURRENCIES.reduce((a, b) => (Math.abs(netExposure[a]) >= Math.abs(netExposure[b]) ? a : b));

    // Dedup: group signals sharing the same counter-exposure (the currency being
    // SOLD). EURUSD BUY + GBPUSD BUY + AUDUSD BUY all short USD → the same
    // "USD weakness" macro idea; keep only the best representative (§14).
    const groups = new Map<string, SignalExposure[]>();
    for (const p of parsed) {
      const key = p.direction === "BUY" ? p.quote : p.base; // currency being sold
      const arr = groups.get(key) ?? [];
      arr.push(p);
      groups.set(key, arr);
    }
    const best: SignalExposure[] = [];
    for (const [, arr] of groups) {
      arr.sort((a, b) => (b.quality + b.rr) - (a.quality + a.rr));
      const keeper = arr[0];
      if (keeper) {
        for (const other of arr) {
          other.keep = other === keeper;
          if (other !== keeper) other.dedupedBy = keeper.symbol;
        }
        best.push(keeper);
      }
    }
    best.sort((a, b) => (b.quality + b.rr) - (a.quality + a.rr));

    const summary = `Net ${prevailing} exposure ${
      netExposure[prevailing] >= 0 ? "long" : "short"
    } (${Math.abs(netExposure[prevailing]).toFixed(0)}). ${
      best.length !== input.signals.length
        ? `${input.signals.length - best.length} correlated trade(s) deduped into the highest-quality representative.`
        : "No correlated duplication — each signal is an independent macro idea."
    }`;

    return { netExposure, prevailing, best, summary };
  }
}

/**
 * DXY context (§15): read a provided DXY value + 24h change; produce a directional
 * context + confidence. This can RAISE or LOWER confidence but never auto-decides.
 */
export interface DxyContext {
  value: number | null;
  changePct: number | null;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  strength: number; // 0..5
  note: string;
}

export function dxyContext(value: number | null, changePct: number | null): DxyContext {
  if (value == null) {
    return { value, changePct, bias: "NEUTRAL", strength: 0, note: "No DXY available; treating as neutral context." };
  }
  let bias: DxyContext["bias"] = "NEUTRAL";
  let strength = 0;
  const chg = changePct ?? 0;
  if (value > 104 && chg > 0.1) { bias = "BULLISH"; strength = 3; }
  else if (value < 96 && chg < -0.1) { bias = "BEARISH"; strength = 3; }
  else if (chg > 0.2) { bias = "BULLISH"; strength = 2; }
  else if (chg < -0.2) { bias = "BEARISH"; strength = 2; }
  const note = `DXY ${value.toFixed(2)} (${chg >= 0 ? "+" : ""}${(chg ?? 0).toFixed(2)}%) → ${bias}${strength ? ` strength ${strength}/5` : " context only"}.`;
  return { value, changePct, bias, strength, note };
}