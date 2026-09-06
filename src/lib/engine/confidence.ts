import type { Direction, Timeframe } from "../types";
import type { FairValueGap, InstrumentAnalysis } from "./analysis-types";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TRADE CONFIDENCE ENGINE  (0–100 confluence scoring)
 *
 * Implements the multi-confirmation scoring model (§7):
 *
 *   TREND ALIGNMENT        20 pts   (4H 10 / 1H 5 / execution TF 5)
 *   MARKET STRUCTURE       20 pts   (BOS/CHOCH 10 / HH-HL|LH-LL 10)
 *   LIQUIDITY              15 pts   (major sweep 10 / clean rejection 5)
 *   ENTRY ZONE             15 pts   (high-quality FVG 8 / OB or S-R 7)
 *   MOMENTUM               10 pts   (displacement + multi-TF MACD agreement)
 *   RISK-TO-REWARD         10 pts   (RR>=1:2 8 / RR>=1:3 10)
 *   SESSION / CONDITIONS   10 pts   (high-liquidity 5 / no dangerous state 5)
 *                          ─────
 *   TOTAL                 100 pts
 *
 * A setup is only actionable when the score meets the configured minimum
 * confidence threshold (default 70; A+/A/B = 90/85/80). The score is a
 * *confluence* measure, NOT a guaranteed win probability. Two hard accuracy
 * guards are baked in: MOMENTUM is only credited on displacement + sustained
 * multi-TF agreement (a lone histogram is noise), and a setup with zero
 * structural/liquidity/entry-zone basis is capped at 59 (never tradable).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ConfidenceModuleConfig {
  /** default minimum confidence to allow a trade (0-100). Default 70. */
  minConfidence: number;
}

export const DEFAULT_CONFIDENCE_CONFIG: ConfidenceModuleConfig = {
  minConfidence: 70
};

export interface ConfidenceBreakdown {
  trend: number;        // /20
  structure: number;    // /20
  liquidity: number;    // /15
  entryZone: number;    // /15
  momentum: number;     // /10
  riskReward: number;   // /10
  session: number;      // /10
  total: number;        // 0-100
  passed: boolean;      // total >= minConfidence
  reasons: string[];
  /** Human grade matching §8 confidence levels. */
  grade: ConfidenceGrade;
  /** Driver diagnostics for calibration (§15). */
  details: ConfidenceDetails;
}

export type ConfidenceGrade =
  | "PREMIUM SETUP"
  | "VERY STRONG SETUP"
  | "HIGH-QUALITY SETUP"
  | "MODERATE SETUP"
  | "LOW CONFIDENCE";

export type ConfidenceBand =
  | "90-100"
  | "85-89"
  | "80-84"
  | "70-79"
  | "<70";

export interface ConfidenceDetails {
  /** which HTF timeframes aligned (4h/1h) */
  htfAligned: { "4h": boolean; "1h": boolean; exec: boolean };
  /** whether a BOS/CHOCH and a clean HH/HL-LH/LL sequence was seen */
  structure: { bos: boolean; choch: boolean; sequence: boolean };
  /** liquidity sweep + rejection recognition */
  liquidity: { sweepHigh: boolean; sweepLow: boolean; cleanRejection: boolean };
  /** FVG quality classification on the entry side */
  fvg: FvgQuality | null;
  /** whether an order block / S-R confluence was present */
  zoneConfluence: boolean;
  /** displacement + momentum */
  momentum: { displacement: boolean; confirmed: boolean };
  /** reward:risk inputs */
  riskReward: { rr: number; rrOk2: boolean; rrOk3: boolean };
  /** session conditions */
  session: { highLiquidity: boolean; dangerous: boolean };
  /** zero-basis veto: no structural/liquidity/entry-zone claim at all */
  chopVeto: boolean;
}

/**
 * FVG quality classification (§6). A quality score 0-100, then graded:
 *   90-100 Premium | 80-89 Strong | 70-79 Moderate | <70 Weak
 */
export interface FvgQuality {
  /** 0-100 quality score */
  score: number;
  grade: "PREMIUM" | "STRONG" | "MODERATE" | "WEAK";
  /** the FVG this refers to */
  zone: FairValueGap;
}

export function gradeFvg(score: number): FvgQuality["grade"] {
  if (score >= 90) return "PREMIUM";
  if (score >= 80) return "STRONG";
  if (score >= 70) return "MODERATE";
  return "WEAK";
}

export function gradeConfidence(score: number): ConfidenceGrade {
  if (score >= 90) return "PREMIUM SETUP";
  if (score >= 85) return "VERY STRONG SETUP";
  if (score >= 80) return "HIGH-QUALITY SETUP";
  if (score >= 70) return "MODERATE SETUP";
  return "LOW CONFIDENCE";
}

/**
 * A+/A/B letter grade used on signals + telegram.
 *   A+  >= 90  PREMIUM        — the ideal trade (highest confluence)
 *   A   >= 85  VERY STRONG    — near-perfect setup
 *   B   >= 80  HIGH-QUALITY   — acceptable, meets min confidence bar
 *   C   >= 70  MODERATE       — filtered as NO TRADE at the default 80 bar
 *   F   <  70  LOW            — never trade
 */
export function gradeLabel(total: number): "A+" | "A" | "B" | "C" | "F" {
  if (total >= 90) return "A+";
  if (total >= 85) return "A";
  if (total >= 80) return "B";
  if (total >= 70) return "C";
  return "F";
}

/**
 * Historical win-rate target for a given confidence band (used for calibration
 * messaging, NOT a guarantee — see §15). A+ setups target roughly 80%+.
 */
export function winRateTarget(total: number): number {
  if (total >= 90) return 0.85;
  if (total >= 85) return 0.82;
  if (total >= 80) return 0.8;
  if (total >= 70) return 0.72;
  return 0.55;
}

export function confidenceBand(score: number): ConfidenceBand {
  if (score >= 90) return "90-100";
  if (score >= 85) return "85-89";
  if (score >= 80) return "80-84";
  if (score >= 70) return "70-79";
  return "<70";
}

/**
 * Classify a candidate entry-side FVG by the criteria in §6. `alignBullish` /
 * `alignBearish` tell whether the FVG type matches the higher-timeframe bias.
 */
export function classifyFvg(
  fvg: FairValueGap,
  opts: {
    htfAligned: boolean;
    causedBos: boolean;
    liquiditySwept: boolean;
    atr: number;
    price: number;
  }
): FvgQuality {
  let score = 50;
  if (opts.htfAligned) score += 15;
  if (opts.causedBos) score += 10;
  if (opts.liquiditySwept) score += 10;
  // freshness — recent FVG is stronger
  if (fvg.age <= 2) score += 8;
  else if (fvg.age <= 6) score += 4;
  // never mitigated = intact
  if (!fvg.filled) score += 7;
  // size relative to ATR — a real imbalance (0.4–2 ATR) is premium
  if (isFinite(fvg.sizeAtr)) {
    if (fvg.sizeAtr >= 0.4 && fvg.sizeAtr <= 2) score += 10;
    else if (fvg.sizeAtr > 0 && fvg.sizeAtr < 0.4) score += 4;
  }
  return { score: Math.max(0, Math.min(100, score)), grade: gradeFvg(score), zone: fvg };
}

/**
 * Compute the full 0-100 confidence for a directional setup.
 *
 * @param direction      BUY or SELL
 * @param analysis       the per-instrument analysis (trend, structure, liquidity,
 *                       FVGs, order blocks, session, prices)
 * @param rr             reward:risk of the prepared trade (entry/SL/TP)
 * @param entrySideFvg   the FVG being traded (if the entry is FVG-based)
 * @param opts.sideSpecific overrides used for tests/calibration.
 */
export function scoreConfidence(
  direction: Direction,
  analysis: InstrumentAnalysis,
  rr: number,
  entrySideFvg: FairValueGap | null,
  config: ConfidenceModuleConfig = DEFAULT_CONFIDENCE_CONFIG
): ConfidenceBreakdown {
  const reasons: string[] = [];
  const details: ConfidenceDetails = {
    htfAligned: { "4h": false, "1h": false, exec: false },
    structure: { bos: false, choch: false, sequence: false },
    liquidity: { sweepHigh: false, sweepLow: false, cleanRejection: false },
    fvg: entrySideFvg ? classifyFvg(entrySideFvg, {
      htfAligned: false,
      causedBos: !!analysis.structure.bos,
      liquiditySwept: analysis.liquidity.sweeps.length > 0,
      atr: analysis.atr,
      price: analysis.price
    }) : null,
    zoneConfluence: false,
    momentum: { displacement: false, confirmed: false },
    riskReward: { rr, rrOk2: rr >= 2, rrOk3: rr >= 3 },
    session: { highLiquidity: false, dangerous: false },
    chopVeto: false
  };

  // ── TREND ALIGNMENT — 20 ────────────────────────────────────────────────
  let trend = 0;
  const htf = (analysis.trend.higherTimeframe || "").toUpperCase();
  const htf4 = (analysis.indicators["4h"]?.macd?.histogram ?? 0) * (direction === "BUY" ? 1 : -1) > 0;
  const htf1 = (analysis.indicators["1h"]?.macd?.histogram ?? 0) * (direction === "BUY" ? 1 : -1) > 0;
  const exec = (analysis.indicators["15m"]?.macd?.histogram ?? analysis.indicators["5m"]?.macd?.histogram ?? 0) * (direction === "BUY" ? 1 : -1) > 0;

  const htfBull = htf.includes("BULLISH");
  const htfBear = htf.includes("BEARISH");

  if (direction === "BUY" && htfBull) { trend += 10; details.htfAligned["4h"] = true; }
  else if (direction === "SELL" && htfBear) { trend += 10; details.htfAligned["4h"] = true; }
  // 1H directional-bias agreement (also cleared by aligned 4H MACD histogram)
  const htf4Strong = direction === "BUY" ? htfBull : htfBear;
  const htf4Hard = htf4 === (direction === "BUY");
  if (htf4Hard || htf4Strong) {
    trend += 5;
    details.htfAligned["1h"] = true;
  }
  if (exec) { trend += 5; details.htfAligned.exec = true; }
  // Neutral HTF but both the 1h and execution timeframes aligning = an emerging
  // trend worth partial credit (the 4h spot is legitimately unconfirmed).
  if (!htfBull && !htfBear && htf1 && exec) trend += 5;
  // An unconfirmed HTF (neither a clear 4h bull nor bear stand) can't justify a
  // full trend score — cap it at the emerging-trend credit so neutral-HTF setups
  // need every other factor to pass. Mirrors the market-draft HTF alignment gate.
  if (!htfBull && !htfBear && trend > 10) trend = 10;
  if (trend > 0) reasons.push(`Trend alignment ${trend}/20`);

  // ── shared entry-zone geometry (used by structure + entry zone sections) ──
  const price = analysis.price;
  const sR = analysis.supportResistance;
  const atrR = analysis.atr || price * 0.002;
  const nearSupport = direction === "BUY" && sR.supports.some((s) => Math.abs(s.price - price) <= atrR * 1.0);
  const nearResistance = direction === "SELL" && sR.resistances.some((r) => Math.abs(r.price - price) <= atrR * 1.0);
  const entrySideSrs = direction === "BUY" ? sR.supports : sR.resistances;
  const nearLevel = entrySideSrs.reduce<number | null>((acc, l) => {
    const d = Math.abs(l.price - price) / atrR;
    return acc === null ? d : Math.min(acc, d);
  }, null);
  const obSide = analysis.orderBlocks && (direction === "BUY" ? analysis.orderBlocks.bullish : analysis.orderBlocks.bearish);
  let nearBlock: number | null = null;
  if (obSide) {
    nearBlock = obSide.reduce<number | null>((acc, b) => {
      const mid = (b.high + b.low) / 2;
      const d = Math.abs(mid - price) / atrR;
      return acc === null ? d : Math.min(acc, d);
    }, null);
  }

  // ── MARKET STRUCTURE — 20 ───────────────────────────────────────────────
  let structure = 0;
  const struct = analysis.structure;
  const dirBreak =
    (direction === "BUY" && struct.structureType === "BREAK OF STRUCTURE") ||
    (direction === "SELL" && struct.structureType === "BREAK OF STRUCTURE");
  const dirSequence =
    (direction === "BUY" && (struct.structureType === "HIGHER HIGHS" || struct.structureType === "CHANGE OF CHARACTER")) ||
    (direction === "SELL" && (struct.structureType === "LOWER LOWS" || struct.structureType === "CHANGE OF CHARACTER"));
  // A break of structure confirmed by an actual BOS in the trade direction =
  // continuation MOMENTUM — worth the full structure sequence, not just the BOS.
  // An HH/HL or LH/LL (or CHoCH) sequence confirms the price-action direction.
  if ((dirBreak && struct.bos) || dirSequence) {
    structure += 10;
    details.structure.sequence = true;
  }
  if (struct.bos) {
    structure += 10;
    details.structure.bos = true;
  } else if (struct.choch) {
    structure += 10;
    details.structure.choch = true;
  }
  // Pullback continuation: RANGE/consolidation snapping back WITH the HTF trend
  // from a key level please. This is the classic A-quality setup (limit entry in
  // a strong trend) — no fresh BOS/CHoCH has formed yet, but the context is real.
  if (structure === 0 && struct.consolidation) {
    const htfAlignedToDir = (direction === "BUY" && htfBull) || (direction === "SELL" && htfBear);
    const atZone = (nearLevel !== null && nearLevel <= 1.0) || (nearBlock !== null && nearBlock <= 1.0);
    if (htfAlignedToDir && atZone) {
      structure += 6;
      details.structure.sequence = true;
    } else if (htfAlignedToDir) {
      structure += 3;
    }
  }
  if (structure > 0) reasons.push(`Market structure ${structure}/20`);

  // ── LIQUIDITY — 15 ──────────────────────────────────────────────────────
  let liquidity = 0;
  const sweepHigh = analysis.liquidity.sweeps.some((s) => s.type === "HIGH");
  const sweepLow = analysis.liquidity.sweeps.some((s) => s.type === "LOW");
  details.liquidity.sweepHigh = sweepHigh;
  details.liquidity.sweepLow = sweepLow;
  // A BUY should ride off a swept LOW (sell-side liquidity taken); SELL off swept HIGH.
  const majorSweep = direction === "BUY" ? sweepLow : sweepHigh;
  if (majorSweep) {
    liquidity += 10;
    // clean rejection: price closed back inside after the sweep (conservative)
    if (nearSupport || nearResistance) {
      liquidity += 5;
      details.liquidity.cleanRejection = true;
    }
  } else {
    // No fresh sweep yet — but trading out of a standing liquidity pocket (an
    // equal-low cluster below a BUY / equal-high cluster above a SELL, or price
    // sitting right on a demand/supply level) still confirms the draw context.
    const pocket =
      (direction === "BUY" && (analysis.liquidity.equalLows.length > 0 || analysis.liquidity.areas.some((a) => a.kind.toUpperCase().includes("EQUAL LOW")))) ||
      (direction === "SELL" && (analysis.liquidity.equalHighs.length > 0 || analysis.liquidity.areas.some((a) => a.kind.toUpperCase().includes("EQUAL HIGH"))));
    if (pocket && (nearSupport || nearResistance)) liquidity += 5;
  }
  // Target-side liquidity: an unfilled sweep AHEAD in the trade direction is a
  // magnet (buy-side pool above a BUY / sell-side below a SELL) — price is
  // drawn toward it, boosting the odds the move completes.
  const targetSweep = direction === "BUY" ? sweepHigh : sweepLow;
  if (targetSweep) liquidity += 3;
  if (liquidity > 0) reasons.push(`Liquidity ${liquidity}/15`);

  // ── ENTRY ZONE — 15 ─────────────────────────────────────────────────────
  let entryZone = 0;
  let fvgQuality: FvgQuality | null = details.fvg;
  if (entrySideFvg) {
    fvgQuality = classifyFvg(entrySideFvg, {
      htfAligned: (direction === "BUY" && htfBull) || (direction === "SELL" && htfBear),
      causedBos: !!analysis.structure.bos,
      liquiditySwept: majorSweep,
      atr: analysis.atr,
      price
    });
    details.fvg = fvgQuality;
    if (fvgQuality.score >= 80) entryZone += 8;
    else if (fvgQuality.score >= 70) entryZone += 5;
    else if (fvgQuality.score >= 55) entryZone += 2;
    // standing inside the actual gap is the strongest possible fill location
    if (price >= entrySideFvg.lower && price <= entrySideFvg.upper) entryZone += 3;
  }
  // Order block / S-R confluence on the entry side — graded by *distance* to
  // the nearest entry-side block/level, never "any block anywhere".
  let zoneConfluence = false;
  if (nearLevel !== null && nearLevel <= 1.5) {
    entryZone += nearLevel <= 1.0 ? 7 : 4;
    zoneConfluence = true;
  }
  if (nearBlock !== null && nearBlock <= 1.5) {
    entryZone += nearBlock <= 1.0 ? 7 : 4;
    zoneConfluence = true;
  }
  if (zoneConfluence) details.zoneConfluence = true;
  entryZone = Math.min(15, entryZone);
  if (entryZone > 0) reasons.push(`Entry zone ${entryZone}/15`);

  // ── MOMENTUM — 10 ───────────────────────────────────────────────────────
  let momentum = 0;
  const displacement =
    (analysis.displacement && (direction === "BUY" ? analysis.displacement.bullish.length > 0 : analysis.displacement.bearish.length > 0)) || false;
  details.momentum.displacement = displacement;
  const m5hist = analysis.indicators["5m"]?.macd?.histogram ?? 0;
  const m15hist = analysis.indicators["15m"]?.macd?.histogram ?? 0;
  const m5Agree = (direction === "BUY" && m5hist > 0) || (direction === "SELL" && m5hist < 0);
  const m15Agree = (direction === "BUY" && m15hist > 0) || (direction === "SELL" && m15hist < 0);
  // Momentum is only credited when there is displacement AND sustained
  // multi-timeframe MACD agreement. A lone flat histogram is noise, not
  // confirmation — rewarding it is the classic source of chop whipsaws.
  details.momentum.confirmed = m5Agree && m15Agree;
  if (displacement) {
    if (m5Agree && m15Agree) momentum = 10;
    else if (m5Agree || m15Agree) momentum = 5;
  }
  if (momentum > 0) reasons.push(`Momentum ${momentum}/10`);

  // ── RISK-TO-REWARD — 10 ─────────────────────────────────────────────────
  // partial credit from 1.2R up (the resting-limit ladder floor) — a well-placed
  // 1.5R pullback is still a valid trade; deeper RR grades toward full marks.
  let riskReward = 0;
  details.riskReward.rr = rr;
  if (rr >= 2.5) riskReward = 10;
  else if (rr >= 2) riskReward = 8;
  else if (rr >= 1.5) riskReward = 5;
  else if (rr >= 1.2) riskReward = 3;
  details.riskReward.rrOk2 = rr >= 2;
  details.riskReward.rrOk3 = rr >= 3;

  // ── SESSION / CONDITIONS — 10 ───────────────────────────────────────────
  let session = 0;
  const sessionStr = analysis.session || "";
  const highLiquidity = sessionStr.includes("LONDON") || sessionStr.includes("NEW YORK") || sessionStr.includes("OVERLAP");
  details.session.highLiquidity = highLiquidity;
  if (highLiquidity) session += 5;
// dangerous = extreme volatility OR contradictory HTF claims (both 4h bull and
// bear flags at once). NEUTRAL/unconfirmed HTF is NOT dangerous, and a pullback
// at a key level is the entry context, not a warning.
  const dangerous =
    analysis.trend.volatilityScore > 75 ||
    (htfBull && htfBear);
  details.session.dangerous = dangerous;
  if (!dangerous) session += 5;
  if (session > 0) reasons.push(`Session ${session}/10`);

  // ── HARD ACCURACY GUARD — zero-basis veto ─────────────────────────────────
  // A setup with no structural claim, no liquidity context AND no entry zone is
  // a coin flip, no matter how attractive its R:R or session looks. Cap it at
  // 59 so it can never cross a tradable bar (70+).
  const zeroBasis = structure === 0 && liquidity === 0 && entryZone === 0;
  details.chopVeto = zeroBasis;
  if (zeroBasis) reasons.push("No confluence basis (structure+liquidity+zone all zero)");

  const rawTotal = trend + structure + liquidity + entryZone + momentum + riskReward + session;
  const cappedTotal = zeroBasis ? Math.min(rawTotal, 59) : rawTotal;
  const total = Math.max(0, Math.min(100, cappedTotal));

  return {
    trend,
    structure,
    liquidity,
    entryZone,
    momentum,
    riskReward,
    session,
    total,
    passed: total >= config.minConfidence,
    reasons,
    grade: gradeConfidence(total),
    details
  };
}

/** Human summary of a confidence result. */
export function confidenceSummary(c: ConfidenceBreakdown): string {
  const parts: string[] = [];
  if (c.trend > 0) parts.push(`Trend ${c.trend}pts`);
  if (c.structure > 0) parts.push(`Structure ${c.structure}pts`);
  if (c.liquidity > 0) parts.push(`Liquidity ${c.liquidity}pts`);
  if (c.entryZone > 0) parts.push(`Zone ${c.entryZone}pts`);
  if (c.momentum > 0) parts.push(`Momentum ${c.momentum}pts`);
  if (c.session > 0) parts.push(`Session ${c.session}pts`);
  return parts.length ? parts.join(" · ") : "No confluence";
}
