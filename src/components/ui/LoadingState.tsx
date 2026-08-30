"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export function Spinner({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims =
    size === "sm" ? "h-4 w-4" : size === "lg" ? "h-10 w-10" : "h-6 w-6";
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className={`text-terminal-accent ${className}`}
    >
      <Loader2 className={dims} />
    </motion.div>
  );
}

export function LoadingState({
  label = "Loading data…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 gap-4 ${className}`}>
      <div className="relative">
        <motion.div
          className="absolute -inset-4 rounded-full bg-terminal-accent/10 blur-xl"
          animate={{ opacity: [0.4, 0.8, 0.4], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <Spinner size="lg" />
      </div>
      <motion.p
        className="text-sm text-terminal-muted font-medium"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {label}
      </motion.p>
    </div>
  );
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-card p-5 space-y-3">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text w-2/3" />
        </div>
      ))}
    </div>
  );
}
