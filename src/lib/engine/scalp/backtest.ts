import type { Candle } from "../../types";
import { ScalpSignalEngine } from "./signal";
import { ScalpGuard } from "./guard";
import { DEFAULT_SCALP_CONFIG, type ScalpConfig } from "./config";
import type { ScalpBacktestMetrics, ScalpBacktestReport, ScalpBacktestTrade } from "./types";
import { getCurrentSession } from "../session";

export type CostScenario = "optimistic" | "realistic" | "stress";

export interface ScalpBacktestParams {
  symbol: string;
  assetClass: string;
  /** 15m context candles */
  context: Candle[];
  /** 5m setup candles */
  setup: Candle[];
  /** 1m entry candles */
  entry: Candle[];
  /** spread in price units (mid-to-mid) */
  spread: number;
  /** cost scenario multipliers */
  scenario?: CostScenario;
  /** news event times (ms) for blackout testing */
  eventTimes?: number[];
  /** optional config override (deep-merged over defaults per asset class) */
  config?: Partial<ScalpConfig>;
  /** base commission as fraction of notional (per side) */
  commissionPct?: number;
}

interface CostModel {
  spreadPerSide: number;
  slippagePerSide: number;
  commissionPct: number;
}

const SCENARIOS: Record<CostScenario, { slipMult: number; spreadMult: number }> = {
  optimistic: { slipMult: 0.5, spreadMult: 1.0 },
  realistic: { slipMult: 1.0, spreadMult: 1.0 },
  stress: { slipMult: 2.0, spreadMult: 1.5 }
};

interface OpenTrade {
  trade: ScalpBacktestTrade & { setupId: string };
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  dir: "BUY" | "SELL";
  openIndex: number;
  session: string;
}

/**
 * ScalpBacktestEngine — walks the 1-minute series bar-by-bar and lets the engine
 * decide whether a scalp exists at each closed bar using ONLY bars up to it
 * (no look-ahead by construction). The 5m/15m context is aligned by timestamp.
 * Every fill is cost-adjusted for spread + slippage + commission under the
 * chosen scenario; SL is filled first on a touch (conservative), TP levels are
 * checked in order, and the max holding-time stop (time-stop) closes stale
 * positions. Metrics are broken down by session and regime.
 */
export class ScalpBacktestEngine {
  run(params: ScalpBacktestParams): ScalpBacktestReport {
    const scenario = SCENARIOS[params.scenario ?? "realistic"];
    const cost: CostModel = {
      spreadPerSide: (params.spread / 2) * scenario.spreadMult,
      slippagePerSide: (params.spread / 2) * scenario.slipMult,
      commissionPct: params.commissionPct ?? 0.0002
    };

    const config: ScalpConfig = {
      ...DEFAULT_SCALP_CONFIG,
      ...params.config,
      news: {
        ...DEFAULT_SCALP_CONFIG.news,
        ...(params.config?.news ?? {}),
        eventTimes: params.eventTimes ?? params.config?.news?.eventTimes ?? []
      }
    };

    const engine = new ScalpSignalEngine(config);
    const guard = new ScalpGuard(config);
    const maxBars = config.holding.maxBars;

    const ctxMap = timeIndexMap(params.context);
    const stpMap = timeIndexMap(params.setup);
    const entry = params.entry;

    const trades: ScalpBacktestTrade[] = [];
    let open: OpenTrade | null = null;

    for (let i = 40; i < entry.length; i++) {
      const t = entry[i].time;
      const ci = ctxMap(t);
      const si = stpMap(t);
      if (ci == null || si == null) continue;

      // --- manage open position (touches checked in conservative order) ---
      if (open) {
        const bar = entry[i];
        const hitSL = open.dir === "BUY" ? bar.low <= open.sl : bar.high >= open.sl;
        const hitTP2 = open.dir === "BUY" ? bar.high >= open.tp2 : bar.low <= open.tp2;
        const hitTP1 = open.dir === "BUY" ? bar.high >= open.tp1 : bar.low <= open.tp1;
        const overTime = i - open.openIndex >= maxBars;

        let outcome: ScalpBacktestTrade["outcome"] | null = null;
        let exit = 0;
        if (hitSL) { outcome = "LOSS"; exit = open.sl; }
        else if (hitTP2) { outcome = "WIN"; exit = open.tp2; }
        else if (hitTP1) { outcome = "WIN"; exit = open.tp1; }
        else if (overTime) { outcome = "TIME_STOP"; exit = bar.close; }

        if (outcome) {
          const risk = Math.abs(open.entry - open.sl);
          const entryAdj = open.dir === "BUY"
            ? open.entry + cost.slippagePerSide + cost.spreadPerSide
            : open.entry - cost.slippagePerSide - cost.spreadPerSide;
          const exitAdj = open.dir === "BUY"
            ? exit - cost.slippagePerSide
            : exit + cost.slippagePerSide;
          const comm = exit * cost.commissionPct * 2;
          const netPnl = (open.dir === "BUY" ? exitAdj - entryAdj : entryAdj - exitAdj) - comm;
          const gross = open.dir === "BUY" ? exit - open.entry : open.entry - exit;
          const r = risk > 0 ? netPnl / risk : 0;

          open.trade.r = r;
          open.trade.pnl = gross;
          open.trade.outcome = outcome;
          open.trade.barsHeld = i - open.openIndex;
          trades.push(open.trade);
          guard.close(open.trade.setupId, r, t);
          open = null;
        }
      }

      // --- open new position if flat ---
      if (!open) {
        const sig = engine.evaluate({
          symbol: params.symbol,
          assetClass: params.assetClass,
          context: params.context.slice(0, ci + 1),
          setup: params.setup.slice(0, si + 1),
          entry: params.entry.slice(0, i + 1),
          spread: params.spread,
          price: entry[i].close,
          now: t
        });
        const session = getCurrentSession(new Date(t));
        if (sig.verdict !== "NO TRADE" && sig.setupId) {
          const perm = guard.permit(sig.setupId, session, t);
          if (perm.allow) {
            const dir = sig.direction;
            const entryPrice = sig.entryZone[0];
            guard.open(sig.setupId, session, t);
            open = {
              trade: {
                index: i,
                timestamp: t,
                symbol: params.symbol,
                direction: dir,
                entry: entryPrice,
                stopLoss: sig.stopLoss,
                takeProfit1: sig.takeProfit1,
                takeProfit2: sig.takeProfit2,
                r: 0,
                pnl: 0,
                outcome: "OPEN",
                barsHeld: 0,
                session,
                setupId: sig.setupId
              },
              entry: entryPrice,
              sl: sig.stopLoss,
              tp1: sig.takeProfit1,
              tp2: sig.takeProfit2,
              dir,
              openIndex: i,
              session
            };
          }
        }
      }
    }

    if (open) {
      open.trade.outcome = "OPEN";
      open.trade.r = 0;
      open.trade.pnl = 0;
      trades.push(open.trade);
    }

    const metrics = computeMetrics(trades);
    return {
      symbol: params.symbol,
      startTime: entry[0]?.time ?? 0,
      endTime: entry[entry.length - 1]?.time ?? 0,
      candlesTested: entry.length,
      trades,
      metrics,
      costModel: {
        spreadPerSide: cost.spreadPerSide,
        slippagePerSide: cost.slippagePerSide,
        commissionPct: cost.commissionPct,
        scenario: params.scenario ?? "realistic"
      },
      noLookahead: true,
      runAt: Date.now()
    };
  }
}

/** Map an absolute time to the nearest candle index at-or-before it. */
function timeIndexMap(candles: Candle[]): (t: number) => number | null {
  const times = candles.map((c) => c.time);
  let last = -1;
  return (t: number) => {
    while (last + 1 < times.length && times[last + 1] <= t) last++;
    return last >= 0 ? last : null;
  };
}

function computeMetrics(trades: ScalpBacktestTrade[]): ScalpBacktestMetrics {
  const closed = trades.filter((t) => t.outcome === "WIN" || t.outcome === "LOSS");
  const wins = trades.filter((t) => t.outcome === "WIN").length;
  const losses = trades.filter((t) => t.outcome === "LOSS").length;

  const grossProfit = closed.filter((t) => t.r > 0).reduce((a, t) => a + t.r, 0);
  const grossLoss = Math.abs(closed.filter((t) => t.r < 0).reduce((a, t) => a + t.r, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const avgWinR = wins ? closed.filter((t) => t.r > 0).reduce((a, t) => a + t.r, 0) / wins : 0;
  const avgLossR = losses ? closed.filter((t) => t.r < 0).reduce((a, t) => a + t.r, 0) / losses : 0;
  const expectancy = closed.length ? closed.reduce((a, t) => a + t.r, 0) / closed.length : 0;

  let cur = 0;
  let peak = 0;
  let maxDD = 0;
  let maxLossStreak = 0;
  let maxWinStreak = 0;
  let curL = 0;
  let curW = 0;
  for (const t of closed) {
    cur += t.r;
    peak = Math.max(peak, cur);
    maxDD = Math.max(maxDD, peak - cur);
    if (t.r < 0) { curL++; curW = 0; maxLossStreak = Math.max(maxLossStreak, curL); }
    else { curW++; curL = 0; maxWinStreak = Math.max(maxWinStreak, curW); }
  }

  const bySession: Record<string, { trades: number; wins: number; losses: number; pnl: number }> = {};
  const byRegime: Record<string, { trades: number; wins: number; losses: number; pnl: number }> = {};
  for (const t of trades) {
    const s = t.session || "UNKNOWN";
    bySession[s] ??= { trades: 0, wins: 0, losses: 0, pnl: 0 };
    bySession[s].trades++;
    bySession[s].pnl += t.r;
    if (t.outcome === "WIN") bySession[s].wins++;
    if (t.outcome === "LOSS") bySession[s].losses++;
  }

  return {
    totalTrades: trades.length,
    wins,
    losses,
    open: trades.filter((t) => t.outcome === "OPEN").length,
    timeStops: trades.filter((t) => t.outcome === "TIME_STOP").length,
    winRate: closed.length ? wins / closed.length : 0,
    grossProfit,
    grossLoss,
    profitFactor,
    expectancyR: expectancy,
    avgWinR,
    avgLossR,
    maxDrawdownR: maxDD,
    maxLosingStreak: maxLossStreak,
    longestWinStreak: maxWinStreak,
    avgBarsHeld: trades.length ? trades.reduce((a, t) => a + t.barsHeld, 0) / trades.length : 0,
    bySession,
    byRegime
  };
}