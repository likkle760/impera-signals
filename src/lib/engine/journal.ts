import { DEFAULT_INSTRUMENTS } from "../instruments";

export type JournalDirection = "BUY" | "SELL";
export type JournalOutcome = "WIN" | "LOSS" | "BREAKEVEN" | "OPEN";

export interface JournalTrade {
  id: string;
  symbol: string;
  direction: JournalDirection;
  entry: number;
  exit: number | null;
  quantity: number;
  fees: number;
  pnl: number | null;
  outcome: JournalOutcome;
  strategy: string;
  notes: string;
  openedAt: number;
  closedAt: number | null;
}

export const JOURNAL_SYMBOLS = DEFAULT_INSTRUMENTS
  .filter((i) => i.enabled)
  .map((i) => i.symbol);

const KEY = "impera.trade-journal.v1";

export function loadJournal(): JournalTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveJournal(trades: JournalTrade[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(trades));
  } catch {
    /* ignore */
  }
}

export function computePnl(
  direction: JournalDirection,
  entry: number,
  exit: number,
  quantity: number,
  fees: number
): number {
  if (entry <= 0) return 0;
  const raw = (exit - entry) * quantity;
  const signed = direction === "BUY" ? raw : -raw;
  return signed - fees;
}

export interface JournalStats {
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  totalPnl: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
  expectancy: number;
  activeTrades: number;
  byOutcome: { symbol: string; wins: number; losses: number; pnl: number }[];
}

export function computeJournalStats(trades: JournalTrade[]): JournalStats {
  const closed = trades.filter((t) => t.outcome !== "OPEN" && t.pnl != null);
  const wins = closed.filter((t) => t.outcome === "WIN");
  const losses = closed.filter((t) => t.outcome === "LOSS");
  const breakeven = closed.filter((t) => t.outcome === "BREAKEVEN");
  const grossProfit = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = losses.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(grossLoss) / losses.length : 0;

  const byMap = new Map<string, JournalStats["byOutcome"][number]>();
  for (const t of closed) {
    const cur = byMap.get(t.symbol) ?? { symbol: t.symbol, wins: 0, losses: 0, pnl: 0 };
    if (t.outcome === "WIN") cur.wins += 1;
    if (t.outcome === "LOSS") cur.losses += 1;
    cur.pnl += t.pnl ?? 0;
    byMap.set(t.symbol, cur);
  }
  const byOutcome = [...byMap.values()].sort((a, b) => b.pnl - a.pnl);

  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const profitFactor = grossLoss === 0
    ? (grossProfit > 0 ? Infinity : 0)
    : grossProfit / grossLoss;
  const expectancy = closed.length ? totalPnl / closed.length : 0;

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate,
    totalPnl,
    netPnl: totalPnl,
    grossProfit,
    grossLoss,
    profitFactor,
    avgWin,
    avgLoss,
    avgPnl: closed.length ? totalPnl / closed.length : 0,
    bestTrade: closed.length ? Math.max(...closed.map((t) => t.pnl ?? 0)) : 0,
    worstTrade: closed.length ? Math.min(...closed.map((t) => t.pnl ?? 0)) : 0,
    expectancy,
    activeTrades: trades.filter((t) => t.outcome === "OPEN").length,
    byOutcome
  };
}

export function pnlText(pnl: number): string {
  return `${pnl > 0 ? "+" : pnl < 0 ? "" : ""}${pnl.toFixed(2)}`;
}

export function newTradeId(): string {
  return `jt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}
