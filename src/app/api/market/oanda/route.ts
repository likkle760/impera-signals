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
  EUR_CHF: "EURCHF", EUR_CAD: "EURCAD", GBP_NZD: "GBPNZD", GBP_CAD: "GBPCAD",
  NZD_CAD: "NZDCAD", CAD_JPY: "CADJPY", CHF_JPY: "CHFJPY", EUR_NOK: "EURNOK",
  EUR_SEK: "EURSEK", USD_SGD: "USDSGD", SGD_JPY: "SGDJPY", USD_NOK: "USDNOK",
  USD_SEK: "USDSEK", USD_ZAR: "USDZAR", USD_HKD: "USDHKD", ZAR_JPY: "ZARJPY",
  EUR_TRY: "EURTRY", USD_TRY: "USDTRY", EUR_HUF: "EURHUF", EUR_PLN: "EURPLN",
  USD_PLN: "USDPLN",
  XPT_USD: "XPTUSD", XPD_USD: "XPDUSD", XCU_USD: "XCUUSD",
  XAU_JPY: "XAUJPY", XAU_EUR: "XAUEUR", XAU_GBP: "XAUGBP", XAU_AUD: "XAUAUD",
  XAU_CAD: "XAUCAD", XAU_CHF: "XAUCHF", XAU_NZD: "XAUNZD", XAG_JPY: "XAGJPY",
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
    const configured = Boolean(token && accountId);
    const probe: {
      attempted: boolean;
      ok: boolean;
      httpStatus: number | null;
      oandaMessage: string | null;
    } = { attempted: configured, ok: false, httpStatus: null, oandaMessage: null };
    if (configured) {
      const base = restBase(env);
      try {
        const res = await fetch(
          `${base}/v3/accounts/${accountId}/pricing?instruments=EUR_USD,CAD_JPY,XAU_USD`,
          { headers: authHeaders(), cache: "no-store" }
        );
        probe.httpStatus = res.status;
        if (res.ok) {
          const data = await res.json();
          probe.ok = Array.isArray(data.prices) && data.prices.length > 0;
        } else {
          probe.oandaMessage = (await res.text().catch(() => "")).slice(0, 300);
        }
      } catch (e) {
        probe.oandaMessage = String(e);
      }
    }
    const prefix = configured ? String(accountId).split("-")[0] : "??";
    const accountEnvHint =
      prefix === "101" ? "practice" : prefix === "001" ? "live" : prefix ? "unknown" : null;
    return NextResponse.json({
      configured,
      env,
      label: "OANDA Live",
      accountEnvHint,
      envMismatch: Boolean(accountEnvHint && accountEnvHint !== env),
      probe
    });
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

    const toQuote = (p: any) => {
      const internal = TO_INTERNAL[p.instrument] ?? p.instrument;
      const bid = parseFloat(p.bids?.[0]?.price ?? "0");
      const ask = parseFloat(p.asks?.[0]?.price ?? "0");
      return { symbol: internal, bid, ask, last: (bid + ask) / 2, spread: ask - bid, timestamp: Date.now() };
    };

    // Happy path: one batched request. OANDA rejects the WHOLE batch with 400 if
    // even ONE requested instrument is not available on the account, which would
    // silently drop ALL prices. So on a batch failure we fall back to requesting
    // each instrument individually and keep the ones that succeed — this way the
    // app shows REAL OANDA prices for every instrument the account can serve,
    // and only truly-unsupported symbols fall through to the SIM fallback.
    for (const instruments of [requested.join(",")]) {
      try {
        const res = await fetch(`${base}/v3/accounts/${accountId}/pricing?instruments=${instruments}`, {
          headers: authHeaders(), cache: "no-store"
        });
        if (res.ok) {
          const data = await res.json();
          const quotes = (data.prices ?? []).map(toQuote);
          if (quotes.length) return NextResponse.json({ ok: true, quotes });
        }
      } catch { /* fall through to per-symbol */ }
    }

    // Per-symbol fallback: collect quotes for each instrument the account supports.
    const quotes = [];
    for (const instrument of requested) {
      try {
        const res = await fetch(`${base}/v3/accounts/${accountId}/pricing?instruments=${instrument}`, {
          headers: authHeaders(), cache: "no-store"
        });
        if (!res.ok) continue;
        const data = await res.json();
        const q = (data.prices ?? []).map(toQuote);
        quotes.push(...q);
      } catch { /* skip unsupported instrument */ }
    }
    return NextResponse.json({ ok: true, quotes });
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