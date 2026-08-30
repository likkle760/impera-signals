export const RISK_BADGE: Record<string, string> = {
  "VERY LOW": "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
  "LOW": "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
  "MEDIUM": "bg-amber-500/15 border-amber-500/40 text-amber-400",
  "HIGH": "bg-rose-500/15 border-rose-500/40 text-rose-400",
  "VERY HIGH": "bg-rose-500/15 border-rose-500/40 text-rose-400",
};

export const DIRECTION_BG = {
  BUY: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
  SELL: "bg-rose-500/15 border-rose-500/40 text-rose-400",
};

export const TREND_COLOR: Record<string, string> = {
  BULLISH: "text-emerald-400",
  BEARISH: "text-rose-400",
  NEUTRAL: "text-slate-400",
  MIXED: "text-amber-400",
};

export const CONFIDENCE_BADGE: Record<string, string> = {
  HIGH: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
  MEDIUM: "bg-amber-500/15 border-amber-500/40 text-amber-400",
  LOW: "bg-rose-500/15 border-rose-500/40 text-rose-400",
};

export function riskBadge(risk: string): string {
  return RISK_BADGE[risk] ?? RISK_BADGE.MEDIUM;
}

export function directionBadge(dir: "BUY" | "SELL"): string {
  return DIRECTION_BG[dir] ?? DIRECTION_BG.BUY;
}

export function confidenceBadge(conf: number): string {
  if (conf >= 75) return CONFIDENCE_BADGE.HIGH;
  if (conf >= 50) return CONFIDENCE_BADGE.MEDIUM;
  return CONFIDENCE_BADGE.LOW;
}