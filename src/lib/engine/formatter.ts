import type { Signal } from "./analysis-types";
import { formatPrice } from "../utils";

export class SignalFormatter {
  format(signal: Signal, decimals: number): string {
    const dir = signal.direction;
    const emoji = dir === "BUY" ? "🟢" : "🔴";
    const word = dir === "BUY" ? "LONG" : "SHORT";
    const lines: string[] = [
      "IMPERA SIGNALS V1",
      "",
      `${emoji} ${signal.symbol} ${word} — ${signal.type}`,
      ""
    ];
    const cash = decimals;
    const e = formatPrice(signal.entry, cash);
    const z0 = formatPrice(signal.entryZone[0], cash);
    const z1 = formatPrice(signal.entryZone[1], cash);
    const sl = formatPrice(signal.stopLoss, cash);
    const t1 = formatPrice(signal.takeProfits[0], cash);
    const t2 = formatPrice(signal.takeProfits[1], cash);
    const t3 = formatPrice(signal.takeProfits[2], cash);

    lines.push(`Entry: ${z0} - ${z1}`);
    lines.push(`SL: ${sl}`);
    lines.push(`TP1: ${t1} - TP2: ${t2} - TP3: ${t3}`);
    lines.push("");
    lines.push(`Risk: ${signal.riskLevel}`);
    lines.push(`Confidence: ${signal.confidence}%`);
    lines.push(`R:R: 1:${signal.riskReward.toFixed(1)}`);
    lines.push("");
    lines.push(`Setup: ${signal.setupName}`);
    lines.push(`Trend: ${signal.trendLabel}`);
    lines.push(`Timeframes: ${signal.timeframes.join(" / ")}`);
    lines.push("");
    lines.push(`Reason: ${signal.reason}`);
    lines.push("");
    lines.push("⚠️ Analysis only. Manage risk appropriately.");
    return lines.join("\n");
  }
}
