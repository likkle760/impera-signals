import type { Direction } from "../../types";
import type { Signal } from "../analysis-types";
import type { StrategyConfig } from "./strategy-config";

export interface LimitOrderBook {
  /** keep only still-resting limit orders */
  resting: Signal[];
  /** orders whose resting level has been reached/breached by price */
  triggered: Signal[];
  /** orders invalidated because price moved away / opportunity expired */
  invalidated: Signal[];
}

export interface LimitOrderSummary {
  waiting: number;
  approached: number;
  triggered: number;
  invalidated: number;
}

/**
 * LimitOrderManager — manages the lifecycle of resting limit orders for the
 * current analysis pass. A limit sits at a defined level in the direction of
 * the trade and only fills when price returns to it (pullback entry). This is
 * an in-process book mirroring the live state each scan.
 */
export class LimitOrderManager {
  constructor(private config: StrategyConfig) {}

  /**
   * Given a set of detected limit signals and the current price, classify each
   * as still resting, approached (within a tolerance band), triggered (price
   * crossed the level), or invalidated (price moved the wrong way out of range).
   */
  reconcile(limits: Signal[], price: number): LimitOrderBook {
    const book: LimitOrderBook = { resting: [], triggered: [], invalidated: [] };
    const band = Math.max(price * this.config.limit.bandPct * 0.5, price * 0.0003);

    for (const s of limits) {
      if (!s.type.includes("LIMIT")) { book.resting.push(s); continue; }
      const lvl = s.entry;
      const approached = s.direction === "BUY"
        ? price >= lvl - band && price < lvl + band
        : price <= lvl + band && price > lvl - band;
      const triggered = s.direction === "BUY" ? price >= lvl : price <= lvl;
      const invalidated = s.direction === "BUY"
        ? price < lvl - band * 6
        : price > lvl + band * 6;

      if (invalidated) book.invalidated.push(s);
      else if (triggered) book.triggered.push(s);
      else book.resting.push(s);
    }
    return book;
  }

  /** Tally counts without mutating. */
  summarize(book: LimitOrderBook): LimitOrderSummary {
    const approached = book.resting.filter((s) => s.status === "APPROACHING").length;
    return {
      waiting: book.resting.length - approached,
      approached,
      triggered: book.triggered.length,
      invalidated: book.invalidated.length
    };
  }

  directionCount(book: LimitOrderBook, direction: Direction): number {
    return book.resting.filter((s) => s.direction === direction).length;
  }
}
