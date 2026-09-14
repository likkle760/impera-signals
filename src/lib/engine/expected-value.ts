/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPECTED VALUE (§15.6)
 *
 * Win rate in isolation is meaningless — a 95% hit-rate with a 1:0.2 reward:risk
 * loses money. Every emitted signal therefore also carries its EXPECTED VALUE in
 * R (reward:risk units), derived directly from the symbol's backtested win-rate:
 *
 *     EV(R) = winRate * rewardRisk - (1 - winRate) * 1
 *
 * A positive EV means the historical profile pays net of the cost of the losing
 * trades; a negative EV means it does not, no matter how high the stop-rate is.
 * EV is only attached to a signal when a backtested win-rate actually exists
 * (MIN_EV_SAMPLE closed trades) — never fabricated from the confidence score.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Minimum closed-trade sample before an expected-value is claimed. */
export const MIN_EV_SAMPLE = 10;

/**
 * Expected value of a trade in reward:risk (R) units from a historical hit-rate.
 * winRate is a fraction between 0..1; rewardRisk is win-size ÷ loss-size (e.g.
 * 1.8 for a 1:1.8 setup). Returns a signed R value (positive = +EV profile).
 */
export function expectedValueR(winRate: number, rewardRisk: number): number {
  if (!Number.isFinite(winRate) || !Number.isFinite(rewardRisk)) return NaN;
  if (winRate < 0 || winRate > 1) return NaN;
  return winRate * rewardRisk - (1 - winRate);
}

/** Rounded expected value (2dp) or undefined when it can't be claimed. */
export function expectedValueRounded(winRate: number, rewardRisk: number): number | undefined {
  const ev = expectedValueR(winRate, rewardRisk);
  if (!Number.isFinite(ev)) return undefined;
  return Number(ev.toFixed(2));
}