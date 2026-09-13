"use client";
import { useEffect } from "react";
import { loadSettings } from "@/lib/settings";

/**
 * Applies the low-end "performance mode" class to <html> before/just after
 * first paint so heavy glass blur + ambient animation never render on machines
 * that opted into it. Reads the same settings key the engine uses, so toggling
 * it in Settings and reloading persists. Falls back to prefers-reduced-motion.
 */
export function PerfModeBootstrap() {
  useEffect(() => {
    let perf = false;
    try {
      perf = loadSettings().perfMode;
    } catch {
      perf = false;
    }
    if (!perf && typeof matchMedia === "function") {
      perf = matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    document.documentElement.dataset.perf = String(perf);
  }, []);
  return null;
}