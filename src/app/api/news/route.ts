import { NextResponse } from "next/server";
import type { NewsEvent, NewsImpact } from "@/lib/engine/news";

/**
 * Server-side ForexFactory calendar proxy.
 *
 * ForexFactory does not ship a documented public API, but it publishes a
 * machine-readable JSON feed of its economic calendar for the current week:
 *   https://nfs.faireconomy.media/ff_calendar_thisweek.json
 *   https://nfs.faireconomy.media/ff_calendar_nextweek.json
 *
 * We fetch + cache it server-side (never exposing the browser to CORS/Threat
 * protection) and normalize it into the internal NewsEvent[] shape the signal
 * engine already consumes. On fetch failure we return the last-good cache so
 * the UI + engine never go blind.
 *
 * Data is read-only. No keys required (fallback mirrors Demo sources).
 */

export const dynamic = "force-dynamic";

const FF_THIS_WEEK = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const FF_NEXT_WEEK = "https://nfs.faireconomy.media/ff_calendar_nextweek.json";

const FETCH_TIMEOUT = 8_000;

// CACHE_TTL: how long we trust a fetched copy before re-fetching.
const CACHE_TTL = 15 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  events: NewsEvent[];
  source: string;
}

let cache: CacheEntry | null = null;

/** Map a ForexFactory impact label to our NewsImpact. */
function toImpact(raw: string): NewsImpact {
  const v = (raw || "").toUpperCase();
  if (v === "HIGH") return "HIGH";
  if (v === "MEDIUM" || v === "MED") return "MEDIUM";
  return "LOW";
}

/** Map a ForexFactory country code to the list of affected currencies. */
function currenciesFor(country: string): string[] {
  const map: Record<string, string[]> = {
    USD: ["USD"], EUR: ["EUR"], GBP: ["GBP"], JPY: ["JPY"],
    AUD: ["AUD"], NZD: ["NZD"], CAD: ["CAD"], CHF: ["CHF"],
    CNY: ["CNY"], SEK: ["SEK"], NOK: ["NOK"], MXN: ["MXN"],
    ZAR: ["ZAR"], TRY: ["TRY"], PLN: ["PLN"], HUF: ["HUF"],
    SGD: ["SGD"], HKD: ["HKD"], KRW: ["KRW"], INR: ["INR"],
    BRL: ["BRL"], RUB: ["RUB"]
  };
  return map[country.toUpperCase()] ?? [];
}

/** Infer the directional bias a release tends to print (cosmetic; optional). */
function directionFor(title: string): NewsEvent["direction"] {
  const t = title.toLowerCase();
  // Retail sales up / more jobs / higher inflation / tighter policy → local currency tends bid.
  if (/\b(retail sales|payrolls|gdp|cpi|ppi|inflation|consumption|exports|production|sales|employment)\b/.test(t)) {
    return "BULLISH";
  }
  if (/\b(claims|unemployment|deficit|trade balance|confidence)\b/.test(t)) {
    return "BEARISH";
  }
  return "NEUTRAL";
}

function natureFor(title: string): NewsEvent["nature"] {
  const t = title.toLowerCase();
  return /\b(claims|unemployment|trade balance|deficit|confidence)\b/.test(t)
    ? "inverse"
    : "value";
}

/** Normalize the raw FF JSON array into NewsEvent[]. */
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
    const currencies = currenciesFor(country);
    out.push({
      title,
      time: new Date(date).toISOString(),
      impact: toImpact(impact),
      currencies,
      indices: [],
      direction: directionFor(title),
      nature: natureFor(title)
    });
  }
  return out;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    headers: { "Accept": "application/json" }
  });
}

async function fetchCalendar(): Promise<{ events: NewsEvent[]; source: string }> {
  // Pull this week first; if it yields nothing (holiday/new week rollover) or is
  // too sparse, also merge the next week so the calendar always has forward data.
  let events: NewsEvent[] = [];
  let source = "forexfactory:thisweek";
  try {
    const res = await fetchWithTimeout(FF_THIS_WEEK);
    if (res.ok) {
      const data = await res.json();
      events = normalize(data);
    }
  } catch { /* fall through */ }

  if (events.length < 5) {
    try {
      const res = await fetchWithTimeout(FF_NEXT_WEEK);
      if (res.ok) {
        const data = await res.json();
        const next = normalize(data);
        if (next.length > events.length) {
          events = next;
          source = "forexfactory:nextweek";
        }
      }
    } catch { /* keep what we have */ }
  }

  return { events, source };
}

export async function GET() {
  // Serve from cache when fresh.
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json({ ok: true, events: cache.events, source: cache.source, cached: true, fetchedAt: cache.fetchedAt });
  }

  try {
    const { events, source } = await fetchCalendar();
    if (events.length) {
      cache = { fetchedAt: Date.now(), events, source };
    }
    const useCache = !events.length && cache;
    const body = useCache
      ? { ok: true, events: cache!.events, source: cache!.source, cached: true, fetchedAt: cache!.fetchedAt }
      : { ok: true, events, source, cached: false, fetchedAt: Date.now() };
    return NextResponse.json(body);
  } catch (e) {
    // Return stale cache if present, else degrade gracefully.
    if (cache) {
      return NextResponse.json({ ok: true, events: cache.events, source: cache.source, cached: true, fetchedAt: cache.fetchedAt });
    }
    return NextResponse.json({ ok: false, events: [], error: String(e) }, { status: 502 });
  }
}
