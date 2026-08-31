/**
 * Validation suite (§33–40).
 *
 * Tools to honestly answer "is this strategy validated?"
 *   §34 Walk-forward: train on a window, validate the very next window, roll
 *      forward. Never optimize the final out-of-sample set.
 *   §38 Monte Carlo: resample the realized trade sequence to estimate expected /
 *      worst-case drawdown, losing streak, risk of ruin, return distribution.
 *   §37 Parameter sensitivity: perturb each parameter across a broad range and
 *      flag parameters where small changes destroy performance (overfitting).
 *   §35/§39 Regime / pair / session / long-short breakdown of a backtest.
 *
 * Everything operates on trade R-values (already cost-adjusted by the caller),
 * so it is engine-agnostic and consistent with swing + scalp backtests.
 */
export interface TradeResult {
  /** realized R for the trade (signed) */
  r: number;
  /** optional label for breakdown (pair, session, regime, side) */
  labels?: Record<string, string>;
}

export interface WalkForwardWindow {
  start: number;
  end: number;
  /** R of the validation window when the barrier is crossed */
  testR: number;
  testTrades: number;
  testProfitFactor: number;
  winRate: number;
  /** whether the walk-forward keeps the parameter set (i.e. robust) */
  robust: boolean;
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  /** overall robustness: fraction of windows that stayed profitable out-of-sample */
  robustness: number;
  /** average out-of-sample profit factor */
  avgTestProfitFactor: number;
  totalTestTrades: number;
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
  note: string;
}

export interface MonteCarloResult {
  sims: number;
  expectedMaxDD: number;
  worstMaxDD: number;
  p95MaxDD: number;
  maxLosingStreak: number;
  p95LosingStreak: number;
  riskOfRuinPct: number;
  /** 5th percentile of final equity (worst-ish) using all simulated walks */
  final5Pct: number;
  /** distribution buckets of final cumulative R */
  finalDist: { bucket: string; count: number }[];
}

export interface SensitivityPoint {
  parameter: string;
  value: number;
  /** profit factor at this value (0 = unusable) */
  profitFactor: number;
  expectancy: number;
  trades: number;
}

export interface SensitivityResult {
  parameter: string;
  base: number;
  points: SensitivityPoint[];
  /** std-dev of profit factor across the range (high = sensitive) */
  stability: number;
  flagged: "STABLE" | "SENSITIVE" | "BRITTLE";
  note: string;
}

export class ValidationSuite {
  /** §34: walk-forward over R-sequences (already cost-adjusted). */
  walkForward(seq: number[], windowSize: number, minTrades = 20): WalkForwardResult {
    if (seq.length < windowSize * 2) {
      return { windows: [], robustness: 0, avgTestProfitFactor: 0, totalTestTrades: 0, verdict: "INCONCLUSIVE", note: "Not enough trades for walk-forward." };
    }
    const windows: WalkForwardWindow[] = [];
    let start = 0;
    let robustCount = 0;
    let testTradesTotal = 0;
    let pfSum = 0;
    while (start + windowSize * 2 <= seq.length) {
      // train on [start, start+window), validate the next window
      const train = seq.slice(start, start + windowSize);
      const test = seq.slice(start + windowSize, start + windowSize * 2);
      const testR = test.reduce((a, b) => a + b, 0);
      const { pf, winRate } = ratio(test);
      const robust = pf >= 1.0 && testR > 0;
      if (robust) robustCount++;
      windows.push({
        start, end: start + windowSize * 2,
        testR, testTrades: test.length,
        testProfitFactor: pf,
        winRate,
        robust
      });
      testTradesTotal += test.length;
      pfSum += pf;
      start += windowSize; // roll forward (non-overlapping OOS)
    }
    const robustness = windows.length ? robustCount / windows.length : 0;
    const avgTestProfitFactor = windows.length ? pfSum / windows.length : 0;
    const verdict = robustness >= 0.6 && avgTestProfitFactor >= 1.05
      ? "PASS"
      : windows.length === 0 ? "INCONCLUSIVE" : "FAIL";
    return {
      windows, robustness, avgTestProfitFactor,
      totalTestTrades: testTradesTotal,
      verdict,
      note: verdict === "PASS"
        ? `${(robustness * 100).toFixed(0)}% of out-of-sample windows profitable (avg PF ${avgTestProfitFactor.toFixed(2)}).`
        : verdict === "FAIL"
          ? `Strategy degraded out-of-sample (robustness ${(robustness * 100).toFixed(0)}%, avg PF ${avgTestProfitFactor.toFixed(2)}). DO NOT go live.`
          : "Insufficient data to judge robustness."
    };
  }

  /** §38: Monte Carlo bootstrap of the realized trade sequence. */
  monteCarlo(seq: number[], sims = 2000, ruinAtR = -10): MonteCarloResult {
    const finals: number[] = [];
    let ruining = 0;
    let worstMaxDD = Infinity;
    let worstStreak = 0;
    const maxima: number[] = [];

    for (let s = 0; s < sims; s++) {
      let eq = 0;
      let peak = 0;
      let maxDD = 0;
      let streak = 0;
      let ruined = false;
      for (let i = 0; i < seq.length; i++) {
        const r = seq[Math.floor(Math.random() * seq.length)];
        eq += r;
        peak = Math.max(peak, eq);
        maxDD = Math.max(maxDD, peak - eq);
        if (r < 0) { streak++; worstStreak = Math.max(worstStreak, streak); }
        else streak = 0;
        if (eq <= ruinAtR) ruined = true;
      }
      finals.push(eq);
      maxima.push(maxDD);
      worstMaxDD = Math.min(worstMaxDD, maxDD);
      if (ruined) ruining++;
    }

    const riskOfRuin = (ruining / sims) * 100;
    const p95DDs = [...maxima].sort((a, b) => a - b);
    finals.sort((a, b) => a - b);
    const p95MaxDD = p95DDs[Math.floor(p95DDs.length * 0.05)] ?? 0;
    const expectedMaxDD = mean(maxima);
    const final5Pct = finals[Math.floor(finals.length * 0.05)] ?? 0;

    const minF = finals[0];
    const maxF = finals[finals.length - 1];
    const step = Math.max(1e-9, (maxF - minF) / 8);
    const buckets: Record<string, number> = {};
    for (const f of finals) {
      const idx = Math.min(7, Math.max(0, Math.floor((f - minF) / (step || 1))));
      const key = `+${(minF + idx * step).toFixed(0)}R`;
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    const finalDist = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));

    return {
      sims, expectedMaxDD, worstMaxDD, p95MaxDD,
      maxLosingStreak: worstStreak, p95LosingStreak: worstStreak,
      riskOfRuinPct: riskOfRuin, final5Pct, finalDist
    };
  }

  /** §37: parameter sensitivity — perturb a parameter and measure PF stability. */
  sensitivity(label: string, base: number, points: number[], measure: (param: number) => { pf: number; expectancy: number; trades: number }): SensitivityResult {
    const out: SensitivityPoint[] = points.map((p) => {
      const m = measure(p);
      return { parameter: label, value: p, profitFactor: m.pf, expectancy: m.expectancy, trades: m.trades };
    });
    const pfs = out.map((o) => o.profitFactor).filter((p) => Number.isFinite(p) && p > 0);
    const stability = pfs.length ? stdDev(pfs) : Infinity;
    const flagged = stability > 0.5 ? "BRITTLE" : stability > 0.25 ? "SENSITIVE" : "STABLE";
    const note = flagged === "BRITTLE"
      ? `${label}: PF swings sharply across the range (σ ${stability.toFixed(2)}) — POSSIBLE OVERFITTING.`
      : flagged === "SENSITIVE"
        ? `${label}: moderately parameter-sensitive (σ ${stability.toFixed(2)}); keep within a robust band.`
        : `${label}: robust across the tested range (σ ${stability.toFixed(2)}).`;
    return { parameter: label, base, points: out, stability, flagged, note };
  }

  /** §35/§39: breakdown a trade set by labels (pair, session, regime, side). */
  breakdownBy(trades: TradeResult[], label: string): Array<{ key: string; trades: number; r: number; pf: number; winRate: number }> {
    const map = new Map<string, number[]>();
    for (const t of trades) {
      const key = t.labels?.[label] ?? "UNLABELED";
      const arr = map.get(key) ?? [];
      arr.push(t.r);
      map.set(key, arr);
    }
    return [...map.entries()].map(([key, rs]) => {
      const pf = ratio(rs).pf;
      return { key, trades: rs.length, r: rs.reduce((a, b) => a + b, 0), pf, winRate: ratio(rs).winRate };
    }).sort((a, b) => b.r - a.r);
  }
}

function ratio(rs: number[]): { pf: number; winRate: number } {
  let g = 0;
  let l = 0;
  let w = 0;
  for (const r of rs) {
    if (r > 0) { g += r; w++; }
    else if (r < 0) l += -r;
  }
  return { pf: l > 0 ? g / l : g > 0 ? Infinity : 0, winRate: rs.length ? w / rs.length : 0 };
}
function mean(a: number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}
function stdDev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1));
}