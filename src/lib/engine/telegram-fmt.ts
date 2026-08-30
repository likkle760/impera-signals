import type { Signal } from "../engine/analysis-types";
import { fmtPips, pipsBetween, pipsGained, pipsToTargets, pipSizeFor } from "./pips";

/**
 * Plain, human-readable signal card for Telegram. Kept deliberately simple:
 * no clutter, clear sections, left-aligned prices so it scans well on mobile.
 * Uses HTML entities sparingly for bold/labels only.
 */
function round(n: number, baseDecimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  let d = baseDecimals;
  if (Math.abs(n) >= 100) d = Math.min(Math.max(baseDecimals, 1), 2);
  if (Math.abs(n) < 1) d += 2;
  const s = n.toFixed(Math.min(d, 8));
  return s.replace(/\.?0+$/, "");
}

function zone([lo, hi]: [number, number]): string {
  return `${round(lo)} - ${round(hi)}`;
}

export function formatSignalMessage(sig: Signal, mode: "NEW" | "PAPER" = "NEW"): string {
  const ln: string[] = [];

  // Header — direction spelled out (LONG/SHORT) so it's unmissable
  const isLong = sig.direction === "BUY";
  ln.push(`───────────────`);
  ln.push(`  ${isLong ? "🟢 LONG" : "🔴 SHORT"}   ${sig.symbol}  ${sig.type}`);
  ln.push(`───────────────`);
  ln.push(``);

  // Entry / SL / TP
  ln.push(`Entry   : ${round(sig.entry)}  (zone ${zone(sig.entryZone)})`);
  const pipSize = pipSizeFor(sig.symbol);
  const stopPips = pipsBetween(sig.entry, sig.stopLoss, pipSize);
  ln.push(`Stop    : ${round(sig.stopLoss)}  (${stopPips.toFixed(1)}p risk)`);
  const pips = pipsToTargets(sig);
  ln.push(`Target 1: ${round(sig.takeProfits[0])}  (${pips[0].toFixed(1)}p)`);
  ln.push(`Target 2: ${round(sig.takeProfits[1])}  (${pips[1].toFixed(1)}p)`);
  ln.push(`Target 3: ${round(sig.takeProfits[2])}  (${pips[2].toFixed(1)}p)`);
  ln.push(``);

  // Quality / context
  ln.push(`Confidence : ${sig.confidence}%   R:R ${sig.riskReward}`);
  ln.push(`Risk level : ${sig.riskLevel} (score ${sig.riskScore})`);
  ln.push(`Setup      : ${sig.setupName || "—"}`);
  ln.push(`Bias       : ${sig.trendLabel} (${sig.timeframes.join("/")})`);
  ln.push(`Session    : ${sig.session || "—"}`);
  if (sig.winRate != null) {
    ln.push(`Hist win   : ${sig.winRate}% (${sig.winRateTrades ?? 0} bt) — est, not a promise`);
  }
  ln.push(``);

  if (sig.reason) {
    ln.push(`Why: ${sig.reason}`);
    ln.push(``);
  }
  // Footer + disclaimer
  ln.push(`───────────────`);
  ln.push(`ID:${sig.id.slice(0, 10)} · ${mode}`);
  ln.push(`Not financial advice. Markets are probabilistic; no win is guaranteed.`);

  return ln.join("\n");
}

/**
 * Message sent when a link signal reaches its first target — reports the pips
 * gained so they can be logged/posted. Pass the realized exit price.
 */
export function formatWinMessage(sig: Signal, exitPrice: number, tpIndex: number, mode: "NEW" | "PAPER" = "NEW"): string {
  const pipSize = pipSizeFor(sig.symbol);
  const gained = pipsGained(sig.direction, sig.entry, exitPrice, pipSize);
  const isLong = sig.direction === "BUY";
  const tpPips = pipsToTargets(sig)[tpIndex] ?? 0;
  const ln: string[] = [];
  ln.push(`───────────────`);
  ln.push(`  ✅ TARGET ${tpIndex + 1} HIT   ${sig.symbol}`);
  ln.push(`───────────────`);
  ln.push(``);
  ln.push(`${isLong ? "🟢 LONG" : "🔴 SHORT"}  ${sig.type}  @ ${round(sig.entry)}`);
  ln.push(`Exit      : ${round(exitPrice)}`);
  ln.push(`Pips      : ${fmtPips(gained)} (target ${tpPips.toFixed(1)}p)`);
  ln.push(``);
  ln.push(`ID:${sig.id.slice(0, 10)} · ${mode}`);
  ln.push(`Not financial advice. Markets are probabilistic; no win is guaranteed.`);
  return ln.join("\n");
}
