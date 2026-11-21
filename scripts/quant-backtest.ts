/**
 * Headless quant research runner.
 *
 *   npm run quant:backtest                          # default symbols, historical feed
 *   npm run quant:backtest -- XAUUSD,EURUSD         # explicit symbols
 *   npm run quant:backtest -- --synthetic           # deterministic oscillating validation data
 *   npm run quant:backtest -- --json                # machine-readable report
 *
 * WHAT THIS IS: a research harness that runs the production BacktestEngine
 * (no-lookahead by construction — a hook only ever sees candles[0..i]) over
 * historical candles in sequential walk-forward folds, then reports quant
 * performance: win rate, expectancy (R), profit factor, max drawdown,
 * Sharpe/Sortino and an equity curve.
 *
 * The strategy hook is a simple, explicit RSI(14) mean-reversion rule defined
 * below. It is a RESEARCH strategy used to exercise and validate the metrics
 * pipeline — it is NOT the live Impera signal engine, and the default DEMO
 * feed is synthetic. Neither is a claim about real-market profitability.
 */
import { DemoMarketDataProvider } from "../src/lib/providers/demo";
import { BacktestEngine, type SignalHook } from "../src/lib/engine/strategy/backtest-engine";
import type { BacktestReport, BacktestTrade } from "../src/lib/engine/strategy/types";
import { computeQuantMetrics } from "../src/lib/quant/metrics";
import type { Candle, Direction } from "../src/lib/types";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const syntheticMode = args.includes("--synthetic");
const positional = args.filter((a) => !a.startsWith("--"));

const DEFAULT_SYMBOLS = ["XAUUSD", "XAUGBP", "XAUCAD", "EURUSD", "GBPUSD", "USDJPY"];
const symbols = (positional[0] ?? "").split(",").filter(Boolean).length
  ? (positional[0] ?? "").split(",").map((s) => s.trim().toUpperCase())
  : DEFAULT_SYMBOLS;

const BARS = 3000; // 1H candles per symbol
const FOLDS = 4; // sequential walk-forward segments
const RSI_PERIOD = 14;
const ENTRY_COOLDOWN = 12; // bars between entries (prevents overtrading)
const TF = "1h" as const;

/** Simple non-smoothed RSI over the last `period` deltas (no lookahead). */
function rsi(closes: number[], period = RSI_PERIOD): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let k = closes.length - period; k < closes.length; k++) {
    const d = closes[k] - closes[k - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/** Research strategy hook: buy RSI pullbacks in an uptrend, sell rallies in a
 *  downtrend (trend-following), with an entry cooldown. No lookahead. */
function researchHook(symbol: string): SignalHook {
  let lastEntry = -Infinity;
  const emaPeriod = 50;
  return {
    symbol,
    timeframe: TF,
    emit(candles: Candle[], i: number) {
      if (i < emaPeriod + 40 || i - lastEntry < ENTRY_COOLDOWN) return null;
      const closes = candles.slice(0, i + 1).map((c) => c.close);
      const value = rsi(closes);
      if (value == null) return null;
      // EMA over closes up to i (no future bars).
      const k = 2 / (emaPeriod + 1);
      let ema = closes[0];
      for (let x = 1; x < closes.length; x++) ema = closes[x] * k + ema * (1 - k);
      const price = closes[closes.length - 1];
      let direction: Direction | null = null;
      if (price > ema && value <= 45) direction = "BUY"; // uptrend pullback
      else if (price < ema && value >= 55) direction = "SELL"; // downtrend rally
      if (!direction) return null;
      lastEntry = i;
      return {
        draft: {
          direction,
          type: direction === "BUY" ? "MARKET BUY" : "MARKET SELL",
          confluence: Math.round(Math.min(95, 50 + Math.abs(value - 50))),
          reasons: [`research trend-pullback: price ${price > ema ? ">" : "<"} EMA${emaPeriod}, RSI(${RSI_PERIOD})=${value.toFixed(1)}`]
        },
        entry: price
      };
    }
  };
}

/** Deterministic trending series with pullbacks + noise (validation only).
 *  Phase offset per symbol so runs are not identical. */
function makeOscillating(n: number, start: number, phase: number): Candle[] {
  let price = start;
  const out: Candle[] = [];
  const stepMs = 3_600_000;
  for (let i = 0; i < n; i++) {
    const t = i + phase;
    const wave = Math.sin(t / 9) * 4 + Math.sin(t / 31) * 6;
    const noise = Math.sin(t * 2.7) * 0.8;
    const open = price;
    const close = Math.max(1, price + wave * 0.35 + noise + 0.06);
    const high = Math.max(open, close) + Math.abs(noise) + 0.5;
    const low = Math.min(open, close) - Math.abs(noise) - 0.5;
    out.push({ time: i * stepMs, open, high, low, close, volume: 1000 });
    price = close;
  }
  return out;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

interface FoldReport {
  symbol: string;
  fold: number;
  from: string;
  to: string;
  report: BacktestReport;
}

const CLOSED = (t: BacktestTrade) => t.outcome === "WIN" || t.outcome === "LOSS";
const toR = (ts: BacktestTrade[]) => ts.filter(CLOSED).map((t) => t.r);

async function main() {
  const provider = new DemoMarketDataProvider();
  const engine = new BacktestEngine();
  const folds: FoldReport[] = [];
  const dataLabel = syntheticMode ? "SYNTHETIC_OSCILLATING_VALIDATION" : "DEMO_HISTORICAL_1H";

  for (let si = 0; si < symbols.length; si++) {
    const symbol = symbols[si];
    const candles = syntheticMode
      ? makeOscillating(BARS, 100 + si * 5, si * 137)
      : await provider.getHistoricalCandles(symbol, TF, BARS);
    if (candles.length < BARS - 50) {
      console.error(`[skip] ${symbol}: insufficient history (${candles.length} bars)`);
      continue;
    }

    const foldSize = Math.floor(candles.length / FOLDS);
    for (let f = 0; f < FOLDS; f++) {
      const slice = candles.slice(f * foldSize, f === FOLDS - 1 ? candles.length : (f + 1) * foldSize);
      const { report } = engine.run(symbol, TF, slice, researchHook(symbol));
      folds.push({
        symbol,
        fold: f + 1,
        from: iso(slice[0].time),
        to: iso(slice[slice.length - 1].time),
        report
      });
    }
  }

  const closedTrades = folds.flatMap((f) => f.report.trades.filter(CLOSED));
  const metrics = computeQuantMetrics({
    r: closedTrades.map((t) => t.r),
    tradesPerYear: 252
  });

  const foldMetrics = folds.map((f) => ({
    ...f,
    metrics: computeQuantMetrics({ r: toR(f.report.trades), tradesPerYear: 63 })
  }));

  if (jsonMode) {
    process.stdout.write(JSON.stringify({
      generatedAt: new Date().toISOString(),
      data: dataLabel,
      strategy: "research RSI(14) trend-pullback (NOT the live signal engine)",
      symbols,
      engine: "BacktestEngine",
      noLookahead: folds.every((f) => f.report.noLookahead),
      trades: metrics.trades,
      metrics,
      equityCurve: metrics.equityCurve,
      walkForwardFolds: foldMetrics.map((f) => ({
        symbol: f.symbol, fold: f.fold, from: f.from, to: f.to,
        trades: f.metrics.trades, winRate: f.metrics.winRate,
        expectancyR: f.metrics.expectancyR, profitFactor: f.metrics.profitFactor,
        maxDrawdownR: f.metrics.maxDrawdownR, sharpe: f.metrics.sharpe
      })),
      perSymbol: symbols.map((sym) => {
        const m = computeQuantMetrics({ r: foldMetrics.filter((f) => f.symbol === sym).flatMap((f) => toR(f.report.trades)) });
        return { symbol: sym, trades: m.trades, winRate: m.winRate, expectancyR: m.expectancyR, profitFactor: m.profitFactor, maxDrawdownR: m.maxDrawdownR, sharpe: m.sharpe };
      })
    }, null, 2) + "\n");
    return;
  }

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fin = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "∞");
  console.log("\n=== IMPERA QUANT RESEARCH — WALK-FORWARD ===");
  console.log(`symbols: ${symbols.join(", ")}`);
  console.log(`data: ${dataLabel}  |  engine: BacktestEngine (no lookahead)`);
  console.log("strategy: research RSI(14) trend-pullback (NOT the live signal engine)");
  if (syntheticMode) console.log("NOTE: deterministic VALIDATION data — exercises the metrics pipeline, NOT real-market performance.");
  console.log("--- aggregate quant metrics ---");
  console.log(`closed trades: ${metrics.trades}  (${metrics.wins}W / ${metrics.losses}L / ${metrics.breakEven}BE)`);
  console.log(`win rate:      ${pct(metrics.winRate)}`);
  console.log(`expectancy:    ${fin(metrics.expectancyR)}R per trade  |  net ${fin(metrics.netR)}R`);
  console.log(`profit factor: ${fin(metrics.profitFactor)}`);
  console.log(`max drawdown:  ${fin(metrics.maxDrawdownR)}R`);
  console.log(`sharpe:        ${fin(metrics.sharpe)} (ann. ${fin(metrics.sharpeAnnualized)})  |  sortino ${fin(metrics.sortino)}`);
  console.log(`avg hold:      ${metrics.avgBarsHeld == null ? "n/a" : fin(metrics.avgBarsHeld, 1)} bars  |  win/loss streak ${metrics.longestWinStreak}/${metrics.longestLossStreak}`);
  console.log("--- walk-forward folds ---");
  for (const f of foldMetrics) {
    console.log(`${f.symbol.padEnd(8)} fold ${f.fold}  ${f.from} → ${f.to}  trades ${String(f.metrics.trades).padStart(3)}  win ${pct(f.metrics.winRate).padStart(6)}  exp ${fin(f.metrics.expectancyR).padStart(6)}R  PF ${fin(f.metrics.profitFactor).padStart(6)}`);
  }
  console.log("--- per symbol ---");
  for (const sym of symbols) {
    const m = computeQuantMetrics({ r: foldMetrics.filter((f) => f.symbol === sym).flatMap((f) => toR(f.report.trades)) });
    console.log(`${sym.padEnd(8)} trades ${String(m.trades).padStart(4)}  win ${pct(m.winRate).padStart(6)}  exp ${fin(m.expectancyR).padStart(6)}R  PF ${fin(m.profitFactor).padStart(6)}  DD ${fin(m.maxDrawdownR).padStart(6)}R  SR ${fin(m.sharpe)}`);
  }
  console.log("--- integrity ---");
  console.log(`no-lookahead enforced in all ${folds.length} folds: ${folds.every((f) => f.report.noLookahead) ? "YES" : "NO"}`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
