"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { LiveIndicator } from "./LiveIndicator";

interface SignalGridProps {
  signals: any[];
  decimalsFor: (symbol: string) => number;
  className?: string;
  emptyMessage?: string;
}

export function SignalGrid({
  signals,
  decimalsFor,
  className = "",
  emptyMessage = "NO HIGH-QUALITY SETUP — markets are being continuously monitored.",
}: SignalGridProps) {
  return (
    <motion.div
      className={`signal-grid ${className}`}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.08, delayChildren: 0.1 },
        },
      }}
    >
      {signals.length === 0 ? (
        <motion.div
          className="panel p-10 text-center col-span-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="text-5xl mb-3"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
          >
            ◈
          </motion.div>
          <p className="text-terminal-muted">{emptyMessage}</p>
        </motion.div>
      ) : (
        signals.map((signal, index) => (
          <motion.div
            key={signal.id}
            custom={index}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <SignalCardWrapper signal={signal} decimals={decimalsFor(signal.symbol)} />
          </motion.div>
        ))
      )}
    </motion.div>
  );
}

function SignalCardWrapper({ signal, decimals }: { signal: any; decimals: number }) {
  const direction = signal.direction;
  const isLong = direction === "BUY";
  const dirBorder = isLong ? "border-terminal-bullBorder" : "border-terminal-bearBorder";
  const dirBg = isLong ? "bg-terminal-bullBg/30" : "bg-terminal-bearBg/30";
  const dirColor = isLong ? "text-terminal-bull" : "text-terminal-bear";

  return (
    <motion.div
      className={`signal-card-wrapper panel overflow-hidden ${dirBorder} ${dirBg}`}
      style={{ borderTopWidth: 3, borderTopColor: isLong ? "#22c55e" : "#ef4444" }}
      layout
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <motion.div
              className={`flex items-center justify-center w-12 h-12 rounded-xl ${isLong ? "bg-terminal-bullBg" : "bg-terminal-bearBg"} ${dirColor}`}
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              <span className="font-bold text-xl">{isLong ? "▲" : "▼"}</span>
            </motion.div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <motion.span
                  className={`font-mono text-xl font-bold ${dirColor}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {isLong ? "LONG" : "SHORT"}
                </motion.span>
                <Badge variant={isLong ? "success" : "danger"} size="sm">
                  CONF {signal.confidence}
                </Badge>
                <Badge variant="info" size="sm">Grade {signal.confidence >= 85 ? "A+" : signal.confidence >= 70 ? "A" : signal.confidence >= 55 ? "B" : "C"}</Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-terminal-muted mt-1">
                <span className="font-mono text-white">{signal.symbol}</span>
                <span className="text-terminal-border">•</span>
                <span>{signal.strategy}</span>
                <span className="text-terminal-border">•</span>
                <span>{signal.session}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="stat-trend text-terminal-accent font-mono text-sm">
              R:R 1:{signal.riskReward.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Price Levels Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4 pt-3 border-t border-terminal-border/50">
          <div className="space-y-1">
            <span className="text-caption text-terminal-muted">ENTRY</span>
            <div className="font-mono text-xl font-semibold tabular-nums text-white">
              {signal.entryZone ? `${signal.entryZone[0].toFixed(decimals)} – ${signal.entryZone[1].toFixed(decimals)}` : signal.entry.toFixed(decimals)}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-caption text-terminal-muted">STOP LOSS</span>
            <div className="font-mono text-xl font-semibold tabular-nums text-terminal-bear">{signal.stopLoss.toFixed(decimals)}</div>
            <span className="text-caption text-terminal-muted">
              {Math.abs(signal.entry - signal.stopLoss).toFixed(decimals)} pts risk
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-caption text-terminal-muted">DISTANCE</span>
            <div className="font-mono text-xl font-semibold tabular-nums text-terminal-muted">
              {Math.abs(signal.entry - signal.stopLoss).toFixed(decimals)}
            </div>
          </div>
        </div>

        {/* Take Profits */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-caption text-terminal-muted">TAKE PROFITS</span>
            <span className="font-mono text-sm text-terminal-muted">R:R {signal.riskReward.toFixed(2)}:1</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {signal.takeProfits.map((tp: number, i: number) => {
              const riskAmount = Math.abs(signal.entry - signal.stopLoss);
              const tpRisk = Math.abs(tp - signal.entry) / riskAmount;
              return (
                <motion.div
                  key={i}
                  className={`p-3 rounded-xl font-mono text-sm tabular-nums text-terminal-bull ${i === 0 ? "bg-terminal-bullBg/50 border border-terminal-bullBorder/30" : "bg-terminal-panel2 border border-terminal-border/30"}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 * i }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-caption text-terminal-muted">TP{i + 1}</span>
                    <span className={`text-caption ${i === 0 ? "text-terminal-bull" : "text-terminal-muted"}`}>{tpRisk.toFixed(2)}R</span>
                  </div>
                  <div className="font-semibold">{tp.toFixed(decimals)}</div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Market Context */}
        <div className="grid grid-cols-2 gap-3 mb-4 pt-3 border-t border-terminal-border/50">
          <div className="space-y-1">
            <span className="text-caption text-terminal-muted">CURRENT TREND</span>
            <div className="flex items-center gap-2">
              <span className={`font-mono font-semibold ${signal.trend === "BULLISH" ? "text-terminal-bull" : signal.trend === "BEARISH" ? "text-terminal-bear" : "text-terminal-muted"}`}>{signal.trend}</span>
              <span className="text-caption text-terminal-muted">Short-term</span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-caption text-terminal-muted">HTF BIAS</span>
            <div className="flex items-center gap-2">
              <span className={`font-mono font-semibold ${signal.higherTimeframeBias === "BULLISH" ? "text-terminal-bull" : signal.higherTimeframeBias === "BEARISH" ? "text-terminal-bear" : "text-terminal-muted"}`}>{signal.higherTimeframeBias}</span>
              <span className="text-caption text-terminal-muted">Multi-TF</span>
            </div>
          </div>
        </div>

        {/* Confirmations */}
        {signal.confirmations?.length > 0 && (
          <motion.div
            className="pt-3 border-t border-terminal-border/50"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-caption text-terminal-muted">SIGNAL CONFLUENCE</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-terminal-muted">
                  {signal.confirmations.filter((c: any) => c.passed).length} / {signal.confirmations.length}
                </span>
                <div className="h-2 w-24 bg-terminal-panel2 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-terminal-accent rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(signal.confirmations.filter((c: any) => c.passed).length / signal.confirmations.length) * 100}%` }}
                    transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1], delay: 0.3 }}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {signal.confirmations.map((c: any) => (
                <ConfirmationRow key={c.id} confirmation={c} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Timeframe Bias */}
        {signal.timeframeAnalysis?.length > 0 && (
          <motion.div
            className="pt-3 border-t border-terminal-border/50"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <span className="text-caption text-terminal-muted mb-3 block">TIMEFRAME ALIGNMENT</span>
            <div className="grid grid-cols-6 gap-2">
              {signal.timeframeAnalysis.map((tf: any) => {
                const biasColors = {
                  BULLISH: { text: "text-terminal-bull", bg: "bg-terminal-bullBg/50", border: "border-terminal-bullBorder/30", icon: "▲" },
                  BEARISH: { text: "text-terminal-bear", bg: "bg-terminal-bearBg/50", border: "border-terminal-bearBorder/30", icon: "▼" },
                  NEUTRAL: { text: "text-terminal-muted", bg: "bg-terminal-panel2", border: "border-terminal-border/30", icon: "—" },
                  PULLBACK: { text: "text-terminal-warn", bg: "bg-terminal-warnBg/50", border: "border-terminal-warnBorder/30", icon: "↷" },
                  CHoCH_BULLISH: { text: "text-terminal-bull", bg: "bg-terminal-bullBg/50", border: "border-terminal-bullBorder/30", icon: "↑" },
                  CHoCH_BEARISH: { text: "text-terminal-bear", bg: "bg-terminal-bearBg/50", border: "border-terminal-bearBorder/30", icon: "↓" },
                };
                const bc = biasColors[tf.bias as keyof typeof biasColors] || biasColors.NEUTRAL;
                return (
                  <motion.div
                    key={tf.timeframe}
                    className={`p-2 rounded-xl text-center ${bc.bg} border ${bc.border}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 * (signal.timeframeAnalysis.indexOf(tf)) }}
                  >
                    <div className="font-mono text-xs text-terminal-muted">{tf.timeframe}</div>
                    <div className={`font-mono font-semibold text-sm ${bc.text}`}>{tf.bias.replace("CHoCH_", "").replace("_BULLISH", "").replace("_BEARISH", "")}</div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function ConfirmationRow({ confirmation }: { confirmation: any }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="group">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-terminal-panel2 transition-colors text-left"
      >
        <motion.span
          className={`w-2 h-2 rounded-full ${confirmation.passed ? "bg-terminal-bull" : "bg-terminal-bear"}`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        />
        <span className="font-mono text-sm text-white flex-1 text-left">{confirmation.name}</span>
        <Badge variant={confirmation.passed ? "success" : "danger"} size="sm" className="shrink-0">
          {confirmation.timeframe}
        </Badge>
        <motion.svg
          className="w-4 h-4 text-terminal-muted transition-transform duration-200"
          animate={{ rotate: isOpen ? 180 : 0 }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>
      {isOpen && (
        <motion.div
          className="mt-2 ml-8 pl-3 border-l border-terminal-border/30"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
        >
          <p className="text-sm text-terminal-muted py-2">{confirmation.description}</p>
        </motion.div>
      )}
    </div>
  );
}