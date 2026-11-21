/**
 * Quant performance metrics — pure, dependency-free math over a sequence of
 * realized R-multiples (one number per closed trade).
 *
 * R = (exit - entry) / risk, so +2 means "made two times the amount risked".
 * Using R instead of currency makes every symbol/step comparable and lets the
 * same metrics power the research runner, the analytics page and any future
 * walk-forward report.
 *
 * All functions are deterministic and guard the empty / degenerate cases
 * (single trade, zero variance, no losses) so callers never see NaN/Infinity
 * in a UI or report.
 */

export interface QuantMetrics {
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number; // 0..1
  netR: number;
  expectancyR: number; // average R per trade
  avgWinR: number;
  avgLossR: number;
  profitFactor: number; // gross win R / gross loss R; Infinity when no losses
  maxDrawdownR: number; // worst peak-to-trough on the cumulative R curve (positive)
  sharpe: number; // mean / stdev of per-trade R
  sharpeAnnualized: number; // sharpe * sqrt(tradesPerYear)
  sortino: number; // mean / downside deviation of per-trade R
  avgBarsHeld: number | null;
  longestWinStreak: number;
  longestLossStreak: number;
  equityCurve: number[]; // cumulative R after each trade
}

export interface QuantMetricsInput {
  /** realized R multiple per closed trade, in chronological order */
  r: number[];
  /** optional bars held per trade (parallel to r), used for avgBarsHeld */
  barsHeld?: number[];
  /** assumed trades per year for annualization (default 100) */
  tradesPerYear?: number;
}

const EPS = 1e-12;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs: number[], sample = true): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const ss = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return Math.sqrt(ss / (xs.length - (sample ? 1 : 0)));
}

/** Downside deviation relative to a 0 return target (Sortino denominator). */
function downsideDeviation(xs: number[]): number {
  if (!xs.length) return 0;
  const ss = xs.reduce((a, x) => a + Math.min(0, x) ** 2, 0);
  return Math.sqrt(ss / xs.length);
}

/** Largest peak-to-trough decline on the cumulative R equity curve (positive). */
export function maxDrawdown(equityCurve: number[]): number {
  let peak = 0;
  let worst = 0;
  for (const v of equityCurve) {
    peak = Math.max(peak, v);
    worst = Math.max(worst, peak - v);
  }
  return worst;
}

export function computeQuantMetrics(input: QuantMetricsInput): QuantMetrics {
  const rs = (input.r ?? []).filter((x) => Number.isFinite(x));
  const trades = rs.length;
  const wins = rs.filter((x) => x > EPS).length;
  const losses = rs.filter((x) => x < -EPS).length;
  const breakEven = trades - wins - losses;

  const grossWin = rs.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const grossLoss = Math.abs(rs.filter((x) => x < 0).reduce((a, x) => a + x, 0));

  const equityCurve: number[] = [];
  let running = 0;
  for (const x of rs) {
    running += x;
    equityCurve.push(running);
  }

  const sd = stdev(rs);
  const dd = downsideDeviation(rs);
  const m = mean(rs);
  const tpy = input.tradesPerYear && input.tradesPerYear > 0 ? input.tradesPerYear : 100;

  // A zero-variance series with a non-zero mean has an unbounded (infinite)
  // Sharpe/Sortino — report that honestly instead of collapsing it to 0.
  // A single sample has no variance estimate at all → report 0.
  const ratio = (denominator: number): number => {
    if (trades < 2) return 0;
    if (denominator <= EPS) return m > EPS ? Infinity : m < -EPS ? -Infinity : 0;
    return m / denominator;
  };
  const sharpe = ratio(sd);
  const sortino = ratio(dd);

  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let winStreak = 0;
  let lossStreak = 0;
  for (const x of rs) {
    if (x > EPS) {
      winStreak += 1;
      lossStreak = 0;
      longestWinStreak = Math.max(longestWinStreak, winStreak);
    } else if (x < -EPS) {
      lossStreak += 1;
      winStreak = 0;
      longestLossStreak = Math.max(longestLossStreak, lossStreak);
    } else {
      winStreak = 0;
      lossStreak = 0;
    }
  }

  const bars = input.barsHeld?.filter((x) => Number.isFinite(x)) ?? [];

  return {
    trades,
    wins,
    losses,
    breakEven,
    winRate: trades ? wins / trades : 0,
    netR: running,
    expectancyR: m,
    avgWinR: wins ? grossWin / wins : 0,
    avgLossR: losses ? -grossLoss / losses : 0,
    profitFactor: grossLoss > EPS ? grossWin / grossLoss : grossWin > EPS ? Infinity : 0,
    maxDrawdownR: maxDrawdown(equityCurve),
    sharpe,
    sharpeAnnualized: Number.isFinite(sharpe) ? sharpe * Math.sqrt(tpy) : sharpe,
    sortino,
    avgBarsHeld: bars.length ? mean(bars) : null,
    longestWinStreak,
    longestLossStreak,
    equityCurve
  };
}

/** Convert a settled signal history outcome into an R multiple.
 *  Won signals take their configured R:R; lost signals realize -1R (the stop). */
export function rFromOutcome(
  outcome: string,
  riskReward: number | undefined,
  type: string
): number {
  if (outcome === "won") {
    const rr = Number.isFinite(riskReward) && (riskReward ?? 0) > 0 ? (riskReward as number) : 1;
    // Swing targets TP2 in the engine; limits often fill at TP1 — both are
    // captured by the recorded R:R, so use it directly.
    return rr;
  }
  if (outcome === "lost" || outcome === "invalidated") return -1;
  void type;
  return 0;
}
