import { DEFAULT_INSTRUMENTS } from "./instruments";

const DECIMALS: Record<string, number> = Object.fromEntries(
  DEFAULT_INSTRUMENTS.map((i) => [i.symbol, i.baseDecimals])
);

export function decimalsFor(symbol: string): number {
  return DECIMALS[symbol] ?? 2;
}

export function instrumentName(symbol: string): string {
  return DEFAULT_INSTRUMENTS.find((i) => i.symbol === symbol)?.name ?? symbol;
}
