/**
 * News-aware trade bias.
 *
 * Forex Factory does not offer a scrape-friendly public API, so this module
 * models the high-impact scheduled economic calendar (the same events FF tracks)
 * and maps each event to the currencies / indices it most affects plus the
 * market's usual directional reaction when the release comes in "hot" or "cold".
 *
 * The engine uses this to FLAG (never guarantee) that a high-impact release is
 * imminent — useful for widening stops or skipping entries around news — and to
 * apply a small directional tilt consistent with how the market typically
 * prices the most probable outcome.
 */
export type NewsImpact = "HIGH" | "MEDIUM" | "LOW";

export interface NewsEvent {
  title: string;
  /** ISO date/time (UTC) the release is expected. */
  time: string;
  impact: NewsImpact;
  /** Currencies primarily affected (USD, EUR, JPY, GBP ...). */
  currencies: string[];
  /** Indices that typically react (US indices for USD data, etc.). */
  indices: string[];
  /** Direction the affected market tends to move on a better-than-expected print. */
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  /** Which print is "better" for the asset: "value" (higher = bullish) or "inverse". */
  nature: "value" | "inverse";
}

// Curated recurring high-impact events. Times are UTC. These are the recurring
// monthly/weekly releases FF tracks; a live calendar can override via ingest().
export const DEFAULT_NEWS_CALENDAR: NewsEvent[] = [
  { title: "US Non-Farm Payrolls", time: "", impact: "HIGH", currencies: ["USD"], indices: ["US"], direction: "BULLISH", nature: "value" },
  { title: "US CPI (YoY)", time: "", impact: "HIGH", currencies: ["USD"], indices: ["US"], direction: "BULLISH", nature: "value" },
  { title: "US Core PCE Price Index", time: "", impact: "HIGH", currencies: ["USD"], indices: ["US"], direction: "BULLISH", nature: "value" },
  { title: "FOMC Rate Decision", time: "", impact: "HIGH", currencies: ["USD"], indices: ["US"], direction: "BULLISH", nature: "value" },
  { title: "US GDP (QoQ)", time: "", impact: "HIGH", currencies: ["USD"], indices: ["US"], direction: "BULLISH", nature: "value" },
  { title: "US Retail Sales (MoM)", time: "", impact: "HIGH", currencies: ["USD"], indices: ["US"], direction: "BULLISH", nature: "value" },
  { title: "US ISM Manufacturing PMI", time: "", impact: "HIGH", currencies: ["USD"], indices: ["US"], direction: "BULLISH", nature: "value" },
  { title: "US Unemployment Claims", time: "", impact: "MEDIUM", currencies: ["USD"], indices: ["US"], direction: "BEARISH", nature: "value" },
  { title: "ECB Rate Decision", time: "", impact: "HIGH", currencies: ["EUR"], indices: ["EU"], direction: "BULLISH", nature: "value" },
  { title: "Eurozone CPI (YoY)", time: "", impact: "HIGH", currencies: ["EUR"], indices: ["EU"], direction: "BULLISH", nature: "value" },
  { title: "BOE Rate Decision", time: "", impact: "HIGH", currencies: ["GBP"], indices: ["UK"], direction: "BULLISH", nature: "value" },
  { title: "BOJ Rate Decision", time: "", impact: "HIGH", currencies: ["JPY"], indices: ["JP"], direction: "BULLISH", nature: "value" },
  { title: "SNB Rate Decision", time: "", impact: "HIGH", currencies: ["CHF"], indices: [], direction: "BULLISH", nature: "value" },
  { title: "RBA Rate Decision", time: "", impact: "HIGH", currencies: ["AUD"], indices: ["AU"], direction: "BULLISH", nature: "value" },
  { title: "Canadian CPI (YoY)", time: "", impact: "HIGH", currencies: ["CAD"], indices: [], direction: "BULLISH", nature: "value" },
  { title: "US Crude Oil Inventories", time: "", impact: "MEDIUM", currencies: ["USD"], indices: ["CL"], direction: "BULLISH", nature: "inverse" }
];

/** Currency that a given symbol is denominated in (for news relevance). */
export function symbolCurrency(symbol: string): string {
  const upper = symbol.replace(/USD$/, "").toUpperCase();
  const base = symbol.toUpperCase();
  if (base === "XAUUSD" || base === "GC") return "USD";
  if (base.startsWith("X") && base.endsWith("USD")) return "USD";
  if (["US30", "US100", "US500"].includes(base)) return "USD";
  if (base === "GER40") return "EUR";
  if (base === "UK100") return "GBP";
  if (base === "JP225") return "JPY";
  if (base === "FRA40") return "EUR";
  if (base === "AUS200") return "AUD";
  if (base === "NQ" || base === "ES" || base === "YM") return "USD";
  if (base === "CL" || base === "NG") return "USD";
  return upper;
}

export interface NewsContext {
  hasEvent: boolean;
  /** Minutes until the next relevant high-impact event. */
  minutesUntil: number;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  impact: NewsImpact | null;
  event: string | null;
  /** Suggested action: skip fresh entries recently before a high-impact print. */
  precaution: string | null;
}

let calendar: NewsEvent[] = [...DEFAULT_NEWS_CALENDAR];

export function setNewsCalendar(events: NewsEvent[]): void {
  calendar = events;
}
export function getNewsCalendar(): NewsEvent[] {
  return calendar;
}

/** Ingest events from a serialized calendar (e.g. a fetched FF JSON). */
export function ingestNewsCalendar(data: unknown): void {
  if (!Array.isArray(data)) return;
  const parsed = data
    .filter((e): e is NewsEvent => e && typeof e === "object" && "title" in e && "time" in e)
    .map((e) => ({
      title: String(e.title),
      time: String(e.time),
      impact: (e.impact as NewsImpact) ?? "MEDIUM",
      currencies: Array.isArray(e.currencies) ? e.currencies : [],
      indices: Array.isArray(e.indices) ? e.indices : [],
      direction: ((e.direction as string) ?? "NEUTRAL") as NewsEvent["direction"],
      nature: (e.nature === "inverse" ? "inverse" : "value") as NewsEvent["nature"]
    }));
  if (parsed.length) calendar = parsed;
}

const CUR_TO_INDEX: Record<string, string[]> = {
  USD: ["US"],
  EUR: ["EU"],
  GBP: ["UK"],
  JPY: ["JP"],
  AUD: ["AU"],
  CAD: ["CA"],
  CHF: ["CH"],
  NZD: ["NZ"]
};

const SKIP_WINDOW_MS = 2 * 60 * 60 * 1000; // skip/tighten entries 2h before a high-impact print

/**
 * Evaluate news relevance for a symbol right now.
 * @param symbol the instrument symbol (e.g. EURUSD, XAUUSD, US100, NQ)
 * @param direction the trade direction being considered (BUY/SELL)
 */
export function newsContext(symbol: string, direction?: "BUY" | "SELL"): NewsContext {
  const now = Date.now();
  const currency = symbolCurrency(symbol);
  const relevant = calendar.filter((e) => {
    if (e.impact !== "HIGH") return false;
    const hasCur = e.currencies.includes(currency);
    const index = CUR_TO_INDEX[currency] ?? [];
    const hasIndex = e.indices.some((i) => index.includes(i));
    return hasCur || hasIndex;
  });

  let nearest: NewsEvent | null = null;
  let bestDelta = Infinity;
  for (const e of relevant) {
    if (!e.time) continue;
    const t = new Date(e.time).getTime();
    if (Number.isNaN(t)) continue;
    const delta = t - now;
    if (delta >= -30 * 60 * 1000 && delta < bestDelta) {
      bestDelta = delta;
      nearest = e;
    }
  }

  if (!nearest) {
    return { hasEvent: false, minutesUntil: Infinity, bias: "NEUTRAL", impact: null, event: null, precaution: null };
  }

  const mins = Math.max(0, Math.round(bestDelta / 60000));
  const bias = nearest.direction;
  const precaution = mins <= SKIP_WINDOW_MS / 60000 ? `High-impact "${nearest.title}" ${mins < 1 ? "is imminent" : `in ~${mins}m`}; consider reducing size or skipping.` : null;

  return {
    hasEvent: true,
    minutesUntil: mins,
    bias,
    impact: nearest.impact,
    event: nearest.title,
    precaution
  };
}

/** Small confidence adjustment when news is pending. */
export function newsAdjustment(ctx: NewsContext, direction: "BUY" | "SELL"): number {
  if (!ctx.hasEvent || ctx.impact !== "HIGH") return 0;
  let adj = 0;
  const dirBias: "BULLISH" | "BEARISH" = direction === "BUY" ? "BULLISH" : "BEARISH";
  if (ctx.bias === dirBias) adj += 3;
  else if (ctx.bias !== "NEUTRAL") adj -= 5;
  if (ctx.minutesUntil <= 30) adj -= 5; // avoid the immediate release whipsaw
  return adj;
}
