"use client";
import { useMarketState, useMarketStore } from "@/lib/hooks/use-market-store";
import { formatTime } from "@/lib/utils";
import { StatCard, PageHeader } from "@/components/ui";
import { motion } from "framer-motion";
import { BellRing, Radio, TrendingUp, TrendingDown, ShieldAlert } from "lucide-react";

const KIND_STYLE: Record<string, { dot: string; text: string; icon: React.ReactNode }> = {
  "NEW BUY": {
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
  },
  "NEW SELL": {
    dot: "bg-rose-400",
    text: "text-rose-400",
    icon: <TrendingDown className="w-3.5 h-3.5" />,
  },
  "NEW BUY LIMIT": {
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
  },
  "NEW SELL LIMIT": {
    dot: "bg-rose-400",
    text: "text-rose-400",
    icon: <TrendingDown className="w-3.5 h-3.5" />,
  },
  "SIGNAL TRIGGERED": {
    dot: "bg-sky-400",
    text: "text-sky-300",
    icon: <Radio className="w-3.5 h-3.5" />,
  },
  "SIGNAL INVALIDATED": {
    dot: "bg-rose-400",
    text: "text-rose-400",
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
  },
  "TP HIT": {
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
  },
  "SL HIT": {
    dot: "bg-rose-400",
    text: "text-rose-400",
    icon: <TrendingDown className="w-3.5 h-3.5" />,
  },
  "RISK INCREASED": {
    dot: "bg-amber-400",
    text: "text-amber-400",
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
  },
  "SETUP CANCELLED": {
    dot: "bg-rose-400",
    text: "text-rose-400",
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
  },
};

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function AlertsPage() {
  const state = useMarketState();
  const store = useMarketStore();
  const alerts = state.alerts;
  const newSignals = alerts.filter((a) => a.kind.startsWith("NEW")).length;
  const hits = alerts.filter((a) => a.kind === "TP HIT" || a.kind === "SL HIT").length;
  const warnings = alerts.filter((a) => a.kind.includes("INVALID") || a.kind.includes("CANCEL") || a.kind.includes("RISK")).length;

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item}>
        <PageHeader
          eyebrow="ACTIVITY ALERTS"
          eyebrowIcon={<BellRing className="w-3.5 h-3.5" />}
          title="Alert"
          highlight="Feed"
          description="Every engine event in real time — new setups, triggers, take-profits, stop-losses and risk changes."
          right={
            <button onClick={() => store.requestNotificationPermission()} className="btn btn-primary btn-sm">
              <BellRing className="w-4 h-4" /> Enable Browser Alerts
            </button>
          }
        />
      </motion.div>

      {/* Stats strip */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Events" value={alerts.length} icon={<BellRing className="w-5 h-5" />} variant="accent" />
        <StatCard label="New Setups" value={newSignals} icon={<Radio className="w-5 h-5" />} variant="success" />
        <StatCard label="TP / SL Hits" value={hits} icon={<TrendingUp className="w-5 h-5" />} variant="warning" />
        <StatCard label="Invalidations" value={warnings} icon={<ShieldAlert className="w-5 h-5" />} variant="danger" />
      </motion.div>

      <motion.div variants={item} className="panel overflow-hidden panel-hover">
        <div className="p-4 pb-3 border-b border-terminal-border/60 flex items-center justify-between">
          <span className="panel-title">LIVE EVENT TIMELINE</span>
          <span className="inline-flex items-center gap-1.5 text-caption text-terminal-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-live" /> streaming
          </span>
        </div>
        {alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <div className="empty-title">No alerts yet</div>
            <div className="empty-desc">Events will appear here as new signals are detected.</div>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-terminal-accent/40 via-terminal-border to-transparent" />
            {alerts.map((a, i) => {
              const s = KIND_STYLE[a.kind] ?? { dot: "bg-sky-400", text: "text-white", icon: <BellRing className="w-3.5 h-3.5" /> };
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.6), duration: 0.3 }}
                  className="relative flex items-start gap-4 px-6 py-3 hover:bg-terminal-panel/50 transition-colors"
                >
                  <span className={`relative z-10 mt-0.5 flex items-center justify-center flex-none rounded-full p-1.5 bg-terminal-bgElevated border border-terminal-border/70 ${s.dot}`}>
                    <span className="w-2 h-2 rounded-full" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-semibold flex items-center gap-1.5 ${s.text}`}>
                      {s.icon} {a.kind}
                    </div>
                    <div className="text-xs text-terminal-textDim mt-0.5 leading-snug">{a.message}</div>
                  </div>
                  <span className="text-[11px] text-terminal-muted font-mono flex-none">{formatTime(a.timestamp)}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}