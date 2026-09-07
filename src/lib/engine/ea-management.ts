import type { Signal } from "./analysis-types";
import { pipSizeFor, pipsBetween, pipsToTargets } from "./pips";

/**
 * EA-style trade-management plan derived from a signal's entry/sl/targets.
 * Pure math — produces guidance that maps 1:1 onto how an expert advisor
 * would manage a trade: break-even, partial close, trailing stop, lot size.
 */

export interface ManagementPlan {
  /** Move stop to entry once TP1 is hit (no more risk on the table). */
  breakEven: { at: number; stop: number; label: string };
  /** Close a portion at TP1 and let the rest run to TP2/TP3. */
  partialClose: { at: number; fractionPct: number; label: string };
  /** After TP1, trail the stop by a channel around the remaining distance. */
  trailing: { enabled: boolean; distancePips: number; label: string };
  /** Position-size guidance (risk-driven, pip-value based). */
  lotSize: {
    account: number;
    riskPct: number;
    riskDollars: number;
    stopPips: number;
    suggested: string;
  } | null;
  /** One-line wrap-up for Telegram / dashboards. */
  summary: string;
}

const LOT_PIP_VALUE_CENTS_PERPIP: Record<string, number> = {
  XAUUSD: 10,
};
const DEFAULT_PIP_VALUE = 10;

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  let d = Math.abs(n) >= 100 ? 2 : 5;
  if (Math.abs(n) > 0 && Math.abs(n) < 1) d = 5;
  return n.toFixed(d).replace(/\.?0+$/, "");
}

export function computeManagementPlan(
  sig: Signal,
  account = 10000,
  riskPct = 1
): ManagementPlan {
  const pipSize = pipSizeFor(sig.symbol);
  const tp1 = sig.takeProfits[0];
  const stopPips = pipsBetween(sig.entry, sig.stopLoss, pipSize);
  const [tp1Pips, tp2Pips] = pipsToTargets(sig);

  // Break-even at TP1.
  const breakEven = {
    at: tp1,
    stop: sig.entry,
    label: `At TP1 (${fmt(tp1)}) move SL to entry ${fmt(sig.entry)} — break-even, zero risk left.`,
  };

  // Partial close: 50% at TP1.
  const partialClose = {
    at: tp1,
    fractionPct: 50,
    label: `Close 50% at TP1 (${fmt(tp1)}) to bank profit; keep 50% running.`,
  };

  // Trailing: after TP1, protect a fraction of the remaining TP1->TP2 run.
  let trailing: ManagementPlan["trailing"];
  const remaining = Math.abs(tp2Pips - tp1Pips);
  if (Number.isFinite(remaining) && remaining > 0) {
    const dist = Math.max(8, Math.round(remaining * 0.4));
    trailing = {
      enabled: true,
      distancePips: dist,
      label: `After TP1, trail SL ${dist}p behind price to ride toward TP2.`,
    };
  } else {
    const fallback = Math.max(8, Math.round((stopPips || 20) * 0.3));
    trailing = {
      enabled: true,
      distancePips: fallback,
      label: `Trail SL ${fallback}p behind price after TP1 (conservative channel).`,
    };
  }

  // Lot size from account risk + stop distance + per-lot pip value.
  let lotSize: ManagementPlan["lotSize"] = null;
  const pipValue = LOT_PIP_VALUE_CENTS_PERPIP[sig.symbol] ?? DEFAULT_PIP_VALUE;
  if (Number.isFinite(stopPips) && stopPips > 0) {
    const riskDollars = account * (riskPct / 100);
    const riskPerLot = stopPips * pipValue;
    let suggested: string;
    if (riskPerLot > 0) {
      const lots = riskDollars / riskPerLot;
      if (lots >= 1) {
        const whole = lots >= 1 ? Math.floor(lots) : 0;
        const frac = Math.min(9, Math.round((lots - whole) * 10));
        suggested = `${whole}.${frac} lots (≈$${Math.round(riskDollars)} risk)`;
      } else {
        suggested = `${Math.max(1, Math.round(lots * 10)) / 10} lots (≈$${Math.round(riskDollars)} risk)`;
      }
    } else {
      suggested = `${Math.max(1, Math.round(riskDollars))} units`;
    }
    lotSize = { account, riskPct, riskDollars, stopPips, suggested };
  }

  const summary = `TP1 → break-even + close 50%; trail ${trailing.distancePips}p to TP2; risk ${riskPct}% / ${Math.round(
    account * (riskPct / 100)
  )}$`;

  return { breakEven, partialClose, trailing, lotSize, summary };
}
