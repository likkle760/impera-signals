import type { Signal } from "../analysis-types";
import type { HistoryEntry } from "../history";
import { parsePair } from "../market/correlation";
import {
  contractForSymbol,
  formatPositionSize,
  usdPerUnitMultiplier,
  type ContractSpec
} from "./contracts";
import type { RiskLimitsConfig } from "./config";

/**
 * PORTFOLIO RISK ENGINE (§ Risk)
 *
 * A dedicated risk-management layer placed BETWEEN the strategy and the final
 * signal. Every candidate signal is evaluated against the whole portfolio:
 *
 *   per-trade risk $                 = equity × risk%
 *   position size (real contract)   = risk$ / (|entry−stop| × contract spec)
 *   daily risk budget (24h window)
 *   daily realized loss (ledger)
 *   max drawdown (ledger)
 *   max open trades
 *   max total open risk
 *   correlated currency exposure
 *   consecutive-loss cooldown / per-symbol re-entry cooldown
 *   stale data / abnormal spread / abnormal volatility guards
 *
 * A rejected trade is never emitted as actionable; it carries the exact reason
 * (e.g. "Portfolio risk would rise 1.2% → 2.4%, above MAX_TOTAL_OPEN_RISK 2%").
 *
 * NOTE on SIM (demo) signals: they are observation-only and excluded from real
 * history/Telegram, so portfolio/ledger halts do NOT apply to them — only the
 * data-quality and sizing guards run, so the demo feed stays demonstrative.
 */

export interface RiskEvaluationInput {
  symbol: string;
  assetClass: string;
  name: string;
  direction: "BUY" | "SELL";
  type: string;
  entry: number;
  stopLoss: number;
  takeProfits: [number, number, number];
  spread: number;
  price: number;
  atr: number;
  quoteTimestamp: number;
  now: number;
  simulated: boolean;
  /** 0-100 volatility score (abnormally high → stop quality unreliable). */
  volatilityScore?: number;
  /** snapshot instruments (for quote→USD conversion) */
  snapshot: Record<string, { price: number }>;
  /** currently open recommendations (previous scan's approved signals) */
  previousOpen: Signal[];
  /** trade ledger (for daily-loss / drawdown / cooldown) */
  history: HistoryEntry[];
}

export interface RiskDecision {
  decision: "APPROVED" | "REJECTED";
  /** human one-liners explaining the decision (rejection reasons when REJECTED) */
  problems: string[];
  /** informational context attached even when approved */
  notes: string[];
  riskPercent: number;
  riskAmount: number;
  positionSize: { lots: number; units: number; label: string } | null;
  perLotRiskUSD: number;
  projectedOpenRiskPct: number;
  correlatedExposurePct: number;
  openTrades: number;
  maxOpenTrades: number;
  maxDailyRiskRemainingPct: number;
  dailyLossPct: number;
  drawdownPct: number;
  cooldownActive: boolean;
  netExposure: Record<string, number>;
}

function money(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;
}

export class PortfolioRiskEngine {
  /** rolling 24h committed-risk ledger (keyed by stable signal id). */
  private commitments = new Map<string, { riskPct: number; ts: number; symbol: string }>();

  constructor(private limits: RiskLimitsConfig) {}

  reset(): void {
    this.commitments.clear();
  }

  private prune(now: number): void {
    const cutoff = now - 24 * 60 * 60 * 1000;
    for (const [k, v] of this.commitments) {
      if (v.ts < cutoff) this.commitments.delete(k);
    }
  }

  evaluate(input: RiskEvaluationInput): RiskDecision {
    const L = this.limits;
    const problems: string[] = [];
    const notes: string[] = [];
    this.prune(input.now);

    const spec = contractForSymbol(input.symbol);
    const conversion = usdPerUnitMultiplier(spec, input.snapshot);

    // ── DATA QUALITY GUARDS (always apply) ────────────────────────────────
    const dataAge = input.quoteTimestamp > 0 ? input.now - input.quoteTimestamp : 0;
    if (dataAge > L.staleMs) {
      problems.push(`Market data stale (${Math.round(dataAge / 1000)}s old, limit ${Math.round(L.staleMs / 1000)}s).`);
    }

    const stopDist = Math.abs(input.entry - input.stopLoss);
    if (!Number.isFinite(stopDist) || stopDist <= 0) {
      problems.push("Stop-loss distance is invalid — cannot place a stop, trade blocked.");
    }
    if (!Number.isFinite(input.entry) || input.entry <= 0) {
      problems.push("Invalid entry price — trade blocked.");
    }

    // Spread as a % of the stop distance. A spread that eats too much of the
    // planned stop makes the stop placement unreliable (and adds hidden cost).
    if (stopDist > 0 && input.spread > 0) {
      const spreadToStop = input.spread / stopDist;
      notes.push(`Spread ${input.spread.toFixed(2)} = ${(spreadToStop * 100).toFixed(1)}% of stop distance.`);
      if (spreadToStop > L.maxSpreadToStopPct) {
        problems.push(
          `Spread is ${(spreadToStop * 100).toFixed(1)}% of the stop distance (limit ${(L.maxSpreadToStopPct * 100).toFixed(0)}%) — execution unreliable, trade blocked.`
        );
      }
    }

    // ── RISK% + POSITION SIZING (real contract math) ──────────────────────
    const riskPercent = L.maxRiskPerTradePct;
    const riskAmount = L.accountEquity * (riskPercent / 100);
    let positionSize: RiskDecision["positionSize"] = null;
    let perLotRiskUSD = 0;
    let sizingBlocked = false;
    if (riskPercent > 0 && Number.isFinite(stopDist) && stopDist > 0 && input.entry > 0) {
      perLotRiskUSD = stopDist * spec.usdPerUnitPerLot * conversion;
      if (!Number.isFinite(perLotRiskUSD) || perLotRiskUSD <= 0) {
        problems.push("Cannot compute monetary risk at stop (contract/pip value invalid) — trade blocked.");
        sizingBlocked = true;
      } else {
        const lots = riskAmount / perLotRiskUSD;
        if (!Number.isFinite(lots) || lots <= 0) {
          problems.push("Computed position size is invalid — trade blocked.");
          sizingBlocked = true;
        } else {
          positionSize = formatPositionSize(spec, lots);
          notes.push(`Size ${positionSize.label} risks ${money(riskAmount)}; per-lot loss at stop = ${money(perLotRiskUSD)}.`);
          if (lots > 200 && spec.labelKind === "lots") {
            problems.push(`Computed size ${lots.toFixed(0)} lots is implausible — stop distance likely misconfigured; trade blocked.`);
            sizingBlocked = true;
          }
        }
      }
    } else {
      problems.push(`Risk per trade ${riskPercent}% is not configured — trade blocked.`);
      sizingBlocked = true;
    }

    // ── LEDGER-BASED HALTS (real trades only) ─────────────────────────────
    const { dailyLossPct, drawdownPct, consecutiveLosses, recentSymbolLoss, lastLossAt, netExposure, maxLossSymbol } =
      this.ledgerStats(input);

    // ── PORTFOLIO / CORRELATION / DAILY HALTS (skip for SIM observation) ──
    const simulated = input.simulated;
    let cooldownActive = false;
    let projectedOpenRiskPct = 0;
    let correlatedExposurePct = 0;
    let openTrades = input.previousOpen.length;

    if (!simulated) {
      const existingRisk = input.previousOpen.reduce((sum, s) => sum + (s.riskAnalysis?.riskPercent ?? riskPercent), 0);
      projectedOpenRiskPct = existingRisk + riskPercent;
      openTrades = input.previousOpen.length;

      notes.push(
        `Open risk ${existingRisk.toFixed(2)}% → ${projectedOpenRiskPct.toFixed(2)}% (limit ${L.maxTotalOpenRiskPct}%).`
      );

      let blocked = false;
      const reasons: string[] = [];

      if (openTrades >= L.maxOpenTrades) {
        reasons.push(`Already at max open trades (${L.maxOpenTrades}).`);
        blocked = true;
      }
      if (projectedOpenRiskPct > L.maxTotalOpenRiskPct) {
        reasons.push(
          `Portfolio risk would increase from ${existingRisk.toFixed(1)}% to ${projectedOpenRiskPct.toFixed(1)}%, exceeding MAX_TOTAL_OPEN_RISK of ${L.maxTotalOpenRiskPct}%.`
        );
        blocked = true;
      }

      // Correlation: same-direction exposure on the legs this trade touches.
      // Each trade contributes positive exposure on its long leg and negative
      // on its short leg (e.g. GBPUSD BUY → +GBP, −USD). A new trade is
      // "correlated" when any of ITS legs overlap in the same signed direction
      // with existing open trades — meaning it expresses the same macro bet
      // (e.g. both shorting USD).
      const legs = pairLegs(input.symbol, input.direction);
      const expo: Record<string, number> = {};
      for (const prev of input.previousOpen) {
        const pLegs = pairLegs(prev.symbol, prev.direction);
        const pRisk = prev.riskAnalysis?.riskPercent ?? riskPercent;
        for (const c of pLegs.long) expo[c] = (expo[c] ?? 0) + pRisk;
        for (const c of pLegs.short) expo[c] = (expo[c] ?? 0) - pRisk;
      }
      let maxSameSign = 0;
      for (const c of [...legs.long, ...legs.short]) {
        const side = legs.long.includes(c) ? 1 : -1;
        const e = expo[c] ?? 0;
        if (e * side > 0) maxSameSign = Math.max(maxSameSign, Math.abs(e));
      }
      correlatedExposurePct = maxSameSign;
      notes.push(`Correlated exposure on this trade's currencies: ${correlatedExposurePct.toFixed(2)}% (limit ${L.maxCorrelatedRiskPct}%).`);
      if (correlatedExposurePct + riskPercent > L.maxCorrelatedRiskPct) {
        reasons.push(
          `Adding this trade would push correlated exposure to ${(correlatedExposurePct + riskPercent).toFixed(2)}% (limit ${L.maxCorrelatedRiskPct}%) — same underlying movement twice.`
        );
        blocked = true;
      }

      // Daily risk budget (rolling 24h committed risk).
      let committedToday = 0;
      for (const v of this.commitments.values()) committedToday += v.riskPct;
      const maxDaily = L.maxDailyRiskPct;
      if (committedToday + riskPercent > maxDaily) {
        reasons.push(
          `Daily risk budget exhausted: ${committedToday.toFixed(2)}% committed today, ${riskPercent.toFixed(2)}% more would exceed ${maxDaily}%. STOP FOR THE DAY.`
        );
        blocked = true;
      }

      if (dailyLossPct >= L.maxDailyLossPct) {
        reasons.push(
          `Daily loss limit reached (${dailyLossPct.toFixed(2)}% realized, limit ${L.maxDailyLossPct}%). Trading halted for the day.`
        );
        blocked = true;
      }
      if (drawdownPct >= L.maxDrawdownPct) {
        reasons.push(
          `Maximum drawdown reached (${drawdownPct.toFixed(2)}% from peak, limit ${L.maxDrawdownPct}%). Trading halted.`
        );
        blocked = true;
      }
      if (consecutiveLosses >= L.maxConsecutiveLosses) {
        cooldownActive = true;
        reasons.push(
          `${consecutiveLosses} consecutive losses — cooldown active until a winning trade resets the streak.`
        );
        blocked = true;
      }
      if (recentSymbolLoss) {
        cooldownActive = true;
        const minsAgo = Math.round((input.now - lastLossAt) / 60_000);
        reasons.push(
          `Recent stop-out on ${input.symbol} ${minsAgo} min ago — re-entry cooldown (${L.cooldownMinutes} min). Let the setup reset.`
        );
        blocked = true;
      }

      problems.push(...reasons);
      if (blocked) {
        // still attach sizing info for transparency (computed above)
      }
    } else {
      notes.push("SIM observation feed — portfolio/ledger halts not enforced (demo only).");
      correlatedExposurePct = 0;
      projectedOpenRiskPct = 0;
      openTrades = 0;
    }

    // Volatility guard (always): abnormal volatility adds spread + slippage.
    if (input.price > 0 && input.atr > 0) {
      const pct = (input.atr / input.price) * 100;
      if (input.volatilityScore != null && input.volatilityScore > L.maxVolatilityScore) {
        problems.push(
          `Abnormal volatility (score ${input.volatilityScore}, limit ${L.maxVolatilityScore}) — stop quality unreliable, trade blocked.`
        );
      }
      notes.push(`ATR ${input.atr.toFixed(4)} = ${pct.toFixed(3)}% of price.`);
    }

    const rejected = sizingBlocked || problems.length > 0;
    const remainingDaily = Math.max(0, L.maxDailyRiskPct - (this.commitRiskFor(input) + (rejected ? 0 : riskPercent)));

    return {
      decision: rejected ? "REJECTED" : "APPROVED",
      problems,
      notes,
      riskPercent,
      riskAmount,
      positionSize,
      perLotRiskUSD,
      projectedOpenRiskPct,
      correlatedExposurePct,
      openTrades,
      maxOpenTrades: L.maxOpenTrades,
      maxDailyRiskRemainingPct: remainingDaily,
      dailyLossPct,
      drawdownPct,
      cooldownActive,
      netExposure
    };
  }

  /** commit the approved risk to the rolling daily budget. */
  commit(id: string, symbol: string, riskPct: number, now: number): void {
    this.commitments.set(id, { riskPct, symbol, ts: now });
  }

  /** sum of committed risk for a symbol in the rolling window. */
  private commitRiskFor(input: RiskEvaluationInput): number {
    let total = 0;
    for (const v of this.commitments.values()) total += v.riskPct;
    return total;
  }

  /**
   * Derive portfolio/ledger stats from the trade ledger (history). History
   * outcomes are only produced when the stable signal id starts the id-count
   * again on the same setup, so won/lost entries are trustworthy and keyed by
   * (symbol, type, entry-bucket).
   */
  private ledgerStats(input: RiskEvaluationInput): {
    dailyLossPct: number;
    drawdownPct: number;
    consecutiveLosses: number;
    recentSymbolLoss: boolean;
    lastLossAt: number;
    netExposure: Record<string, number>;
    maxLossSymbol: string | null;
  } {
    const L = this.limits;
    let equity = L.accountEquity;
    let peak = L.accountEquity;
    let dailyLoss = 0;
    let consec = 0;
    let recentSymbolLoss = false;
    let lastLossAt = 0;
    const dayStart = startOfUtcDay(input.now);
    const netExposure: Record<string, number> = {};
    let maxLossSymbol: string | null = null;

    // history is newest-first; walk oldest→newest to reconstruct the ledger.
    const entries = [...input.history].reverse();
    for (const e of entries) {
      const riskPct = e.riskAnalysis?.riskPercent ?? L.maxRiskPerTradePct;
      const winR = e.riskReward && e.riskReward > 0 ? Math.min(e.riskReward, 4) : 1.5;
      const pnlPct = e.outcome === "lost" ? -riskPct : e.outcome === "won" ? riskPct * winR : 0;
      const delta = (Math.abs(equity) * pnlPct) / 100;
      equity += delta;
      if (equity > peak) peak = equity;

      let lost = false;
      if (e.outcome === "lost") {
        if (e.createdAt >= dayStart) dailyLoss += riskPct;
        lost = true;
        lastLossAt = Math.max(lastLossAt, e.updatedAt ?? e.createdAt);
        if (e.symbol.toUpperCase() === input.symbol.toUpperCase()) recentSymbolLoss = true;
        maxLossSymbol = e.symbol;
      } else if (e.outcome === "won") {
        lost = false;
      }
      // cooldown streak only counts settled loses in sequence (won resets).
      if (lost) consec += 1;
      else if (e.outcome === "won") consec = 0;

      const { base, quote } = parsePair(e.symbol);
      const side = e.direction === "BUY" ? 1 : -1;
      // directional exposure of each settled trade's base currency (approx 1:1)
      netExposure[base] = (netExposure[base] ?? 0) + (e.riskAnalysis?.riskPercent ?? riskPct) * side;
      void quote;
    }

    const drawdownPct = peak > 0 ? Math.max(0, ((peak - equity) / peak) * 100) : 0;
    const dailyLossPct = equity > 0 ? dailyLoss : 0; // dailyLoss is a % sum of lost risk caps/day
    return {
      dailyLossPct,
      drawdownPct,
      consecutiveLosses: consec,
      recentSymbolLoss,
      lastLossAt,
      netExposure,
      maxLossSymbol
    };
  }
}

function startOfUtcDay(ts: number): number {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** Currency legs a trade adds, in its direction (long side then short side). */
function pairLegs(symbol: string, direction: "BUY" | "SELL"): { long: string[]; short: string[] } {
  const { base, quote } = parsePair(symbol);
  if (direction === "BUY") return { long: [base], short: [quote] };
  return { long: [quote], short: [base] };
}

/** True when the stop-loss sits the correct side of the entry for direction. */
export function stopIsValid(sig: Pick<Signal, "entry" | "stopLoss" | "direction">): boolean {
  return sig.direction === "BUY" ? sig.stopLoss < sig.entry : sig.stopLoss > sig.entry;
}

/** Short human summary of a risk decision (for the card + logs). */
export function riskDecisionLine(
  d: Pick<RiskDecision, "decision" | "riskPercent" | "riskAmount" | "positionSize">
): string {
  const size = d.positionSize ? ` · size ${d.positionSize.label}` : "";
  return `${d.decision} · risk ${d.riskPercent}% (${money(d.riskAmount)})${size}`;
}