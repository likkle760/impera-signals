"use client";

import { motion } from "framer-motion";
import { Badge } from "./Badge";

export type LiveStatus = "live" | "connecting" | "disconnected" | "warning" | "maintenance" | "connected" | "lost" | "stale";

interface LiveIndicatorProps {
  status: LiveStatus;
  label?: string;
  size?: "sm" | "md" | "lg";
  showDot?: boolean;
  showLabel?: boolean;
  className?: string;
}

const statusConfig = {
  live: { color: "text-terminal-bull", bg: "bg-terminal-bullBg", border: "border-terminal-bullBorder", label: "LIVE", dotColor: "#22c55e" },
  connecting: { color: "text-terminal-warn", bg: "bg-terminal-warnBg", border: "border-terminal-warnBorder", label: "CONNECTING", dotColor: "#f59e0b" },
  disconnected: { color: "text-terminal-bear", bg: "bg-terminal-bearBg", border: "border-terminal-bearBorder", label: "DISCONNECTED", dotColor: "#ef4444" },
  warning: { color: "text-terminal-warn", bg: "bg-terminal-warnBg", border: "border-terminal-warnBorder", label: "WARNING", dotColor: "#f59e0b" },
  maintenance: { color: "text-terminal-muted", bg: "bg-terminal-panel", border: "border-terminal-border", label: "MAINTENANCE", dotColor: "#64748b" },
  connected: { color: "text-terminal-bull", bg: "bg-terminal-bullBg", border: "border-terminal-bullBorder", label: "LIVE", dotColor: "#22c55e" },
  lost: { color: "text-terminal-bear", bg: "bg-terminal-bearBg", border: "border-terminal-bearBorder", label: "DISCONNECTED", dotColor: "#ef4444" },
  stale: { color: "text-terminal-warn", bg: "bg-terminal-warnBg", border: "border-terminal-warnBorder", label: "STALE", dotColor: "#f59e0b" },
};

const sizeClasses = {
  sm: "px-2.5 py-1 text-[10px] gap-1.5",
  md: "px-3 py-1.5 text-[11px] gap-2",
  lg: "px-4 py-2 text-sm gap-2.5",
};

const dotSizes = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2.5 h-2.5",
};

export function LiveIndicator({
  status,
  label,
  size = "md",
  showDot = true,
  showLabel = true,
  className = "",
}: LiveIndicatorProps) {
  const config = statusConfig[status];
  const displayLabel = label ?? config.label;

  return (
    <motion.span
      className={`live-indicator ${config.bg} ${config.border} ${config.color} ${sizeClasses[size]} ${className}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {showDot && (
        <motion.span
          className={`live-dot ${dotSizes[size]}`}
          style={{ backgroundColor: config.dotColor }}
          animate={status === "live" ? { scale: [1, 1.2, 1], opacity: [1, 0.6, 1] } : status === "connecting" ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: status === "live" ? 2 : 1, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {showLabel && <span className="font-semibold whitespace-nowrap">{displayLabel}</span>}
    </motion.span>
  );
}

export function LiveStatusBar({
  status,
  lastUpdate,
  connection,
  className = "",
}: {
  status: LiveStatus;
  lastUpdate?: number;
  connection?: "connected" | "lost" | "stale";
  className?: string;
}) {
  const config = statusConfig[status];

  return (
    <motion.div
      className={`live-status-bar ${className}`}
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <motion.span
            className={`live-indicator ${config.bg} ${config.border} ${config.color} px-3 py-1.5 rounded-xl`}
            animate={status === "live" ? { boxShadow: [ "0 0 0 0 rgba(34, 197, 94, 0.4)", "0 0 20px rgba(34, 197, 94, 0.3)", "0 0 0 0 rgba(34, 197, 94, 0.4)" ] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.span
              className="live-dot w-2 h-2"
              style={{ backgroundColor: config.dotColor }}
              animate={status === "live" ? { scale: [1, 1.2, 1], opacity: [1, 0.6, 1] } : status === "connecting" ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: status === "live" ? 2 : 1, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="font-semibold whitespace-nowrap">{config.label}</span>
          </motion.span>

          {lastUpdate && (
            <span className="text-terminal-muted text-sm">
              Updated {formatRelativeTime(lastUpdate)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <LiveIndicator status={connection ?? "disconnected"} size="sm" label={connection === "connected" ? "WS Connected" : connection === "lost" ? "WS Lost" : "WS Connecting"} />
          {status === "live" && (
            <motion.div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-terminal-bullBg/50 border border-terminal-bullBorder/50" animate={{ opacity: [1, 0.7, 1] }} transition={{ duration: 2, repeat: Infinity }}>
              <span className="w-1.5 h-1.5 rounded-full bg-terminal-bull animate-pulse-live" />
              <span className="text-xs font-mono text-terminal-bull">LIVE DATA</span>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}