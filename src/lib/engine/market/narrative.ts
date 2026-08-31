import type { MarketRegime, Direction } from "../../types";
import type {
  LiquiditySweepResult,
  LiquiditySweep
} from "./liquidity-sweep";
import type { DisplacementResult } from "./displacement";
import type { FVGPool } from "./imbalance";
import type { SupplyDemandZone, OrderBlockZone } from "./supply-demand";
import type { PremiumDiscountResult } from "./premium-discount";
import type { ScalpSignal } from "../scalp/types";
import type { SwingSignal } from "../swing/types";

/**
 * Market Narrative / Story engine (§17, §18).
 *
 * §17 is explicit: a "RSI=71, SELL" is NOT a signal. We build a structured,
 * multi-timeframe explanation of WHAT happened, WHY, where liquidity is, who is
 * in control, what confirms/invalidates, where the target is, and where the
 * trade is wrong. Every no-trade is also explained (§31).
 *
 * The narrative is generated from the actual detected components (sweep,
 * displacement, imbalance, zone, premium/discount, session) — it is not
 * templated filler.
 */
export type SignalState = "WATCH" | "ARMED" | "LIVE" | "NO TRADE";

export interface MarketNarrativeInput {
  symbol: string;
  price: number;
  htfBias: MarketRegime;
  /** per-timeframe structure bias (MSE), newest label of the sequence */
  structureByTF: Array<{ tf: string; bias: string; bos?: boolean; choch?: boolean }>;
  liquidity: LiquiditySweepResult;
  displacement: DisplacementResult;
  imbalance: { gaps: FVGPool[]; best: FVGPool | null };
  zones: { zones: OrderBlockZone[] };
  premium: PremiumDiscountResult;
  session: string;
  /** tentative direction from the decision tree (may be null = no edge) */
  leanDirection: Direction | null;
  /** candidate derived signal the narrative explains (optional) */
  signal?: ScalpSignal | SwingSignal | null;
}

export interface Narrative {
  state: SignalState;
  /** headline one-liner */
  headline: string;
  /** multi-timeframe market model lines */
  timeframes: string[];
  /** WHAT HAPPENED / WHY */
  story: string;
  /** WHERE IS LIQUIDITY */
  liquidity: string;
  /** WHO IS IN CONTROL */
  control: string;
  /** what confirms the idea */
  confirm: string;
  /** what invalidates the idea */
  invalidate: string;
  /** where price is likely to target */
  target: string;
  /** where the trade is wrong */
  wrong: string;
  /** structured no-trade explanation when state is NO TRADE */
  noTradeReason?: string;
  /** preferred action label */
  action: "BUY" | "SELL" | "WAIT" | "WATCH" | "NO TRADE";
}

interface TFInfo {
  tf: string;
  bias: string;
  bos?: boolean;
  choch?: boolean;
}

export class NarrativeEngine {
  build(input: MarketNarrativeInput): Narrative {
    const { symbol, price, htfBias, liquidity, displacement, imbalance, zones, premium, session, leanDirection } = input;

    // ── state determination ──
    // LIVE: leans a direction AND there's a confirmed high-quality sweep OR
    //       displacement+structure confirming an entry.
    // ARMED: most components present but missing final confirmation.
    // WATCH: a developing setup (bias + liquidity identified, no trigger yet).
    const highSweep = liquidity.current && liquidity.current.quality === "HIGH";
    const strongDisp = displacement.classification === "STRONG";
    const zoneSit = zones.zones.some((z) => z.qualityScore >= 5);
    const fvgSit = imbalance.best && imbalance.best.qualityScore >= 5 && !imbalance.best.filled;

    let state: SignalState;
    let action: Narrative["action"];
    if (leanDirection && (highSweep || (strongDisp && (zoneSit || fvgSit)))) {
      state = "LIVE";
      action = leanDirection === "BUY" ? "BUY" : "SELL";
    } else if (leanDirection && (zoneSit || fvgSit)) {
      state = "ARMED";
      action = leanDirection === "BUY" ? "WAIT" : "WAIT";
    } else if (leanDirection) {
      state = "WATCH";
      action = "WATCH";
    } else {
      state = "NO TRADE";
      action = "NO TRADE";
    }

    // ── timeframes ──
    const timeframes = input.structureByTF.map((s: TFInfo) =>
      `${s.tf.toUpperCase()}: ${s.bias.toLowerCase()}${s.choch ? " CHoCH" : s.bos ? " BOS" : ""}`
    );

    // ── liquidity ──
    const liquidityLine = liquidity.current
      ? `${liquidity.current.pool.type} liquidity at ${liquidity.current.pool.source} was swept (${liquidity.current.wickThroughAtr.toFixed(1)}× ATR${liquidity.current.displacedAway ? ", then displacement" : ""}${liquidity.current.rejected ? ", rejected" : ""}).`
      : `No confirmed sweep; ${buySellPoolSummary(liquidity)}.`;

    // ── who's in control ──
    const control = strongDisp
      ? `${displacement.direction === "BUY" ? "Buyers" : "Sellers"} in control — ${displacement.detail}.`
      : htfBias.includes("BULLISH")
        ? "Higher timeframe is bullish; buyers favored unless structure shifts."
        : htfBias.includes("BEARISH")
          ? "Higher timeframe is bearish; sellers favored unless structure shifts."
          : "Regime unclear — neutral control.";

    // ── story ──
    const story = buildStory({
      htfBias, liquidity, displacement, imbalance, zones, premium, session, leanDirection
    });

    // ── confirm / invalidate / target / wrong ──
    const dir = leanDirection ?? (htfBias.includes("BULLISH") ? "BUY" : htfBias.includes("BEARISH") ? "SELL" : null);
    const theSide = dir === "BUY" ? "bullish" : "bearish";
    const confirm = dir
      ? `Look for ${theSide} displacement into the identified ${fvgSit ? "imbalance" : zoneSit ? "zone" : "level"} and a retest holding.`
      : "Need a clear directional structure and a confirmed liquidity event.";
    const invalidate = dir
      ? `Invalidate the ${theSide} idea if price closes back beyond ${dir === "BUY" ? "the swept low / structural swing" : "the swept high / structural swing"}.`
      : "No valid idea to invalidate.";
    const target = dir
      ? `Primary target: nearest ${dir === "BUY" ? "sell-side" : "buy-side"} liquidity and the opposing structural extreme.`
      : "No target without a direction.";
    const wrong = dir
      ? `The trade is wrong if displacement fails to hold and the ${theSide} move stalls before reaching the target zone.`
      : "Avoid chasing; no location to define downside.";

    // ── headline + no-trade reason ──
    const headline = state === "NO TRADE"
      ? `${symbol}: NO TRADE`
      : `${symbol}: ${action} ${dir ?? ""}`.trim();
    const noTradeReason = state === "NO TRADE"
      ? `Daily/bias ${htfBias} but no confirmed liquidity sweep, displacement, or entry zone. ${liquidityLine} R:R not favourable. Wait for structure to develop.`
      : undefined;

    return {
      state,
      headline,
      timeframes,
      story,
      liquidity: liquidityLine,
      control,
      confirm,
      invalidate,
      target,
      wrong,
      noTradeReason,
      action
    };
  }
}

function buySellPoolSummary(l: LiquiditySweepResult): string {
  const buys = l.pools.filter((p) => p.type === "BUY-SIDE").length;
  const sells = l.pools.filter((p) => p.type === "SELL-SIDE").length;
  return `buy-side and sell-side pools are mapped (${buys}/${sells})`;
}

interface StoryInput {
  htfBias: MarketRegime;
  liquidity: LiquiditySweepResult;
  displacement: DisplacementResult;
  imbalance: { gaps: FVGPool[]; best: FVGPool | null };
  zones: { zones: OrderBlockZone[] };
  premium: PremiumDiscountResult;
  session: string;
  leanDirection: Direction | null;
}

function buildStory(inp: StoryInput): string {
  const parts: string[] = [];
  const { htfBias, liquidity, displacement, imbalance, zones, premium, session, leanDirection } = inp;

  parts.push(`HTF bias is ${htfBias.toLowerCase()}.`);

  if (liquidity.current) {
    parts.push(liquidity.current.note + (liquidity.current.displacedAway ? " Displacement followed away from the level." : ""));
  }
  if (displacement.classification === "STRONG" || displacement.classification === "EXTREME") {
    parts.push(displacement.detail + "");
  }
  if (imbalance.best && imbalance.best.qualityScore >= 5) {
    parts.push(`A ${imbalance.best.type} imbalance remains ${imbalance.best.fillPct > 0 ? `${Math.round(imbalance.best.fillPct * 100)}%` : "0%"} filled — a probable retrace magnet.`);
  }
  if (zones.zones.length) {
    const bestZone = zones.zones[0];
    parts.push(`The nearest ${bestZone.type === "demand" ? "demand (order block)" : "supply (order block)"} sits ${bestZone.distanceAtr.toFixed(1)}× ATR away (quality ${bestZone.qualityScore}/10).`);
  }
  if (premium.range) {
    parts.push(`Price is in the ${premium.range.commitment.toLowerCase()} of the range${premium.range.commitment === "DISCOUNT" && leanDirection === "BUY" ? " — preferred location for a long" : ""}.`);
  }
  if (premium.sessionPattern) {
    parts.push(`Session model: ${premium.sessionPattern}.`);
  }
  parts.push(`Session: ${session}.`);

  if (parts.length > 3) {
    return parts.slice(0, -1).join(" ") + " " + parts[parts.length - 1];
  }
  return parts.join(" ");
}