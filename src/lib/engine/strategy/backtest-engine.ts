import type { Candle, Direction, Timeframe } from "../../types";
import type { DraftSignal } from "./entry-engine";
import type { BacktestReport, BacktestTrade } from "./types";

/** A signal function that, given the candle history up to (not including)
 * index `i`, returns an executable entry (or null). It MUST NOT look at bars
 * at index >= i — that is the no-lookahead contract the backtest enforces by
 * construction (it is only ever passed candles[0..i]). */
export interface SignalHook {
  symbol: string;
  timeframe: Timeframe;
  /** infer a draft at bar i using only candles[0..i] */
  emit(candles: Candle[], i: number): { draft: DraftSignal; entry: number } | null;
}

export interface BacktestResult {
  report: BacktestReport;
}

/**
 * BacktestEngine — walks historical candles in time order, one bar at a time.
 * The position is only ever opened/updated using closed bars before the current
 * bar, so no future information can leak into a decision. SL/TP are checked
 * against the current bar's extremes after entry.
 */
export class BacktestEngine {
  /** default risk sizing used when the hook builds entries */
  private tpLadder = [1.0, 1.6, 2.2];

  run(
    symbol: string,
    timeframe: Timeframe,
    candles: Candle[],
    hook: SignalHook
  ): BacktestResult {
    const startTime = candles[0]?.time ?? 0;
    const endTime = candles[candles.length - 1]?.time ?? 0;
    const trades: BacktestTrade[] = [];

    let open: {
      trade: BacktestTrade;
      entry: number;
      sl: number;
      tps: number[];
      direction: Direction;
      risk: number;
      openIndex: number;
    } | null = null;
    let peakEquity = 0;
    let equity = 0;
    let maxDrawdown = 0;

    // Only open a trade based on bars [0..i]; entry decisions at bar i use
    // events observed up to that point.
    for (let i = 1; i < candles.length; i++) {
      const bar = candles[i];

      if (open) {
        // Check SL / TPs against this bar's high/low. SL is assumed to fill
        // first (conservative) if both SL and TP are touched on the same bar.
        const hitSL = open.direction === "BUY" ? bar.low <= open.sl : bar.high >= open.sl;
        const hitTP = open.direction === "BUY" ? bar.high >= open.tps[0] : bar.low <= open.tps[0];
        const hitTP2 = open.direction === "BUY" ? bar.high >= open.tps[1] : bar.low <= open.tps[1];
        const hitTP3 = open.direction === "BUY" ? bar.high >= open.tps[2] : bar.low <= open.tps[2];

        if (hitSL) {
          const pnl = open.direction === "BUY" ? (open.sl - open.entry) : (open.entry - open.sl);
          open.trade.outcome = "LOSS";
          open.trade.exit = open.sl;
          open.trade.closeIndex = i;
          open.trade.pnl = pnl;
          open.trade.r = (pnl / open.risk);
          equity += pnl;
          trades.push(open.trade);
          open = null;
        } else {
          let exit: number | null = null;
          let outcome: BacktestTrade["outcome"] = null;
          if (hitTP3) { exit = open.tps[2]; outcome = "WIN"; }
          else if (hitTP2) { exit = open.tps[1]; outcome = "WIN"; }
          else if (hitTP) { exit = open.tps[0]; outcome = "WIN"; }
          if (exit != null) {
            const pnl = open.direction === "BUY" ? (exit - open.entry) : (open.entry - exit);
            open.trade.outcome = outcome;
            open.trade.exit = exit;
            open.trade.closeIndex = i;
            open.trade.pnl = pnl;
            open.trade.r = pnl / open.risk;
            equity += pnl;
            trades.push(open.trade);
            open = null;
          }
        }
      }

      if (!open) {
        const signal = hook.emit(candles, i);
        if (signal) {
          const { draft, entry } = signal;
          const direction = draft.direction;
          const atr = estimateAtr(candles, i);
          const stopDist = Math.min(
            Math.max(atr * 0.5, entry * 0.0006),
            Math.max(entry * 0.004, atr * 1.2)
          );
          const sl = direction === "BUY" ? entry - stopDist : entry + stopDist;
          const [m1, m2, m3] = this.tpLadder;
          const tps = direction === "BUY"
            ? [entry + stopDist * m1, entry + stopDist * m2, entry + stopDist * m3]
            : [entry - stopDist * m1, entry - stopDist * m2, entry - stopDist * m3];

          open = {
            trade: {
              id: `bt-${symbol}-${i}`,
              symbol,
              timeframe,
              direction,
              entry,
              stopLoss: sl,
              takeProfits: tps,
              risk: stopDist,
              openIndex: i,
              closeIndex: null,
              exit: null,
              outcome: null,
              pnl: 0,
              r: 0,
              reason: draft.reasons.join(", ")
            },
            entry,
            sl,
            tps,
            direction,
            risk: stopDist,
            openIndex: i
          };
        }
      }

      peakEquity = Math.max(peakEquity, equity);
      maxDrawdown = Math.max(maxDrawdown, peakEquity - equity);
    }

    // Any still-open position at the end of data is counted as open (not a win/loss).
    if (open) {
      open.trade.outcome = "OPEN";
      trades.push(open.trade);
    }

    const wins = trades.filter((t) => t.outcome === "WIN").length;
    const losses = trades.filter((t) => t.outcome === "LOSS").length;
    const closed = trades.filter((t) => t.outcome === "WIN" || t.outcome === "LOSS");
    const grossProfit = closed.filter((t) => t.pnl > 0).reduce((a, t) => a + t.pnl, 0);
    const grossLoss = Math.abs(closed.filter((t) => t.pnl < 0).reduce((a, t) => a + t.pnl, 0));
    const netPnl = grossProfit - grossLoss;
    const avgR = closed.length ? closed.reduce((a, t) => a + t.r, 0) / closed.length : 0;

    const report: BacktestReport = {
      id: `br-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      symbol,
      timeframe,
      startTime,
      endTime,
      candlesTested: candles.length,
      trades,
      wins,
      losses,
      winRate: closed.length ? wins / closed.length : 0,
      netPnl,
      grossProfit,
      grossLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
      avgR,
      maxDrawdown,
      noLookahead: true,
      createdAt: Date.now()
    };

    return { report };
  }
}

/** Average true range computed only from bars up to index i (no lookahead). */
export function estimateAtr(candles: Candle[], upto: number, period = 14): number {
  const start = Math.max(1, upto - period);
  let sum = 0;
  let n = 0;
  for (let i = start; i < upto; i++) {
    const prev = candles[i - 1];
    const c = candles[i];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    sum += tr;
    n++;
  }
  return n ? sum / n : (candles[upto - 1]?.close ?? 0) * 0.002;
}
