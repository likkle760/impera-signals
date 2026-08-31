import { NextResponse } from "next/server";

/**
 * Server-side OANDA proxy (read-only).
 *
 * Keeps the OANDA API token entirely server-side — it is NEVER sent to the
 * browser. The client OandaMarketDataProvider talks to THESE endpoints, which
 * forward read-only requests (pricing + candles + status) to OANDA.
 *
 * Deliberately exposes NO order/execution/transaction endpoints. This is a
 * live-real-money-safe data feed only.
 */

export const dynamic = "force-dynamic";

const TIMEFRAME_GRANULARITY: Record<string, string> = {
  "1m": "M1", "3m": "M3", "5m": "M5", "15m": "M15", "30m": "M30",
  "1h": "H1", "4h": "H4", "1d": "D"
};

const TO_INTERNAL: Record<string, string> = {
  EUR_USD: "EURUSD", GBP_USD: "GBPUSD", USD_JPY: "USDJPY", USD_CHF: "USDCHF",
  USD_CAD: "USDCAD", AUD_USD: "AUDUSD", NZD_USD: "NZDUSD", EUR_GBP: "EURGBP",
  EUR_JPY: "EURJPY", GBP_JPY: "GBPJPY", AUD_JPY: "AUDJPY", EUR_AUD: "EURAUD",
  GBP_AUD: "GBPAUD", AUD_CAD: "AUDCAD", NZD_JPY: "NZDJPY", XAU_USD: "XAUUSD",
  XAG_USD: "XAGUSD",
  CAD_CHF: "CADCHF", GBP_CHF: "GBPCHF", NZD_CHF: "NZDCHF", AUD_CHF: "AUDCHF",
  EUR_NZD: "EURNZD", AUD_NZD: "AUDNZD",
  NAS100_USD: "NAS100", US30_USD: "ET30",
  WTICO_USD: "USOIL", BCO_USD: "UKOIL"
};

const TO_OANDA: Record<string, string> = Object.fromEntries(
  Object.entries(TO_INTERNAL).map(([k, v]) => [v, k])
);

function restBase(env: string): string {
  return (env === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com");
}

function authHeaders(additional: Record<string, string> = {}): Headers {
  return new Headers({ "Authorization": `Bearer ${process.env.OANDA_TOKEN ?? ""}`, "Content-Type": "application/json", ...additional });
}

export async function GET(req: Request) {
  const token = process.env.OANDA_TOKEN;
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const env = process.env.OANDA_ENV === "live" ? "live" : "practice";

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";

  if (action === "status") {
    return NextResponse.json({ configured: Boolean(token && accountId), env, label: "OANDA Live" });
  }

  if (!token || !accountId) {
    return NextResponse.json({ ok: false, error: "OANDA not configured" }, { status: 503 });
  }

  const base = restBase(env);

  if (action === "pricing") {
    const requested = (url.searchParams.get("symbols") ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean)
      .map((s) => TO_OANDA[s] ?? s);
    if (!requested.length) return NextResponse.json({ ok: false, error: "no symbols" }, { status: 400 });
    const instruments = requested.join(",");
    try {
      const res = await fetch(`${base}/v3/accounts/${accountId}/pricing?instruments=${instruments}`, {
        headers: authHeaders(), cache: "no-store"
      });
      if (!res.ok) return NextResponse.json({ ok: false, error: `OANDA HTTP ${res.status}` }, { status: 502 });
      const data = await res.json();
      const quotes = (data.prices ?? []).map((p: any) => {
        const internal = TO_INTERNAL[p.instrument] ?? p.instrument;
        const bid = parseFloat(p.bids?.[0]?.price ?? "0");
        const ask = parseFloat(p.asks?.[0]?.price ?? "0");
        return { symbol: internal, bid, ask, last: (bid + ask) / 2, spread: ask - bid, timestamp: Date.now() };
      });
      return NextResponse.json({ ok: true, quotes });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
    }
  }

  if (action === "candles") {
    const sym = url.searchParams.get("symbol") ?? "";
    const oanda = TO_OANDA[sym] ?? sym;
    const tf = url.searchParams.get("timeframe") ?? "5m";
    const granularity = TIMEFRAME_GRANULARITY[tf] ?? tf.toUpperCase();
    const count = Math.min(500, parseInt(url.searchParams.get("count") ?? "300", 10));
    try {
      const res = await fetch(`${base}/v3/instruments/${oanda}/candles?granularity=${granularity}&count=${count}&price=MBA`, {
        headers: authHeaders(), cache: "no-store"
      });
      if (!res.ok) return NextResponse.json({ ok: false, error: `OANDA HTTP ${res.status}` }, { status: 502 });
      const data = await res.json();
      const candles = (data.candles ?? []).map((c: any) => ({
        time: new Date(c.time).getTime() / 1000,
        open: parseFloat(c.mid?.o ?? "0"),
        high: parseFloat(c.mid?.h ?? "0"),
        low: parseFloat(c.mid?.l ?? "0"),
        close: parseFloat(c.mid?.c ?? "0"),
        volume: c.volume ?? 0
      }));
      return NextResponse.json({ ok: true, symbol: sym, candles });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: false, error: `unknown action ${action}` }, { status: 400 });
}