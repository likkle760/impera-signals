"use client";
import { useMemo, useState } from "react";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice, formatTime } from "@/lib/utils";
import { DIRECTION_BG, RISK_BADGE } from "@/components/ui/badges";
import { StatCard, PageHeader } from "@/components/ui";
import { motion } from "framer-motion";
import { History, ScrollText, Target, Search, Filter } from "lucide-react";

const OUTCOMES = ["All", "pending", "won", "lost", "invalidated", "expired"];

const OUTCOME_STYLE: Record<string, string> = {
  won: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
  lost: "bg-rose-500/15 border-rose-500/40 text-rose-400",
  pending: "bg-sky-500/15 border-sky-500/40 text-sky-300",
  invalidated: "bg-amber-500/15 border-amber-500/40 text-amber-400",
  expired: "bg-slate-500/15 border-slate-500/40 text-slate-300",
};

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function HistoryPage() {
  const state = useMarketState();
  const [outcome, setOutcome] = useState("All");
  const [q, setQ] = useState("");

  const entries = useMemo(() => {
    return state.history.filter((h) => {
      if (outcome !== "All" && h.outcome !== outcome) return false;
      if (q && !h.symbol.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [state.history, outcome, q]);

  const won = state.history.filter((h) => h.outcome === "won").length;
  const lost = state.history.filter((h) => h.outcome === "lost").length;
  const settled = won + lost;
  const winRate = settled ? Math.round((won / settled) * 100) : 0;
  const pending = state.history.filter((h) => h.outcome === "pending").length;

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item}>
        <PageHeader
          eyebrow="SIGNAL HISTORY"
          eyebrowIcon={<History className="w-3.5 h-3.5" />}
          title="Signal"
          highlight="History"
          description="Every signal the engine ever generated, with outcome tracking. Filter by result and search any symbol."
          right={
            <div className="inline-flex items-center gap-2 bg-terminal-bgElevated/60 border border-terminal-border/60 rounded-xl px-3 py-1.5 text-caption text-terminal-muted">
              <ScrollText className="w-3.5 h-3.5 text-terminal-accent" />
              {state.history.length} total · {settled} settled
            </div>
          }
        />
      </motion.div>

      {/* Stats strip */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Settled Signals" value={settled} icon={<ScrollText className="w-5 h-5" />} variant="accent" />
        <StatCard label="Won" value={won} icon={<Target className="w-5 h-5" />} variant="success" />
        <StatCard label="Lost" value={lost} icon={<Filter className="w-5 h-5" />} variant="danger" />
        <StatCard label="Win Rate" value={`${winRate}%`} icon={<History className="w-5 h-5" />} variant="info" sub={`${pending} pending`} />
      </motion.div>

      {/* Filter bar */}
      <motion.div variants={item} className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-terminal-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol…"
            className="input w-56 pl-9 py-2"
          />
        </div>
        <div className="h-6 w-px bg-terminal-border/70 mx-1 hidden sm:block" />
        {OUTCOMES.map((o) => (
          <button
            key={o}
            onClick={() => setOutcome(o)}
            className={`filter-chip ${outcome === o ? "filter-chip-active" : ""} capitalize`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${o === "All" ? "bg-terminal-muted" : o === "won" ? "bg-emerald-400" : o === "lost" ? "bg-rose-400" : o === "pending" ? "bg-sky-400" : o === "invalidated" ? "bg-amber-400" : "bg-slate-400"}`} />
            {o}
            <span className="text-[10px] opacity-70">
              {o === "All" ? state.history.length : state.history.filter((h) => h.outcome === o).length}
            </span>
          </button>
        ))}
      </motion.div>

      {/* Table */}
      <motion.div variants={item} className="panel overflow-hidden panel-hover">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Type</th>
                <th>Entry</th>
                <th>SL</th>
                <th>TP1</th>
                <th>Score</th>
                <th>Risk</th>
                <th>R:R</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 200).map((h) => (
                <tr key={h.id}>
                  <td className="font-mono text-terminal-muted">{formatTime(h.createdAt)}</td>
                  <td className="font-semibold text-terminal-text">{h.symbol}</td>
                  <td>
                    <span className={`badge ${h.type.includes("BUY") ? DIRECTION_BG.BUY : DIRECTION_BG.SELL}`}>
                      <span className="text-[9px]">{h.type.includes("BUY") ? "▲" : "▼"}</span>
                      {h.type}
                    </span>
                  </td>
                  <td className="font-mono">{formatPrice(h.entry, decimalsFor(h.symbol))}</td>
                  <td className="font-mono text-rose-400">{formatPrice(h.stopLoss, decimalsFor(h.symbol))}</td>
                  <td className="font-mono text-emerald-300">{formatPrice(h.takeProfits[0], decimalsFor(h.symbol))}</td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-mono font-semibold text-sky-300">{h.confidence}</span>
                      <span className="strength-bar w-16 hidden xl:inline-block">
                        <span className="strength-fill" style={{ width: `${h.confidence}%` }}>
                          <span className="block h-full rounded-full bg-gradient-to-r from-terminal-accent to-terminal-violet opacity-80" style={{ width: "100%" }} />
                        </span>
                      </span>
                    </span>
                  </td>
                  <td><span className={`badge ${RISK_BADGE[h.riskLevel]}`}>{h.riskLevel}</span></td>
                  <td className="font-mono text-terminal-accent">1:{h.riskReward.toFixed(1)}</td>
                  <td>
                    <span className={`badge ${h.outcome === "won" ? "badge-success" : h.outcome === "lost" ? "badge-danger" : OUTCOME_STYLE[h.outcome] ?? "badge-neutral"}`}>
                      {h.outcome === "won" ? "▲" : h.outcome === "lost" ? "▼" : "•"} {h.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <div className="empty-title">No history matches</div>
            <div className="empty-desc">Signal records appear here as the engine generates them.</div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}