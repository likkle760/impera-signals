export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function formatPrice(value: number, decimals: number): string {
  if (!isFinite(value)) return "--";
  return value.toFixed(decimals);
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function safeRatio(a: number, b: number): number {
  if (!b || !isFinite(b) || b === 0 || !isFinite(a)) return 0;
  return Math.abs(a / b);
}

export function percentageChange(from: number, to: number): number {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

export function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

export function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return sum(arr) / arr.length;
}

export function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = mean(arr.map((v) => (v - m) * (v - m)));
  return Math.sqrt(variance);
}
