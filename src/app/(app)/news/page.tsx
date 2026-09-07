"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, Radio, RefreshCw, Zap, Globe2 } from "lucide-react";

interface NewsRow {
  title: string;
  time: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  currencies: string[];
  forecast?: string;
  previous?: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
}

const IMPACT_STYLE: Record<string, string> = {
  HIGH: "bg-rose-500/15 border-rose-500/50 text-rose-400",
  MEDIUM: "bg-amber-500/15 border-amber-500/50 text-amber-400",
  LOW: "bg-slate-500/15 border-slate-500/50 text-slate-400",
};
const IMPACT_DOT: Record<string, string> = {
  HIGH: "bg-rose-500",
  MEDIUM: "bg-amber-500",
  LOW: "bg-slate-500",
};
const DIR_COLOR: Record<string, string> = {
  BULLISH: "text-emerald-400",
  BEARISH: "text-rose-400",
  NEUTRAL: "text-slate-400",
};

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function NewsPage() {
  const [rows, setRows] = useState<NewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) setRows(data.events ?? []);
      else setError(data?.error ?? "News feed unavailable");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 30000);
    const r = setInterval(load, 5 * 60 * 1000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return rows;
    return rows.filter((r) => r.impact === filter);
  }, [rows, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, NewsRow[]>();
    for (const r of filtered) {
      const d = new Date(r.time);
      const key = d.toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()]
      .map(([k, v]) => ({ day: k, events: v }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [filtered]);

  const highCount = useMemo(() => rows.filter((r) => r.impact === "HIGH").length, [rows]);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  const dayLabel = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };
  const countdown = (iso: string) => {
    const diff = new Date(iso).getTime() - now;
    if (diff <= 0) return "NOW";
    const m = Math.floor(diff / 60000);
    if (m < 60) return `in ${m}m`;
    const h = Math.floor(m / 60);
    return `in ${h}h ${m % 60}m`;
  };
  const isUpcoming = (iso: string) => new Date(iso).getTime() >= now - 60 * 60 * 1000;

  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const c of r.currencies) set.add(c);
    return [...set].sort();
  }, [rows]);

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div variants={item} className="relative overflow-hidden rounded-3xl panel border-terminal-border/50 p-6 sm:p-8">
        <div className="absolute inset-0 hero-grid" />
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-terminal-accent/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="badge badge-accent mb-3">
              <Radio className="w-3 h-3 mr-1" /> FOREX FACTORY
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Economic <span className="gradient-text">News Calendar</span>
            </h1>
            <p className="text-terminal-muted mt-2 max-w-xl text-sm">
              Live high-impact economic releases via ForexFactory. Fresh entries are
              automatically blacked out around events in red to protect your stop.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="panel-section px-4 py-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-terminal-muted">High Impact</div>
              <div className="font-mono text-2xl font-bold text-terminal-bull">{highCount}</div>
            </div>
            <button
              onClick={() => load()}
              className="btn btn-outline btn-sm"
              title="Refresh calendar"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={item} className="flex flex-wrap items-center gap-2">
        {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`filter-chip ${filter === f ? "active" : ""}`}
          >
            {f === "ALL" ? "All" : f}
          </button>
        ))}
        <div className="flex-1" />
        <div className="text-[11px] text-terminal-muted flex items-center gap-1.5">
          <Globe2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {currencies.map((c) => c).join(" · ")}
          </span>
          <span className="sm:hidden">{currencies.length} currencies</span>
        </div>
      </motion.div>

      {/* Body */}
      {loading && rows.length === 0 ? (
        <motion.div variants={item} className="panel p-10 text-center text-terminal-muted text-sm">
          Loading economic calendar…
        </motion.div>
      ) : error && rows.length === 0 ? (
        <motion.div variants={item} className="panel p-10 text-center">
          <div className="text-rose-400 text-sm">{error}</div>
          <div className="text-terminal-muted text-xs mt-2">Showing static fallback once available.</div>
        </motion.div>
      ) : grouped.length === 0 ? (
        <motion.div variants={item} className="panel p-10 text-center text-terminal-muted text-sm">
          No events match this filter.
        </motion.div>
      ) : (
        grouped.map((g) => (
          <motion.div key={g.day} variants={item} className="panel border-terminal-border/50">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-terminal-border/40">
              <Calendar className="w-4 h-4 text-terminal-accent" />
              <span className="text-sm font-semibold">{dayLabel(g.day)}</span>
              <span className="text-[10px] text-terminal-muted uppercase tracking-wider ml-auto">
                {g.events.length} events
              </span>
            </div>
            <div className="divide-y divide-terminal-border/30">
              {g.events.map((e, i) => (
                <div key={`${e.title}-${i}`} className="px-5 py-3 flex flex-wrap items-center gap-3">
                  {/* time + countdown */}
                  <div className="w-24 flex flex-col">
                    <span className="font-mono text-sm font-semibold">{fmt(e.time)}</span>
                    <span
                      className={`text-[10px] font-medium ${
                        new Date(e.time).getTime() >= now ? (new Date(e.time).getTime() - now < 60 * 60 * 1000 ? "text-terminal-accent" : "text-terminal-muted") : "text-terminal-muted"
                      }`}
                    >
                      {countdown(e.time)}
                    </span>
                  </div>
                  {/* impact */}
                  <span className={`badge ${IMPACT_STYLE[e.impact]} w-16 justify-center`}>{e.impact}</span>
                  {/* title */}
                  <span className={`flex-1 text-sm font-medium ${isUpcoming(e.time) ? "" : "opacity-50"}`}>
                    {e.title}
                  </span>
                  {/* currencies */}
                  <span className="flex gap-1">
                    {e.currencies.map((c) => (
                      <span key={c} className="badge badge-neutral text-[10px]">{c}</span>
                    ))}
                  </span>
                  {/* expected direction */}
                  <span className={`text-[11px] font-semibold uppercase ${DIR_COLOR[e.direction]}`}>
                    {e.direction}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        ))
      )}

      {/* Footnote */}
      <motion.div variants={item} className="text-center text-[11px] text-terminal-muted">
        <Zap className="w-3 h-3 inline mr-1 text-terminal-accent" />
        Data sourced from ForexFactory weekly feed. Times in UTC. Forecast/previous may be shown when available.
      </motion.div>
    </motion.div>
  );
}
