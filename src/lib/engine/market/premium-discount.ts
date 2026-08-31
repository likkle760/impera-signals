import type { Candle } from "../../types";

/**
 * Premium / Discount + Session model (§10, §11).
 *
 * Premium/Discount (§10): for a valid structural range, equilibrium = midpoint.
 * Price above equilibrium → PREMIUM (favor shorts); below → DISCOUNT (favor longs).
 * It is CONTEXTUAL evidence only — never an independent signal.
 *
 * Session model (§11): for each institutional session (Asia, London, NY) track
 * open, high, low, range, and whether we've seen the classic
 * "Asian range → London sweep → displacement" pattern. Never assumed profitable;
 * it is flaggable and backtestable.
 */
export type Commitment = "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM";

export interface RangePD {
  top: number;
  bottom: number;
  equilibrium: number;
  commitment: Commitment;
  /** relative position 0..1 of price within the range (0 = bottom) */
  position: number;
}

export interface SessionState {
  name: string;
  open: number;
  high: number;
  low: number;
  range: number;
}

export interface PremiumDiscountResult {
  range: RangePD | null;
  sessions: SessionState[];
  /** whether a recognizable sweep pattern is present (flag only) */
  sessionPattern: string | null;
}

export class PremiumDiscountEngine {
  constructor(private opts: { rangeLookback?: number } = {}) {
    this.opts = { rangeLookback: 120, ...this.opts };
  }

  detect(
    candles: Candle[],
    upto: number,
    price: number,
    atr: number,
    sessionProvider: (time: number) => string
  ): PremiumDiscountResult {
    const { rangeLookback } = this.opts!;
    const start = Math.max(0, upto - (rangeLookback ?? 120));

    // Structural range from recent swing extremes.
    let top = -Infinity;
    let bottom = Infinity;
    for (let i = start; i <= upto; i++) {
      top = Math.max(top, candles[i].high);
      bottom = Math.min(bottom, candles[i].low);
    }
    if (!isFinite(top) || !isFinite(bottom) || top - bottom <= atr * 0.5) {
      return { range: null, sessions: [], sessionPattern: null };
    }
    const equilibrium = (top + bottom) / 2;
    let commitment: Commitment = "EQUILIBRIUM";
    if (price > equilibrium * 1 + atr * 0.5) commitment = "PREMIUM";
    else if (price < equilibrium - atr * 0.5) commitment = "DISCOUNT";
    const position = Math.max(0, Math.min(1, (price - bottom) / (top - bottom)));

    // Session segmentation.
    const sessions: SessionState[] = [];
    const map = new Map<string, SessionState>();
    for (let i = start; i <= upto; i++) {
      const name = sessionProvider(candles[i].time);
      const cur = map.get(name) ?? { name, open: candles[i].open, high: candles[i].high, low: candles[i].low, range: 0 };
      cur.high = Math.max(cur.high, candles[i].high);
      cur.low = Math.min(cur.low, candles[i].low);
      map.set(name, cur);
    }
    for (const s of Array.from(map.values())) {
      s.range = s.high - s.low;
      sessions.push(s);
    }

    const sessionPattern = this.detectPattern(sessions, price);

    return { range: { top, bottom, equilibrium, commitment, position }, sessions, sessionPattern };
  }

  private detectPattern(sessions: SessionState[], price: number): string | null {
    const asia = sessions.find((s) => s.name === "ASIA");
    const london = sessions.find((s) => s.name === "LONDON");
    if (asia && london && asia.range > 0) {
      // London broke out of the Asian range.
      if (price > asia.high) return "ASIAN RANGE → LONDON BUYOUT ABOVE";
      if (price < asia.low) return "ASIAN RANGE → LONDON BREAKDOWN BELOW";
    }
    return null;
  }
}