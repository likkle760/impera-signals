"use client";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { useMemo } from "react";
import { loadJournal } from "@/lib/engine/journal";
import { pipsGained, pipSizeFor } from "@/lib/engine/pips";
import { HistoryEntry } from "@/lib/engine/history";

type SignalTypeKey = "BUY LIMIT" | "SELL LIMIT" | "MARKET BUY" | "MARKET SELL" | "SWING BUY" | "SWING SELL" | "OTHER";

const TYPE_KEYS: SignalTypeKey[] = ["MARKET BUY", "MARKET SELL", "BUY LIMIT", "SELL LIMIT", "SWING BUY", "SWING SELL", "OTHER"];

function typeKey(t: string): SignalTypeKey {
  if (t === "MARKET BUY" || t === "MARKET SELL" || t === "BUY LIMIT" || t === "SELL LIMIT" || t === "SWING BUY" || t === "SWING SELL") return t;
  if (t.includes("BUY")) return "MARKET BUY";
  if (t.includes("SELL")) return "MARKET SELL";
  return "OTHER";
}

interface TypeStat { wins: number; losses: number; winRate: number; }
interface PairStat {
  symbol: string;
  buyWins: number; buyLosses: number; sellWins: number; sellLosses: number;
  buyPips: number; sellPips: number; totalPips: number; trades: number;
}

export default function AnalyticsPage() {
  const state = useMarketState();
  const history = state.history;

  const stats = useMemo(() => {
    const settled = history.filter((h) => h.outcome === "won" || h.outcome === "lost");
    const won = history.filter((h) => h.outcome === "won").length;
    const lost = history.filter((h) => h.outcome === "lost").length;
    const winRate = settled.length ? Math.round((won / settled.length) * 100) : 0;
    const avgRR = history.length
      ? (history.reduce((a, h) => a + (h.riskReward || 0), 0) / history.length)
      : 0;
    const avgScore = history.length
      ? Math.round(history.reduce((a, h) => a + h.confidence, 0) / history.length)
      : 0;

    const byAsset: Record<string, number> = {};
    const bySession: Record<string, number> = {};
    const bySetup: Record<string, number> = {};
    for (const h of history) {
      byAsset[h.symbol] = (byAsset[h.symbol] ?? 0) + 1;
      bySession[h.session] = (bySession[h.session] ?? 0) + 1;
      bySetup[h.setupName] = (bySetup[h.setupName] ?? 0) + 1;
    }

    // Win rate by SIGNAL TYPE (buy limit / sell limit / market buy / market sell …)
    const byType: Record<SignalTypeKey, TypeStat> = Object.fromEntries(
      TYPE_KEYS.map((k) => [k, { wins: 0, losses: 0, winRate: 0 }])
    ) as Record<SignalTypeKey, TypeStat>;
    for (const h of settled) {
      const k = typeKey(h.type);
      if (h.outcome === "won") byType[k].wins += 1;
      else byType[k].losses += 1;
    }
    for (const k of TYPE_KEYS) {
      const t = byType[k];
      const n = t.wins + t.losses;
      t.winRate = n ? Math.round((t.wins / n) * 100) : 0;
    }

    return { total: history.length, won, lost, winRate, avgRR, avgScore, byAsset, bySession, bySetup, byType };
  }, [history]);

  // PER-PAIR breakdown from the manual journal (exact pips + per-direction wins)
  const pairStats = useMemo<PairStat[]>(() => {
    const trades = loadJournal().filter((t) => t.outcome !== "OPEN" && t.exit != null);
    const map = new Map<string, PairStat>();
    for (const t of trades) {
      const pip = pipSizeFor(t.symbol);
      const gained = pipsGained(t.direction, t.entry, t.exit as number, pip);
      const stat = map.get(t.symbol) ?? {
        symbol: t.symbol, buyWins: 0, buyLosses: 0, sellWins: 0, sellLosses: 0,
        buyPips: 0, sellPips: 0, totalPips: 0, trades: 0
      };
      stat.trades += 1;
      stat.totalPips += gained;
      if (t.direction === "BUY") {
        stat.buyPips += gained;
        if (t.outcome === "WIN") stat.buyWins += 1;
        else if (t.outcome === "LOSS") stat.buyLosses += 1;
      } else {
        stat.sellPips += gained;
        if (t.outcome === "WIN") stat.sellWins += 1;
        else if (t.outcome === "LOSS") stat.sellLosses += 1;
      }
      map.set(t.symbol, stat);
    }
    return [...map.values()].sort((a, b) => b.totalPips - a.totalPips);
  }, []);

  const bar = (v: number, max: number) => Math.max(4, Math.round((v / max) * 100));

  return (
    <div className="space-y-4">
      <div className="panel p-3 border-amber-500/40 bg-amber-500/5 text-xs text-amber-300">
        All figures below are <span className="font-bold">SIMULATION / RECORDED</span> from demo data and your trade journal. Win-rates are historical estimates, not predictions or guarantees.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Total Signals" value={stats.total} />
        <Stat label="Winning Signals" value={stats.won} color="text-emerald-400" />
        <Stat label="Losing Signals" value={stats.lost} color="text-rose-400" />
        <Stat label="Win Rate" value={`${stats.winRate}%`} color="text-sky-300" />
        <Stat label="Average R:R" value={`1:${stats.avgRR.toFixed(1)}`} />
        <Stat label="Avg Signal Score" value={stats.avgScore} color="text-sky-300" />
      </div>

      <div className="panel p-4">
        <div className="panel-title mb-2">WIN RATE BY SIGNAL TYPE</div>
        {TYPE_KEYS.every((k) => stats.byType[k].wins + stats.byType[k].losses === 0) ? (
          <div className="text-xs text-terminal-muted">No settled signals yet. New signals appear here as they resolve to TP/SL.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TYPE_KEYS.map((k) => {
              const t = stats.byType[k];
              const n = t.wins + t.losses;
              if (n === 0) return null;
              return (
                <div key={k} className="rounded border border-terminal-border bg-terminal-panel p-3">
                  <div className="text-xs text-terminal-muted">{k}</div>
                  <div className={`text-xl font-bold mt-1 ${t.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>{t.winRate}%</div>
                  <div className="text-[11px] text-terminal-muted">
                    {t.wins}W / {t.losses}L · {n} trades
                  </div>
                  <div className="mt-2 h-1.5 bg-terminal-panel2 rounded overflow-hidden">
                    <div className={t.winRate >= 50 ? "bg-emerald-400" : "bg-rose-400"} style={{ width: `${t.winRate}%`, height: "100%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel p-4">
        <div className="panel-title mb-2">PER-PAIR BREAKDOWN <span className="text-[10px] text-terminal-muted normal-case ml-1">(manual journal — wins, pips gained, win rate)</span></div>
        {pairStats.length === 0 ? (
          <div className="text-xs text-terminal-muted">No logged trades yet. Trades you log in the Journal will show up here with exact pips per pair &amp; direction.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-terminal-muted">
                  <th className="p-2">Pair</th>
                  <th className="p-2">Buy W/L</th>
                  <th className="p-2">Buy Pips</th>
                  <th className="p-2">Sell W/L</th>
                  <th className="p-2">Sell Pips</th>
                  <th className="p-2">Total Pips</th>
                  <th className="p-2">Trades</th>
                  <th className="p-2">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {pairStats.map((p) => {
                  const total = p.buyWins + p.buyLosses + p.sellWins + p.sellLosses;
                  const wins = p.buyWins + p.sellWins;
                  const wr = total ? Math.round((wins / total) * 100) : 0;
                  return (
                    <tr key={p.symbol} className="border-t border-terminal-border">
                      <td className="p-2 font-semibold text-white">{p.symbol}</td>
                      <td className="p-2">
                        <span className="text-emerald-400">{p.buyWins}W</span> / <span className="text-rose-400">{p.buyLosses}L</span>
                      </td>
                      <td className={`p-2 font-mono ${p.buyPips > 0 ? "text-emerald-400" : p.buyPips < 0 ? "text-rose-400" : "text-terminal-muted"}`}>
                        {p.buyPips > 0 ? "+" : ""}{p.buyPips.toFixed(1)}
                      </td>
                      <td className="p-2">
                        <span className="text-emerald-400">{p.sellWins}W</span> / <span className="text-rose-400">{p.sellLosses}L</span>
                      </td>
                      <td className={`p-2 font-mono ${p.sellPips > 0 ? "text-emerald-400" : p.sellPips < 0 ? "text-rose-400" : "text-terminal-muted"}`}>
                        {p.sellPips > 0 ? "+" : ""}{p.sellPips.toFixed(1)}
                      </td>
                      <td className={`p-2 font-mono font-semibold ${p.totalPips > 0 ? "text-emerald-400" : p.totalPips < 0 ? "text-rose-400" : "text-terminal-muted"}`}>
                        {p.totalPips > 0 ? "+" : ""}{p.totalPips.toFixed(1)}p
                      </td>
                      <td className="p-2 text-terminal-muted">{total}</td>
                      <td className="p-2 font-semibold text-sky-300">{wr}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BarChart label="Signals by Asset" data={stats.byAsset} bar={bar} />
        <BarChart label="Signals by Session" data={stats.bySession} bar={bar} />
        <BarChart label="Signals by Setup Type" data={stats.bySetup} bar={bar} />
      </div>
    </div>
  );
}

function Stat({ label, value, color = "text-white" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="panel p-4">
      <div className="panel-title">{label.toUpperCase()}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function BarChart({ label, data, bar }: { label: string; data: Record<string, number>; bar: (v: number, max: number) => number }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="panel p-4">
      <div className="panel-title mb-2">{label.toUpperCase()}</div>
      {entries.length === 0 ? (
        <div className="text-xs text-terminal-muted">No data yet.</div>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-16 truncate text-terminal-muted">{k}</span>
              <div className="flex-1 h-2 bg-terminal-panel2 rounded overflow-hidden">
                <div className="h-full bg-sky-500" style={{ width: `${bar(v, max)}%` }} />
              </div>
              <span className="w-6 text-right font-mono text-white">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
