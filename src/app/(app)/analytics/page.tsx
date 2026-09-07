"use client";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { useMemo } from "react";
import { loadJournal } from "@/lib/engine/journal";
import { pipsGained, pipSizeFor } from "@/lib/engine/pips";
import { StatCard, PageHeader } from "@/components/ui";
import { motion } from "framer-motion";
import { BarChart3, PieChart, Target, Activity, Wallet, AlertTriangle } from "lucide-react";

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

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

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
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item}>
        <PageHeader
          eyebrow="PERFORMANCE LAB"
          eyebrowIcon={<BarChart3 className="w-3.5 h-3.5" />}
          title="Analytics"
          highlight="& Performance"
          description="Win rates, expectancy and pair-level breakdowns computed from recorded signals and your manual trade journal."
          right={
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5 text-caption text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" /> Simulated / recorded data
            </div>
          }
        />
      </motion.div>

      {/* Stats strip */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total Signals" value={stats.total} icon={<BarChart3 className="w-5 h-5" />} variant="accent" />
        <StatCard label="Winning" value={stats.won} icon={<Target className="w-5 h-5" />} variant="success" sub={`${stats.lost} losing`} />
        <StatCard label="Win Rate" value={`${stats.winRate}%`} icon={<PieChart className="w-5 h-5" />} variant="info" />
        <StatCard label="Avg R:R" value={`1:${stats.avgRR.toFixed(1)}`} icon={<Activity className="w-5 h-5" />} variant="warning" />
        <StatCard label="Avg Score" value={stats.avgScore} unit="/100" icon={<Target className="w-5 h-5" />} variant="info" />
        <StatCard label="Journal Pairs" value={pairStats.length} icon={<Wallet className="w-5 h-5" />} variant="accent" sub="from your journal" />
      </motion.div>

      {/* Win rate by signal type */}
      <motion.div variants={item} className="card p-5 panel-hover">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="panel-title">WIN RATE BY SIGNAL TYPE</h2>
            <p className="text-caption-xs text-terminal-muted mt-0.5">Settled signals grouped by entry style</p>
          </div>
          <PieChart className="w-4 h-4 text-terminal-accent" />
        </div>
        {TYPE_KEYS.every((k) => stats.byType[k].wins + stats.byType[k].losses === 0) ? (
          <div className="empty-state py-8">
            <div className="empty-desc">No settled signals yet. New signals appear here as they resolve to TP/SL.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
            {TYPE_KEYS.map((k) => {
              const t = stats.byType[k];
              const n = t.wins + t.losses;
              if (n === 0) return null;
              const up = t.winRate >= 50;
              return (
                <div key={k} className="panel-section p-3 relative overflow-hidden">
                  <div className="text-caption-xs font-semibold text-terminal-muted">{k.replace(" ", "\u00A0")}</div>
                  <div className={`text-xl font-bold font-mono mt-1 ${up ? "text-emerald-400" : "text-rose-400"}`}>
                    {t.winRate}%
                  </div>
                  <div className="text-[11px] text-terminal-muted mt-0.5">{t.wins}W / {t.losses}L</div>
                  <div className="mt-2 progress-bar h-1.5">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.max(4, t.winRate)}%`,
                        background: up
                          ? "linear-gradient(90deg,#089981,#22c55e)"
                          : "linear-gradient(90deg,#f23645,#f87171)",
                        boxShadow: up ? "0 0 10px rgba(8,153,129,0.5)" : "0 0 10px rgba(242,54,69,0.5)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Per-pair breakdown */}
      <motion.div variants={item} className="card p-5 panel-hover">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="panel-title">PER-PAIR BREAKDOWN</h2>
            <p className="text-caption-xs text-terminal-muted mt-0.5">Manual journal — wins, pips gained, win rate by pair &amp; direction</p>
          </div>
          <Wallet className="w-4 h-4 text-terminal-accent" />
        </div>
        {pairStats.length === 0 ? (
          <div className="empty-state py-8">
            <div className="empty-desc">No logged trades yet. Trades you log in the Journal will show up with exact pips per pair &amp; direction.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Buy W/L</th>
                  <th>Buy Pips</th>
                  <th>Sell W/L</th>
                  <th>Sell Pips</th>
                  <th>Total Pips</th>
                  <th>Trades</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {pairStats.map((p) => {
                  const total = p.buyWins + p.buyLosses + p.sellWins + p.sellLosses;
                  const wins = p.buyWins + p.sellWins;
                  const wr = total ? Math.round((wins / total) * 100) : 0;
                  return (
                    <tr key={p.symbol}>
                      <td className="font-semibold text-terminal-text">{p.symbol}</td>
                      <td>
                        <span className="text-emerald-400">{p.buyWins}W</span> / <span className="text-rose-400">{p.buyLosses}L</span>
                      </td>
                      <td className={`font-mono ${p.buyPips > 0 ? "text-emerald-400" : p.buyPips < 0 ? "text-rose-400" : "text-terminal-muted"}`}>
                        {p.buyPips > 0 ? "+" : ""}{p.buyPips.toFixed(1)}
                      </td>
                      <td>
                        <span className="text-emerald-400">{p.sellWins}W</span> / <span className="text-rose-400">{p.sellLosses}L</span>
                      </td>
                      <td className={`font-mono ${p.sellPips > 0 ? "text-emerald-400" : p.sellPips < 0 ? "text-rose-400" : "text-terminal-muted"}`}>
                        {p.sellPips > 0 ? "+" : ""}{p.sellPips.toFixed(1)}
                      </td>
                      <td className={`font-mono font-semibold ${p.totalPips > 0 ? "text-emerald-400" : p.totalPips < 0 ? "text-rose-400" : "text-terminal-muted"}`}>
                        {p.totalPips > 0 ? "+" : ""}{p.totalPips.toFixed(1)}p
                      </td>
                      <td className="text-terminal-muted">{total}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sky-300 font-mono">{wr}%</span>
                          <div className="strength-bar w-16 hidden xl:inline-block">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${wr}%`,
                                background: wr >= 50 ? "linear-gradient(90deg,#089981,#22c55e)" : "linear-gradient(90deg,#f23645,#f87171)",
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Bar charts */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <BarChart label="Signals by Asset" icon={<PieChart className="w-3.5 h-3.5" />} data={stats.byAsset} bar={bar} />
        <BarChart label="Signals by Session" icon={<Activity className="w-3.5 h-3.5" />} data={stats.bySession} bar={bar} />
        <BarChart label="Signals by Setup" icon={<Target className="w-3.5 h-3.5" />} data={stats.bySetup} bar={bar} />
      </motion.div>
    </motion.div>
  );
}

function BarChart({ label, icon, data, bar }: { label: string; icon: React.ReactNode; data: Record<string, number>; bar: (v: number, max: number) => number }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="card p-5 panel-hover">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-terminal-accent">{icon}</span>
        <h2 className="panel-title">{label.toUpperCase()}</h2>
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-terminal-muted py-6 text-center">No data yet.</div>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-16 truncate text-terminal-muted">{k}</span>
              <div className="flex-1 h-2 bg-terminal-panel2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${bar(v, max)}%`,
                    background: "linear-gradient(90deg,#22d3ee,#818cf8)",
                    boxShadow: "0 0 8px rgba(34,211,238,0.3)",
                  }}
                />
              </div>
              <span className="w-6 text-right font-mono text-terminal-text">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}