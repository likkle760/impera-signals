"use client";

import { forwardRef, type HTMLAttributes } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "primary" | "success" | "danger" | "warning" | "info" | "neutral" | "live" | "default";
  size?: "sm" | "md" | "lg";
  dot?: boolean;
  pulsing?: boolean;
}

const variantClasses = {
  primary: "badge badge-primary",
  success: "badge badge-success",
  danger: "badge badge-danger",
  warning: "badge badge-warning",
  info: "badge badge-info",
  neutral: "badge badge-neutral",
  live: "badge badge-primary badge-dot badge-dot-live",
  default: "badge badge-neutral",
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-[10px] gap-1",
  md: "px-2.5 py-1 text-[11px] gap-1.5",
  lg: "px-3 py-1.5 text-sm gap-2",
};

const dotColor: Record<string, string> = {
  success: "#089981",
  danger: "#f23645",
  warning: "#f59e0b",
  info: "#3b82f6",
  live: "#089981",
  primary: "#22d3ee",
  neutral: "#64748b",
  default: "#64748b",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      children,
      variant = "neutral",
      size = "md",
      dot = false,
      pulsing = false,
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    const showDot = dot || variant === "live";
    const isPulsing = pulsing || variant === "live";
    const dotBg = dotColor[variant] ?? "#64748b";

    return (
      <span
        ref={ref}
        className={`${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        style={style}
        {...props}
      >
        {showDot && (
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: dotBg,
              ...(isPulsing
                ? { animation: "badgePulse 1.5s ease-in-out infinite" }
                : {}),
            }}
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";
