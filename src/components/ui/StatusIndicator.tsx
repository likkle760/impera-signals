"use client";
import { type HTMLAttributes, forwardRef } from "react";

export interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  status: "live" | "connecting" | "disconnected" | "warning" | "maintenance";
  label?: string;
  size?: "sm" | "md" | "lg";
  showDot?: boolean;
}

const statusConfig = {
  live: { color: "bg-emerald-400", label: "LIVE", bg: "bg-emerald-500/15 border-emerald-500/30" },
  connecting: { color: "bg-amber-400", label: "CONNECTING...", bg: "bg-amber-500/15 border-amber-500/30" },
  disconnected: { color: "bg-rose-400", label: "DISCONNECTED", bg: "bg-rose-500/15 border-rose-500/30" },
  warning: { color: "bg-amber-400", label: "WARNING", bg: "bg-amber-500/15 border-amber-500/30" },
  maintenance: { color: "bg-slate-400", label: "MAINTENANCE", bg: "bg-terminal-panel2 border-terminal-border" }
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-[10px] gap-1",
  md: "px-2.5 py-1 text-[11px] gap-1.5",
  lg: "px-3 py-1.5 text-sm gap-2"
};

const dotSizes = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2.5 h-2.5"
};

export const StatusIndicator = forwardRef<HTMLSpanElement, StatusIndicatorProps>(
  ({ status, label, size = "md", showDot = true, className = "", children, ...props }, ref) => {
    const config = statusConfig[status];
    const displayLabel = label ?? config.label;

    return (
      <span
        ref={ref}
        className={`inline-flex items-center font-semibold rounded-full ${config.bg} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {showDot && (
          <span className={`${config.color} rounded-full ${dotSizes[size]} animate-pulse`} aria-hidden="true" />
        )}
        {children ?? displayLabel}
      </span>
    );
  }
);

StatusIndicator.displayName = "StatusIndicator";