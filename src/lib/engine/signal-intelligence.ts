import type { Candle, Direction, Timeframe } from "../types";
import type { InstrumentAnalysis, Signal } from "./analysis-types";
import { BacktestEngine } from "./strategy/backtest-engine";
import { newsAdjustment, newsContext, NewsContext } from "./news";

export interface WinRateInfo {
  symbol: string;
  timeframe: Timeframe;
  trades: number;
  wins: number;
  losses: number;
  /** Fraction of closed trades that hit TP1 ("win"), 0..1. Never a guarantee. */
  winRate: number;
  netR: number;
}

export interface SignalIntelligence {
  winRate: WinRateInfo | null;
  news: NewsContext;
  /** Combined confidence: confluence score + news tilt, clamped 0..100. */
  confidence: number;
  /** Human-readable live verdict for the trader. */
  verdict: string;
}

const bt = new BacktestEngine();

function estimateAtrLocal(candles: Candle[], upto: number, period = 20): number {
  const start = Math.max(1, upto - period);
  let sum = 0;
  let n = 0;
  for (let i = start; i < upto; i++) {
    const prev = candles[i - 1];
    const c = candles[i];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    sum += tr;
    n++;
  }
  return n ? sum / n : (candles[upto - 1]?.close ?? 0) * 0.002;
}

/**
 * Estimate historical win-rate for a symbol by walking its cached candles with a
 * simple 5m trend-following hook (no lookahead). Uses only bars already held in
 * memory, so it is cheap and safe to call per scan.
 */
export function estimateWinRate(symbol: string, candles: Candle[]): WinRateInfo | null {
  if (!candles || candles.length < 60) return null;
  const ema = (values: number[], p: number) => {
    const out = new Array(values.length).fill(NaN);
    if (!values.length) return out;
    const k = 2 / (p + 1);
    let e = values[0];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (Number.isFinite(v)) {
        e = i === 0 ? v : v * k + e * (1 - k);
      }
      out[i] = e;
    }
    return out;
  };
  const closes = candles.map((c) => c.close);
  const fast = ema(closes, 8);
  const slow = ema(closes, 21);
  const lt = ema(closes, 50); // long-term trend conformance filter

  const { report } = bt.run(symbol, "5m", candles, {
    symbol,
    timeframe: "5m",
    emit: (bars, i) => {
      if (i < 30) return null;
      const prev = bars[i - 1];
      const f = fast[bars.length - 1];
      const s = slow[bars.length - 1];
      const l = lt[bars.length - 1];
      const fPrev = fast[bars.length - 2];
      const sPrev = slow[bars.length - 2];
      if (![f, s, l, fPrev, sPrev].every((x) => Number.isFinite(x))) return null;
      let dir: Direction | null = null;
      // Only take the trend side: BUY when LT is up + fast crosses above slow;
      // SELL when LT is down + fast crosses below slow. Counter-trend noise and
      // chop are filtered out, mirroring how the live engine trades.
      if (f >= s && fPrev <= sPrev && prev.close >= l) dir = "BUY";
      else if (f <= s && fPrev >= sPrev && prev.close <= l) dir = "SELL";
      if (!dir) return null;
      const atr = estimateAtrLocal(bars, i);
      const entry = prev.close;
        return {
          draft: {
            direction: dir,
            type: dir === "BUY" ? ("MARKET BUY" as const) : ("MARKET SELL" as const),
            confluence: 4,
            reasons: ["backtest-winrate-estimate"]
          },
          entry
        };
    }
  });

  const closed = report.trades.filter((t) => t.outcome === "WIN" || t.outcome === "LOSS");
  if (!closed.length) return null;
  const wins = closed.filter((t) => t.outcome === "WIN").length;
  const losses = closed.filter((t) => t.outcome === "LOSS").length;
  const netR = closed.reduce((a, t) => a + (t.r ?? 0), 0);
  return {
    symbol,
    timeframe: "5m",
    trades: closed.length,
    wins,
    losses,
    winRate: wins / closed.length,
    netR
  };
}

/**
 * Enrich a live signal with previous-trend/historical win-rate info and pending
 * high-impact news, returning a decision-grade confidence.
 */
export function evaluateSignal(signal: Signal, analysis: InstrumentAnalysis, candles: Candle[]): SignalIntelligence {
  const baseConfidence = Number.isFinite(signal.confidence) ? signal.confidence : 50;
  const news = newsContext(signal.symbol, signal.direction);
  const newsAdj = newsAdjustment(news, signal.direction);

  const winRate = estimateWinRate(signal.symbol, candles);
  let wrAdj = 0;
  let verdict: string;
  if (winRate) {
    // Blend historical win-rate into confidence. Confident drawdown — need at
    // least a handful of trades, but a genuinely strong track record shifts the
    // final confidence meaningfully (target: only surface signals that have
    // historically won ~80% of the time).
    const trades = winRate.trades;
    const conf = trades >= 40 ? 1.0 : trades >= 20 ? 0.8 : trades >= 10 ? 0.6 : 0.4;
    const raw = (winRate.winRate - 0.5) * 18;
    wrAdj = Math.round(Math.max(-12, Math.min(12, raw)) * conf);
    verdict = `Live win-rate ${(winRate.winRate * 100).toFixed(0)}% over ${winRate.trades} backtested ${winRate.symbol} trades.`;
  } else {
    verdict = "Backtest history unavailable for this symbol yet.";
  }
  if (news.hasEvent) {
    verdict += ` ${news.event} (${news.minutesUntil < 1 ? "imminent" : `in ~${news.minutesUntil}m`})${news.precaution ? " — " + news.precaution : ""}.`;
  }

  const confidence = Math.max(0, Math.min(100, Math.round(baseConfidence + newsAdj + wrAdj)));
  return { winRate, news, confidence, verdict };
}
