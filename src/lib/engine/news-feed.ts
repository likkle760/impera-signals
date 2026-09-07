import { ingestNewsCalendar, getNewsCalendar, symbolCurrency, type NewsEvent } from "../engine/news";

/**
 * Server-side economic-calendar loader.
 *
 * Wires the ForexFactory weekly JSON feed into the shared in-memory news
 * calendar that the signal engine reads. Runs on the server (RSC / API), never
 * in the browser, and caches to avoid hammering FF on every scan.
 *
 * Falls back gracefully: if the feed cannot be reached it keeps the last-good
 * calendar (or the curated static defaults) so signals never crash.
 */

const FF_THIS_WEEK = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const FF_NEXT_WEEK = "https://nfs.faireconomy.media/ff_calendar_nextweek.json";

const REFRESH_MS = 15 * 60 * 1000; // re-fetch every 15 minutes
const FETCH_TIMEOUT = 8_000;

let lastRefresh = 0;
let loadPromise: Promise<void> | null = null;

type Pending = NewsEvent;

function toImpact(raw: string): "HIGH" | "MEDIUM" | "LOW" {
  const v = (raw || "").toUpperCase();
  if (v === "HIGH") return "HIGH";
  if (v === "MEDIUM" || v === "MED") return "MEDIUM";
  return "LOW";
}

const CURRENCY_MAP: Record<string, string[]> = {
  USD: ["USD"], EUR: ["EUR"], GBP: ["GBP"], JPY: ["JPY"], AUD: ["AUD"],
  NZD: ["NZD"], CAD: ["CAD"], CHF: ["CHF"], CNY: ["CNY"], SEK: ["SEK"],
  NOK: ["NOK"], MXN: ["MXN"], ZAR: ["ZAR"], TRY: ["TRY"], PLN: ["PLN"],
  HUF: ["HUF"], SGD: ["SGD"], HKD: ["HKD"]
};

function currenciesFor(country: string): string[] {
  return CURRENCY_MAP[country?.toUpperCase()] ?? [];
}

function directionFor(title: string): NewsEvent["direction"] {
  const t = title.toLowerCase();
  if (/\b(retail sales|payrolls|gdp|cpi|ppi|inflation|consumption|production|sales|employment)\b/.test(t)) return "BULLISH";
  if (/\b(claims|unemployment|deficit|trade balance|confidence)\b/.test(t)) return "BEARISH";
  return "NEUTRAL";
}

function natureFor(title: string): NewsEvent["nature"] {
  return /\b(claims|unemployment|trade balance|deficit|confidence)\b/.test(title.toLowerCase()) ? "inverse" : "value";
}

function normalize(raw: unknown): NewsEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: NewsEvent[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const rec = e as Record<string, unknown>;
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    const date = typeof rec.date === "string" ? rec.date : "";
    const country = typeof rec.country === "string" ? rec.country : "";
    const impact = typeof rec.impact === "string" ? rec.impact : "Low";
    if (!title || !date) continue;
    const iso = new Date(date);
    if (Number.isNaN(iso.getTime())) continue;
    out.push({
      title,
      time: iso.toISOString(),
      impact: toImpact(impact),
      currencies: currenciesFor(country),
      indices: [],
      direction: directionFor(title),
      nature: natureFor(title)
    });
  }
  return out;
}

export function newsCalendar(): NewsEvent[] {
  return getNewsCalendar();
}

const CUR_TO_INDEX: Record<string, string[]> = {
  USD: ["US"], EUR: ["EU"], GBP: ["UK"], JPY: ["JP"], AUD: ["AU"],
  CAD: ["CA"], CHF: ["CH"], NZD: ["NZ"]
};

/**
 * Upcoming HIGH-impact event timestamps (UTC ms) within `horizonMs` that affect
 * the given symbol. Used by EA-style engines (scalp/swing) so they can blackout
 * fresh entries around real releases instead of blindly trusting a static conf.
 */
export function upcomingHighImpactTimes(
  symbol: string,
  horizonMs = 4 * 60 * 60 * 1000
): number[] {
  const now = Date.now();
  const currency = symbolCurrency(symbol);
  const index = CUR_TO_INDEX[currency] ?? [];
  const out: number[] = [];
  for (const e of getNewsCalendar()) {
    if (e.impact !== "HIGH" || !e.time) continue;
    const t = new Date(e.time).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= now - 30 * 60 * 1000 && t <= now + horizonMs) {
      const hasCur = e.currencies.includes(currency);
      const hasIndex = e.indices.some((i) => index.includes(i));
      if (hasCur || hasIndex) out.push(t);
    }
  }
  return out;
}

/** Fetch and ingest the latest FF weekly calendar (server-side, cached). */
export async function refreshNewsCalendar(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastRefresh < REFRESH_MS) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const thisRes = await fetch(FF_THIS_WEEK, {
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT)
      });
      let events: NewsEvent[] = [];
      if (thisRes.ok) events = normalize(await thisRes.json());

      if (events.length < 5) {
        const nextRes = await fetch(FF_NEXT_WEEK, {
          cache: "no-store",
          signal: AbortSignal.timeout(FETCH_TIMEOUT)
        });
        if (nextRes.ok) {
          const next = normalize(await nextRes.json());
          if (next.length > events.length) events = next;
        }
      }

      if (events.length) ingestNewsCalendar(events);
      lastRefresh = Date.now();
    } catch {
      // Keep last-good calendar on failure.
      lastRefresh = Date.now();
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}
