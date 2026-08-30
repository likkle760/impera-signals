import type { Signal } from "../analysis-types";
import type { BacktestReport, SignalReport } from "./types";

export interface ReporterInput {
  signals: Signal[];
  backtests: BacktestReport[];
}

/**
 * SignalReporter — aggregates the current scan + backtests into a concise,
 * numbers-first report used by the UI and the audit logger. It never asserts
 * guaranteed accuracy; it reports observed frequencies and statistics.
 */
export class SignalReporter {
  buildSignalsReport(signals: Signal[]): SignalReport {
    const byReason = new Map<string, number>();
    for (const s of signals) {
      for (const r of (s.reason || "").split(",").map((x) => x.trim()).filter(Boolean)) {
        byReason.set(r, (byReason.get(r) ?? 0) + 1);
      }
    }
    const topReasons = [...byReason.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([reason, count]) => ({ reason, count }));

    const setups = signals.length;
    const activeSignals = signals.filter((s) => !s.type.includes("LIMIT")).length;
    const waitingLimits = signals.filter((s) => s.type.includes("LIMIT")).length;
    const averageScore = setups
      ? Math.round(signals.reduce((a, s) => a + (s.confidence ?? 0), 0) / setups)
      : 0;
    const buyCount = signals.filter((s) => s.direction === "BUY").length;
    const sellCount = signals.filter((s) => s.direction === "SELL").length;

    return {
      id: `sr-${Date.now()}`,
      symbol: "ALL",
      generatedAt: Date.now(),
      setups,
      activeSignals,
      waitingLimits,
      averageScore,
      buyCount,
      sellCount,
      topReasons
    };
  }

  /**
   * Plain-language caveat statement attached to any report. Required wording
   * guards against describing the strategy as guaranteed/sniper-accurate.
   */
  disclaimer(): string {
    return "Model results are historical probability estimates, not guarantees. No strategy is 100% accurate or no-loss. Trade live only after backtesting and paper trading verification.";
  }

  summarizeBacktest(r: BacktestReport): string {
    const pf = isFinite(r.profitFactor) ? r.profitFactor.toFixed(2) : "∞";
    return [
      `Backtest ${r.symbol} ${r.timeframe}: ${r.candlesTested} bars, ${r.trades.length} trades,`,
      `win rate ${(r.winRate * 100).toFixed(1)}%, net PnL ${r.netPnl.toFixed(2)}, profit factor ${pf}, avgR ${r.avgR.toFixed(2)}`
    ].join(" ");
  }
}
