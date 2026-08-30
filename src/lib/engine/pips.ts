import { DEFAULT_INSTRUMENTS } from "../instruments";
import type { Instrument } from "../types";
import type { Signal } from "./analysis-types";

const PIP_BY_SYMBOL = new Map<string, number>(
  DEFAULT_INSTRUMENTS.map((i) => [i.symbol, i.pipSize])
);

export function pipSizeFor(symbol: string): number {
  return PIP_BY_SYMBOL.get(symbol) ?? 0.0001;
}

export function instrumentFor(symbol: string): Instrument | undefined {
  return DEFAULT_INSTRUMENTS.find((i) => i.symbol === symbol);
}

/** Distance between two prices in pips (always positive). */
export function pipsBetween(a: number, b: number, pipSize: number): number {
  if (!pipSize || pipSize <= 0 || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs(a - b) / pipSize;
}

/** Pips from a market entry to a target price, signed by direction (win = +). */
export function pipsGained(
  direction: "BUY" | "SELL",
  entry: number,
  exit: number,
  pipSize: number
): number {
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || pipSize <= 0) return 0;
  const raw = (exit - entry) / pipSize;
  return direction === "BUY" ? raw : -raw;
}

/** Pips from the entry to each take-profit level for a signal. */
export function pipsToTargets(sig: Signal): number[] {
  const pip = pipSizeFor(sig.symbol);
  return sig.takeProfits.map((tp) =>
    Number(isFinite(tp) && isFinite(sig.entry) ? Math.abs(tp - sig.entry) / pip : 0)
  );
}

/** Convenience for telegram / UI formatting. */
export function fmtPips(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}p`;
}
