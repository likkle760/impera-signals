"use client";
import { useMemo, useState } from "react";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice } from "@/lib/utils";
import { DIRECTION_BG } from "@/components/ui/badges";
import {
  JournalTrade,
  JournalDirection,
  JOURNAL_SYMBOLS,
  loadJournal,
  saveJournal,
  computePnl,
  computeJournalStats,
  pnlText,
  newTradeId
} from "@/lib/engine/journal";
import { StatCard, PageHeader } from "@/components/ui";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, CalendarDays, List, Wallet, Target, Trophy, BarChart3 } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const PRESET_STRATEGIES = [
  "Market", "Buy Limit", "Sell Limit", "Scalp", "Day Trade", "Swing"
];

function ymd(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function JournalPage() {
  const [trades, setTrades] = useState<JournalTrade[]>(() => loadJournal());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [editing, setEditing] = useState<JournalTrade | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fSym, setFSym] = useState("XAUUSD");
  const [fDir, setFDir] = useState<JournalDirection>("BUY");
  const [fEntry, setFEntry] = useState("");
  const [fExit, setFExit] = useState("");
  const [fQty, setFQty] = useState("");
  const [fFees, setFFees] = useState("0");
  const [fDate, setFDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [fStrategy, setFStrategy] = useState("Market");
  const [fNotes, setFNotes] = useState("");

  const stats = useMemo(() => computeJournalStats(trades), [trades]);
  const year = new Date(cursor).getFullYear();
  const month = new Date(cursor).getMonth();

  const monthTrades = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return trades
      .filter((t) => ymd(t.openedAt).startsWith(prefix))
      .sort((a, b) => b.openedAt - a.openedAt);
  }, [trades, year, month]);

  function persist(next: JournalTrade[]) {
    setTrades(next);
    saveJournal(next);
  }

  function resetForm() {
    setEditing(null);
    setFSym("XAUUSD");
    setFDir("BUY");
    setFEntry("");
    setFExit("");
    setFQty("");
    setFFees("0");
    setFStrategy("Market");
    setFNotes("");
    setShowForm(false);
  }

  function openForm(dayTs?: number) {
    setEditing(null);
    if (dayTs) {
      const d = new Date(dayTs);
      setFDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    setShowForm(true);
  }

  function submit() {
    const entry = parseFloat(fEntry);
    if (!isFinite(entry) || entry <= 0) return;
    const qty = parseFloat(fQty) || 0;
    const fees = parseFloat(fFees) || 0;
    const date = fDate ? new Date(fDate + "T09:00:00").getTime() : Date.now();
    const open = new Date(fDate + "T09:00:00");
    const openedAt = open.getTime();
    const exitStr = fExit.trim();

    if (editing) {
      const exit = exitStr ? parseFloat(exitStr) : null;
      const closed = exit != null && isFinite(exit);
      const outcome = !closed
        ? "OPEN"
        : Math.abs(computePnl(fDir, entry, exit, qty, fees)) <= Math.max(qty * 1e-9, 1e-9) && qty > 0
          ? "BREAKEVEN"
          : computePnl(fDir, entry, exit, qty, fees) > 0
            ? "WIN"
            : "LOSS";
      const pnl = closed ? computePnl(fDir, entry, exit, qty, fees) : null;
      persist(
        trades.map((t) =>
          t.id === editing.id
            ? {
                ...editing,
                symbol: fSym,
                direction: fDir,
                entry,
                exit: closed ? exit : null,
                quantity: qty,
                fees,
                pnl,
                outcome,
                strategy: fStrategy,
                notes: fNotes,
                openedAt,
                closedAt: closed ? openedAt : null
              }
            : t
        )
      );
      resetForm();
      return;
    }

    const exit = exitStr ? parseFloat(exitStr) : null;
    const closed = exit != null && isFinite(exit);
    const rawPnl = closed ? computePnl(fDir, entry, exit, qty, fees) : 0;
    let outcome: JournalTrade["outcome"];
    if (!closed) outcome = "OPEN";
    else if (qty > 0 && Math.abs(rawPnl) <= 1e-9) outcome = "BREAKEVEN";
    else outcome = rawPnl > 0 ? "WIN" : "LOSS";
    const trade: JournalTrade = {
      id: newTradeId(),
      symbol: fSym,
      direction: fDir,
      entry,
      exit: closed ? exit : null,
      quantity: qty,
      fees,
      pnl: closed ? rawPnl : null,
      outcome,
      strategy: fStrategy,
      notes: fNotes,
      openedAt,
      closedAt: closed ? openedAt : null
    };
    persist([trade, ...trades]);
    setCursor(startOfDay(openedAt));
    resetForm();
  }

  function remove(id: string) {
    persist(trades.filter((t) => t.id !== id));
  }

  function openEdit(t: JournalTrade) {
    setEditing(t);
    setFSym(t.symbol);
    setFDir(t.direction);
    setFEntry(String(t.entry));
    setFExit(t.exit != null ? String(t.exit) : "");
    setFQty(String(t.quantity));
    setFFees(String(t.fees));
    setFStrategy(t.strategy);
    setFNotes(t.notes);
    const d = new Date(t.openedAt);
    setFDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    setShowForm(true);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];

  const dayPnl = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of trades) {
      if (t.outcome === "OPEN" || t.pnl == null) continue;
      const key = ymd(t.closedAt ?? t.openedAt);
      m[key] = (m[key] ?? 0) + t.pnl;
    }
    return m;
  }, [trades]);

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item}>
        <PageHeader
          eyebrow="TRADE JOURNAL"
          eyebrowIcon={<BookOpen className="w-3.5 h-3.5" />}
          title="Performance"
          highlight="Journal"
          description="Log your trades, track your profits, review your performance. Calendar view for daily P&L, list view for the full ledger."
          right={
            <>
              <div className="segmented">
                <button
                  onClick={() => setView("calendar")}
                  className={`segmented-item ${view === "calendar" ? "segmented-item-active" : ""}`}
                >
                  <CalendarDays className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Calendar
                </button>
                <button
                  onClick={() => setView("list")}
                  className={`segmented-item ${view === "list" ? "segmented-item-active" : ""}`}
                >
                  <List className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Ledger
                </button>
              </div>
              <button onClick={() => openForm()} className="btn btn-primary btn-sm">
                <Plus className="w-4 h-4" /> Log Trade
              </button>
            </>
          }
        />
      </motion.div>

      {/* Stats dashboard */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <StatCard label="Net P&L" value={`$${pnlText(stats.netPnl)}`} icon={<Wallet className="w-4 h-4" />} variant={stats.netPnl >= 0 ? "success" : "danger"} />
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} icon={<Target className="w-4 h-4" />} variant="accent" sub={`${stats.wins}W / ${stats.losses}L`} />
        <StatCard label="Trades" value={stats.closedTrades} icon={<BookOpen className="w-4 h-4" />} variant="info" sub={`${stats.activeTrades} open`} />
        <StatCard label="Profit Factor" value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "—"} icon={<BarChart3 className="w-4 h-4" />} variant="success" />
        <StatCard label="Expectancy" value={`$${stats.expectancy.toFixed(2)}`} icon={<Target className="w-4 h-4" />} variant={stats.expectancy >= 0 ? "success" : "danger"} />
        <StatCard label="Avg Win" value={`$${stats.avgWin.toFixed(2)}`} icon={<Trophy className="w-4 h-4" />} variant="success" />
        <StatCard label="Avg Loss" value={`$-${Math.abs(stats.avgLoss).toFixed(2)}`} icon={<Trophy className="w-4 h-4" />} variant="danger" />
        <StatCard label="Best / Worst" value={`$${stats.bestTrade.toFixed(0)} / $${stats.worstTrade.toFixed(0)}`} icon={<BarChart3 className="w-4 h-4" />} variant="accent" />
      </motion.div>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
              className="card wire card-elevated w-full max-w-lg p-5 space-y-4 shadow-elevated"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">{editing ? "Edit Trade" : "Log New Trade"}</h2>
                <button onClick={resetForm} className="modal-close relative text-terminal-muted hover:text-white text-lg leading-none">&times;</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 block">
                  <span className="panel-title block mb-1">Instrument</span>
                  <select
                    value={fSym}
                    onChange={(e) => setFSym(e.target.value)}
                    className="select py-2"
                  >
                    {JOURNAL_SYMBOLS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="panel-title block mb-1">Direction</span>
                  <div className="flex gap-1.5">
                    {(["BUY", "SELL"] as JournalDirection[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setFDir(d)}
                        className={`badge cursor-pointer border px-3 py-1 ${fDir === d ? DIRECTION_BG[d] : "bg-terminal-panel2 border-terminal-border text-terminal-muted"}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="block">
                  <span className="panel-title block mb-1">Date</span>
                  <input
                    type="date"
                    value={fDate}
                    onChange={(e) => setFDate(e.target.value)}
                    className="input py-2"
                  />
                </label>

                <label className="block">
                  <span className="panel-title block mb-1">Entry Price</span>
                  <input
                    type="number" step="any" value={fEntry}
                    onChange={(e) => setFEntry(e.target.value)}
                    placeholder="e.g. 4620.5"
                    className="input py-2 font-mono"
                  />
                </label>

                <label className="block">
                  <span className="panel-title block mb-1">Exit Price (blank = open)</span>
                  <input
                    type="number" step="any" value={fExit}
                    onChange={(e) => setFExit(e.target.value)}
                    placeholder="e.g. 4632.0"
                    className="input py-2 font-mono"
                  />
                </label>

                <label className="block">
                  <span className="panel-title block mb-1">Quantity</span>
                  <input
                    type="number" step="any" value={fQty}
                    onChange={(e) => setFQty(e.target.value)}
                    placeholder="e.g. 0.1"
                    className="input py-2 font-mono"
                  />
                </label>

                <label className="block">
                  <span className="panel-title block mb-1">Fees</span>
                  <input
                    type="number" step="any" value={fFees}
                    onChange={(e) => setFFees(e.target.value)}
                    placeholder="0"
                    className="input py-2 font-mono"
                  />
                </label>

                <label className="block col-span-2">
                  <span className="panel-title block mb-1">Strategy</span>
                  <select
                    value={fStrategy}
                    onChange={(e) => setFStrategy(e.target.value)}
                    className="select py-2"
                  >
                    {PRESET_STRATEGIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>

                <label className="block col-span-2">
                  <span className="panel-title block mb-1">Notes</span>
                  <textarea
                    value={fNotes}
                    onChange={(e) => setFNotes(e.target.value)}
                    rows={2}
                    placeholder="Why did you take this trade? What happened?"
                    className="input py-2 resize-none"
                  />
                </label>
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={resetForm} className="btn btn-ghost">Cancel</button>
                <button onClick={submit} className="btn btn-primary">{editing ? "Save Changes" : "Log Trade"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar / list */}
      {view === "calendar" ? (
        <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="card p-4 lg:col-span-2 panel-hover">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => { const d = new Date(cursor); setCursor(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime()); }} className="btn btn-ghost btn-icon w-8 h-8 px-0">‹</button>
                <span className="text-sm font-semibold text-white">{MONTHS[month]} {year}</span>
                <button onClick={() => { const d = new Date(cursor); setCursor(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()); }} className="btn btn-ghost btn-icon w-8 h-8 px-0">›</button>
              </div>
              <button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1).getTime()); }} className="btn btn-ghost btn-sm">Today</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-terminal-muted uppercase mb-1">
              {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day == null) return <div key={`e${i}`} />;
                const ts = new Date(year, month, day).getTime();
                const key = ymd(ts);
                const dayTrades = trades.filter((t) => ymd(t.openedAt) === key);
                const pnl = dayPnl[key];
                const isToday = key === ymd(Date.now());
                return (
                  <button
                    key={key}
                    onClick={() => openForm(ts)}
                    className={`min-h-[64px] rounded-lg border p-1 text-left flex flex-col gap-1 transition-all duration-200 ${
                      isToday
                        ? "border-terminal-accent/60 bg-terminal-accent/10 shadow-[0_0_16px_rgba(34,211,238,0.15)]"
                        : "border-terminal-border bg-terminal-panel2/70 hover:border-terminal-accent/40 hover:bg-terminal-panel2"
                    }`}
                  >
                    <span className="text-[11px] font-semibold text-terminal-muted">{day}</span>
                    {dayTrades.slice(0, 2).map((t) => (
                      <span key={t.id} className={`badge px-1 py-0 text-[9px] leading-none ${t.direction === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                        {t.symbol} {t.outcome === "OPEN" ? "▸" : t.pnl == null ? "" : t.pnl > 0 ? "+" : t.pnl < 0 ? "-" : "="}
                      </span>
                    ))}
                    {dayTrades.length > 2 && <span className="text-[9px] text-terminal-muted">+{dayTrades.length - 2} more</span>}
                    {pnl != null && (
                      <span className={`text-[11px] font-mono font-semibold mt-auto ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-4 panel-hover">
              <div className="panel-title mb-2">Month Performance</div>
              <div className="text-sm">
                <div className="flex justify-between py-1"><span className="text-terminal-muted">Net P&L</span><span className={`font-mono font-semibold ${monthPnl(monthTrades) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pnlText(monthPnl(monthTrades))}</span></div>
                <div className="flex justify-between py-1"><span className="text-terminal-muted">Closed</span><span className="font-mono">{monthTrades.filter((t) => t.outcome !== "OPEN").length}</span></div>
                <div className="flex justify-between py-1"><span className="text-terminal-muted">Wins</span><span className="font-mono text-emerald-400">{monthTrades.filter((t) => t.outcome === "WIN").length}</span></div>
                <div className="flex justify-between py-1"><span className="text-terminal-muted">Losses</span><span className="font-mono text-rose-400">{monthTrades.filter((t) => t.outcome === "LOSS").length}</span></div>
              </div>
            </div>

            <div className="card p-4 panel-hover">
              <div className="panel-title mb-2">Best Performing Symbols</div>
              <div className="space-y-1.5">
                {stats.byOutcome.slice(0, 5).map((s) => {
                  const total = s.wins + s.losses;
                  const wr = total ? Math.round((s.wins / total) * 100) : 0;
                  return (
                    <div key={s.symbol} className="flex items-center justify-between text-xs">
                      <span className="text-terminal-text font-medium">{s.symbol}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-terminal-muted w-8 text-right">{wr}%</span>
                        <span className="text-terminal-muted">{s.wins}W/{s.losses}L</span>
                        <span className={`font-mono ${s.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pnlText(s.pnl)}</span>
                      </span>
                    </div>
                  );
                })}
                {stats.byOutcome.length === 0 && <div className="text-xs text-terminal-muted">No closed trades yet.</div>}
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div variants={item} className="card overflow-hidden panel-hover">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Symbol</th>
                  <th>Dir</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Qty</th>
                  <th>P&L</th>
                  <th>Outcome</th>
                  <th>Strategy</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...trades].sort((a, b) => b.openedAt - a.openedAt).map((t) => (
                  <tr key={t.id}>
                    <td className="text-terminal-muted">{new Date(t.openedAt).toLocaleDateString("en-GB")}</td>
                    <td className="font-semibold text-terminal-text">{t.symbol}</td>
                    <td><span className={`badge ${DIRECTION_BG[t.direction]}`}>{t.direction}</span></td>
                    <td className="font-mono">{formatPrice(t.entry, decimalsFor(t.symbol))}</td>
                    <td className="font-mono">{t.exit != null ? formatPrice(t.exit, decimalsFor(t.symbol)) : <span className="text-terminal-muted">—</span>}</td>
                    <td className="font-mono">{t.quantity}</td>
                    <td className={`font-mono font-semibold ${t.pnl == null ? "text-terminal-muted" : t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {t.pnl == null ? "—" : pnlText(t.pnl)}
                    </td>
                    <td>
                      <span className={`badge ${
                        t.outcome === "WIN" ? "badge-success" :
                        t.outcome === "LOSS" ? "badge-danger" :
                        t.outcome === "BREAKEVEN" ? "badge-neutral" :
                        "badge-info"
                      }`}>{t.outcome}</span>
                    </td>
                    <td className="text-terminal-muted">{t.strategy}</td>
                    <td className="text-terminal-muted max-w-[200px] truncate">{t.notes || "—"}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(t)} className="btn btn-ghost btn-sm px-2 py-1">Edit</button>
                        <button onClick={() => remove(t.id)} className="btn btn-ghost btn-sm px-2 py-1 text-rose-400">Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {trades.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">◈</div>
              <div className="empty-title">No trades logged yet</div>
              <div className="empty-desc">Click &ldquo;Log Trade&rdquo; to record your first trade.</div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function monthPnl(trades: JournalTrade[]): number {
  return trades.filter((t) => t.outcome !== "OPEN" && t.pnl != null).reduce((s, t) => s + (t.pnl ?? 0), 0);
}