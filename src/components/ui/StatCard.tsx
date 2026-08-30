"use client";

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon?: React.ReactNode;
  variant?: "default" | "accent" | "success" | "danger" | "warning" | "info";
  className?: string;
  animate?: boolean;
  sub?: string;
}

const cardBorderStyles = {
  default: "border-terminal-border",
  accent: "border-terminal-accent/30",
  success: "border-terminal-bullBorder",
  danger: "border-terminal-bearBorder",
  warning: "border-terminal-warnBorder",
  info: "border-terminal-infoBorder",
};

const iconBgStyles = {
  default: "bg-terminal-accentBg",
  accent: "bg-terminal-accentBg",
  success: "bg-terminal-bullBg",
  danger: "bg-terminal-bearBg",
  warning: "bg-terminal-warnBg",
  info: "bg-terminal-infoBg",
};

const iconColorStyles = {
  default: "text-terminal-accent",
  accent: "text-terminal-accent",
  success: "text-terminal-bull",
  danger: "text-terminal-bear",
  warning: "text-terminal-warn",
  info: "text-terminal-info",
};

export function StatCard({
  label,
  value,
  unit,
  trend = "neutral",
  trendValue,
  icon,
  variant = "default",
  className = "",
  animate = true,
  sub,
}: StatCardProps) {
  const trendColors = {
    up: "text-terminal-bull",
    down: "text-terminal-bear",
    neutral: "text-terminal-muted",
  };

  const trendIcons = {
    up: "▲",
    down: "▼",
    neutral: "●",
  };

  const cardStyle = animate ? "animate-fade-up animate-in" : "";

  return (
    <div className={`stat-card ${cardBorderStyles[variant]} ${className} ${cardStyle}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {icon && (
              <div
                className={`p-2 rounded-xl flex-shrink-0 ${iconBgStyles[variant]} ${iconColorStyles[variant]} ${animate ? "animate-scale-in" : ""}`}
              >
                {icon}
              </div>
            )}
            <span className="stat-label truncate">{label}</span>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`stat-value text-display-sm ${animate ? "animate-count-up" : ""}`}>
              {value}
              {unit && <span className="text-body-sm font-normal text-terminal-muted ml-1">{unit}</span>}
            </span>
            {(trend !== "neutral" || trendValue) && (
              <span className={`stat-trend ${trendColors[trend]} ${animate ? "animate-pulse-soft" : ""}`}>
                <span className="animate-pulse">{trendIcons[trend]}</span>
                {trendValue && <span>{trendValue}</span>}
              </span>
            )}
          </div>
          {sub && <div className="text-[11px] text-terminal-muted mt-1 font-mono">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
