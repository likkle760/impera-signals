"use client";
import { useEffect } from "react";
import { loadSettings } from "@/lib/settings";

/** Weak-machine criteria: auto-enable perf mode instead of waiting for the
 *  user to notice the lag. 4 or fewer cores (or low device memory) → heavy
 *  glass blur + ambient animation are the first thing cut. */
function isWeakDevice(): boolean {
  try {
    const nc = navigator.hardwareConcurrency;
    if (typeof nc === "number" && nc > 0 && nc <= 4) return true;
    const dm = (navigator as { deviceMemory?: number }).deviceMemory;
    if (typeof dm === "number" && dm > 0 && dm <= 4) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Applies the low-end "performance mode" class to <html> before/just after
 * first paint so heavy glass blur + ambient animation never render on machines
 * that opted into it. Reads the same settings key the engine uses, so toggling
 * it in Settings and reloading persists. Falls back to prefers-reduced-motion,
 * then auto-enables on weak hardware (≤4 cores / ≤4GB device memory).
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
    if (!perf) perf = isWeakDevice();
    document.documentElement.dataset.perf = String(perf);
  }, []);
  return null;
}