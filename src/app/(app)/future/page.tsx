"use client";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice } from "@/lib/utils";
import { DIRECTION_BG, RISK_BADGE } from "@/components/ui/badges";
import { StatCard, PageHeader } from "@/components/ui";
import { motion } from "framer-motion";
import { Radar, Target, Clock, AlertTriangle, ChevronDown } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  WAITING: "bg-amber-500/15 border-amber-500/40 text-amber-400",
  APPROACHING: "bg-sky-500/15 border-sky-500/40 text-sky-300",
  TRIGGERED: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
  INVALIDATED: "bg-rose-500/15 border-rose-500/40 text-rose-400",
  EXPIRED: "bg-slate-500/15 border-slate-500/40 text-slate-300",
};

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function FuturePage() {
  const state = useMarketState();
  const futures = state.snapshot.futureOpportunities;
  const active = futures.filter((f) => f.status !== "INVALIDATED" && f.status !== "EXPIRED").length;
  const approaching = futures.filter((f) => f.status === "APPROACHING").length;
  const bestConf = futures.length ? Math.max(...futures.map((f) => f.confidence)) : 0;

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item}>
        <PageHeader
          eyebrow="FUTURE SETUPS"
          eyebrowIcon={<Radar className="w-3.5 h-3.5" />}
          title="Watchlist"
          highlight="Levels"
          description="The engine monitors price and flags levels where a setup MAY become valid. These do NOT auto-trigger until configured conditions are satisfied."
          right={
            <div className="inline-flex items-center gap-2 bg-terminal-bgElevated/60 border border-terminal-border/60 rounded-xl px-3 py-1.5 text-caption text-terminal-muted">
              <Target className="w-3.5 h-3.5 text-terminal-accent" />
              {futures.length} flagged levels
            </div>
          }
        />
      </motion.div>

      {/* Stats strip */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Flagged Levels" value={futures.length} icon={<Radar className="w-5 h-5" />} variant="accent" />
        <StatCard label="Active" value={active} icon={<Target className="w-5 h-5" />} variant="info" />
        <StatCard label="Approaching" value={approaching} icon={<AlertTriangle className="w-5 h-5" />} variant="warning" sub="price nearing zone" />
        <StatCard label="Max Confidence" value={`${bestConf}%`} icon={<Clock className="w-5 h-5" />} variant="success" />
      </motion.div>

      {futures.length === 0 ? (
        <motion.div variants={item} className="panel empty-state">
          <div className="empty-icon">◈</div>
          <div className="empty-title">No future setups detected</div>
          <div className="empty-desc">Levels will appear here as price approaches demand/supply confluences.</div>
        </motion.div>
      ) : (
        <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {futures.map((f, i) => {
            const cash = decimalsFor(f.symbol);
            const buy = f.kind.includes("BUY");
            const conf = Math.min(100, Math.max(0, f.confidence));
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.35 }}
                className="hover-lift"
              >
                <div className="card card-interactive overflow-hidden h-full" style={{ borderTopWidth: 3, borderTopColor: buy ? "#10b981" : "#f43f5e" }}>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-2 rounded-xl flex-shrink-0 ${buy ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                          <ChevronDown className={`w-4 h-4 ${buy ? "rotate-180" : ""}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-terminal-text leading-tight">{f.symbol}</div>
                          <div className="text-[11px] text-terminal-muted truncate">{f.name}</div>
                        </div>
                      </div>
                      <span className={`badge ${buy ? DIRECTION_BG.BUY : DIRECTION_BG.SELL}`}>{f.kind}</span>
                    </div>

                    {/* Confidence meter */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-terminal-muted mb-1">
                        <span>Confidence</span>
                        <span className="font-mono text-terminal-accent">{conf}%</span>
                      </div>
                      <div className="progress-bar h-1.5">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${conf}%`,
                            background: conf >= 75 ? "linear-gradient(90deg,#089981,#22c55e)" : conf >= 50 ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "linear-gradient(90deg,#3b82f6,#38bdf8)",
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="panel-section p-2">
                        <div className="text-[10px] text-terminal-muted uppercase">Watch Zone</div>
                        <div className="font-mono text-terminal-text text-xs">
                          {formatPrice(f.watchZone[0], cash)} – {formatPrice(f.watchZone[1], cash)}
                        </div>
                      </div>
                      <div className="panel-section p-2">
                        <div className="text-[10px] text-terminal-muted uppercase">Stop Loss</div>
                        <div className="font-mono text-rose-400 text-xs">{formatPrice(f.stopLoss, cash)}</div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-[10px] text-terminal-muted uppercase">Take Profits</div>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        {f.takeProfits.map((tp, i2) => (
                          <div key={i2} className="bg-terminal-panel2/80 border border-terminal-border/60 rounded-lg px-1 py-1 font-mono text-emerald-300 text-[11px] text-center tabular-nums">
                            TP{i2 + 1}: {formatPrice(tp, cash)}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-[10px] text-terminal-muted uppercase">Trigger Conditions</div>
                      <ul className="mt-1 space-y-0.5 text-[11px] text-terminal-textDim">
                        {f.triggerConditions.slice(0, 3).map((c, i3) => (
                          <li key={i3} className="flex gap-1.5">
                            <span className="text-sky-400">•</span>
                            <span className="truncate">{c}</span>
                          </li>
                        ))}
                        {f.triggerConditions.length > 3 && (
                          <li className="text-[10px] text-terminal-muted">+{f.triggerConditions.length - 3} more conditions</li>
                        )}
                      </ul>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className={`badge ${STATUS_STYLE[f.status] ?? "badge-neutral"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${f.status === "APPROACHING" ? "bg-sky-400 animate-pulse" : ""}`} />
                        {f.status}
                      </span>
                      <span className={`badge ${RISK_BADGE[f.riskLevel]}`}>{f.riskLevel}</span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-terminal-border/50">
                      <div className="text-[10px] text-terminal-muted uppercase mb-1">Reason</div>
                      <p className="text-xs text-terminal-textDim leading-snug line-clamp-2">{f.reason}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}