"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * LiveValue renders a number that updates in place with a subtle flash when
 * the value changes direction (green for up, red for down). It uses a stable
 * key so React does NOT remount the whole tree — only the text swaps with a
 * lightweight fade, avoiding full-page re-renders on 1-second live updates.
 */
export function LiveValue({
  value,
  decimals = 2,
  className = "",
  prefix = "",
  suffix = "",
  format,
}: {
  value: number;
  decimals?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  format?: (v: number) => string;
}) {
  const prevRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [display, setDisplay] = useState<string>("");

  useEffect(() => {
    const prev = prevRef.current;
    const nextText = format ? format(value) : value.toFixed(decimals);
    if (prev === null) {
      setDisplay(nextText);
    } else if (prev !== value) {
      setFlash(value > prev ? "up" : "down");
      setDisplay(nextText);
      const t = setTimeout(() => setFlash(null), 900);
      return () => clearTimeout(t);
    }
    prevRef.current = value;
  }, [value, decimals, format]);

  const flashClass =
    flash === "up" ? "animate-live-flash-up" : flash === "down" ? "animate-live-flash-down" : "";

  return (
    <span className={`${className} ${flashClass} rounded transition-colors duration-300`} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

/**
 * AnimatedNumber smoothly interpolates a value toward a target using
 * framer-motion's transform tween — used for stat counters that count up.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
  duration = 1.2,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = { current: display };
    const target = value;
    if (controls.current === target) return;
    const start = performance.now();
    const startVal = controls.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      const next = startVal + (target - startVal) * eased;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/**
 * FadeSwap — minimal inline text swap that fades out/in instead of remounting.
 * Useful for relative timestamps ("Just now", "3s ago", etc.).
 */
export function FadeSwap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [current, setCurrent] = useState(children);

  useEffect(() => {
    setCurrent(children);
  }, [children]);

  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={String(current)}
        className={className}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {current}
      </motion.span>
    </AnimatePresence>
  );
}
