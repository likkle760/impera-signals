"use client";
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, UserSettings } from "@/lib/settings";
import { useMarketStore } from "@/lib/hooks/use-market-store";
import { PageHeader } from "@/components/ui";
import { motion } from "framer-motion";
import { Settings2, Radar, Landmark, BellRing, Check, Database } from "lucide-react";

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function SettingsPage() {
  const store = useMarketStore();
  const [s, setS] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setS(loadSettings());
  }, []);

  const update = (patch: Partial<UserSettings>) => {
    setS((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const save = () => {
    saveSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item}>
        <PageHeader
          eyebrow="ENGINE CONFIGURATION"
          eyebrowIcon={<Settings2 className="w-3.5 h-3.5" />}
          title="Signal Engine"
          highlight="Settings"
          description="Tune the exact filters the engine uses to decide what constitutes a trade. Saving triggers a fresh re-scan."
          right={
            <button onClick={save} className="btn btn-primary">
              {saved ? (
                <>
                  <Check className="w-4 h-4" /> SETTINGS SAVED
                </>
              ) : (
                <>
                  <Settings2 className="w-4 h-4" /> SAVE & RE-SCAN
                </>
              )}
            </button>
          }
        />
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Signal filters */}
        <section className="card p-5">
          <SectionTitle icon={<Settings2 className="w-4 h-4" />} title="Signal Filters" sub="minimum confluence to fire a trade" />
          <Field label={`Minimum Signal Score — ${s.minSignalScore}/100`}>
            <input
              type="range" min={30} max={95} value={s.minSignalScore}
              onChange={(e) => update({ minSignalScore: +e.target.value })}
              className="input-range"
            />
          </Field>
          <Field label={`Minimum Setup Confidence — ${s.minConfidence}%`}>
            <input
              type="range" min={60} max={95} value={s.minConfidence}
              onChange={(e) => update({ minConfidence: +e.target.value })}
              className="input-range"
            />
            <p className="text-xs text-terminal-muted mt-1.5">
              A trade only fires when the multi-confirmation engine reaches this grade.{" "}
              <span className="text-emerald-400">90+ = A+</span> · <span className="text-emerald-300">85+ = A</span> ·{" "}
              <span className="text-amber-300">80+ = B</span> · <span className="text-amber-400">70+ = C (default)</span> · below bar = NO TRADE.{" "}
              <span className="text-white">Current bar: {gradeBar(s.minConfidence)}</span>
            </p>
          </Field>
          <Field label="Maximum Risk Level">
            <div className="segmented flex-wrap">
              {["VERY LOW", "LOW", "MEDIUM", "HIGH", "VERY HIGH"].map((r) => (
                <button
                  key={r}
                  onClick={() => update({ maxRiskLevel: r })}
                  className={`segmented-item ${s.maxRiskLevel === r ? "segmented-item-active" : ""}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Minimum Risk/Reward — 1:${s.minRiskReward.toFixed(1)}`}>
            <input
              type="range" min={1} max={3} step={0.1} value={s.minRiskReward}
              onChange={(e) => update({ minRiskReward: +e.target.value })}
              className="input-range"
            />
          </Field>
        </section>

        {/* Scanning */}
        <section className="card p-5">
          <SectionTitle icon={<Radar className="w-4 h-4" />} title="Scanning" sub="how often the engine sweeps the market" />
          <Field label={`Scan Frequency — every ${s.scanSeconds}s`}>
            <input
              type="range" min={10} max={120} step={5} value={s.scanSeconds}
              onChange={(e) => update({ scanSeconds: +e.target.value })}
              className="input-range"
            />
          </Field>
          <div className="mt-4 space-y-1">
            <Toggle label="Scalping Mode" value={s.scalpingMode} onChange={(v) => update({ scalpingMode: v })} />
            <Toggle label="Day Trade Mode" value={s.dayTradeMode} onChange={(v) => update({ dayTradeMode: v })} />
            <Toggle label="Swing Mode" value={s.swingMode} onChange={(v) => update({ swingMode: v })} />
          </div>
          <div className="mt-4 pt-4 border-t border-terminal-border/60">
            <div className="mb-1">
              <Toggle label="More Signals (High Volume)" value={s.moreSignals} onChange={(v) => update({ moreSignals: v })} />
            </div>
            <p className="text-[11px] text-amber-300/80 leading-snug">
              Higher-frequency MARKET, SWING and LIMIT signals on gold/silver/FX. Relaxes strict filters
              (trend strength + momentum) but NEVER fades the higher-timeframe trend. Higher risk — choose if
              you want frequent setups.
            </p>
          </div>
        </section>

        {/* Prop firm */}
        <section className="card p-5">
          <SectionTitle icon={<Landmark className="w-4 h-4" />} title="Funded Account — Prop Firm Pacer" sub="discipline & pacing targets for funded-eval rules" />
          <p className="text-[11px] text-terminal-muted mb-4 leading-snug">
            Helps you trade inside typical prop-firm limits. Eligibility and profit are never guaranteed.
          </p>
          <Field label={`Account Size — $${s.propAccountSize.toLocaleString()}`}>
            <input
              type="range" min={1000} max={200000} step={1000} value={s.propAccountSize}
              onChange={(e) => update({ propAccountSize: +e.target.value })}
              className="input-range"
            />
          </Field>
          <Field label={`Max Loss — ${s.propMaxLossPct}%`}>
            <input
              type="range" min={3} max={20} step={0.5} value={s.propMaxLossPct}
              onChange={(e) => update({ propMaxLossPct: +e.target.value })}
              className="input-range"
            />
          </Field>
          <Field label={`Daily Loss — ${s.propDailyLossPct}%`}>
            <input
              type="range" min={1} max={10} step={0.5} value={s.propDailyLossPct}
              onChange={(e) => update({ propDailyLossPct: +e.target.value })}
              className="input-range"
            />
          </Field>
          <Field label={`Risk per Trade — ${s.propRiskPct}%`}>
            <input
              type="range" min={0.1} max={2} step={0.1} value={s.propRiskPct}
              onChange={(e) => update({ propRiskPct: +e.target.value })}
              className="input-range"
            />
          </Field>
          <Field label={`Consistency Cap — ${s.propConsistencyCap === 0 ? "off" : s.propConsistencyCap * 100 + "%"}`}>
            <input
              type="range" min={0} max={1} step={0.05} value={s.propConsistencyCap}
              onChange={(e) => update({ propConsistencyCap: +e.target.value })}
              className="input-range"
            />
          </Field>
        </section>

        {/* Data & notifications */}
        <section className="card p-5">
          <SectionTitle icon={<BellRing className="w-4 h-4" />} title="Data & Notifications" sub="feed source, browser alerts and the Telegram bot" />
          <Field label="Data Mode">
            <div className="segmented">
              <button
                onClick={() => update({ dataMode: "demo" })}
                className={`segmented-item ${s.dataMode === "demo" ? "segmented-item-active text-amber-300" : ""}`}
              >
                DEMO
              </button>
              <button
                onClick={() => update({ dataMode: "live" })}
                className={`segmented-item ${s.dataMode === "live" ? "segmented-item-active text-emerald-300" : ""}`}
              >
                LIVE
              </button>
            </div>
            <p className="text-[11px] text-terminal-muted mt-1.5">
              <Database className="w-3 h-3 inline mr-1" />
              {s.dataMode === "live" ? "Live OANDA feed via server proxy." : "Simulated demo candles for safe testing."}
            </p>
          </Field>
          <div className="mt-2">
            <Toggle label="Browser Notifications" value={s.notifications} onChange={(v) => update({ notifications: v })} />
          </div>
          <button
            onClick={() => store.requestNotificationPermission()}
            className="btn btn-secondary btn-sm mt-2"
          >
            <BellRing className="w-4 h-4" /> Request notification permission
          </button>

          <div className="mt-4 pt-4 border-t border-terminal-border/60">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[#229ED9] animate-pulse-live" />
              <h3 className="text-sm font-semibold text-white">TELEGRAM BOT</h3>
            </div>
            <Toggle label="Send new signals to Telegram bot" value={s.telegramEnabled} onChange={(v) => update({ telegramEnabled: v })} />
            <Field label={`Max signals per scan — ${s.telegramMaxPerScan}`}>
              <input
                type="range" min={1} max={5} step={1} value={s.telegramMaxPerScan}
                onChange={(e) => update({ telegramMaxPerScan: +e.target.value })}
                className="input-range"
              />
            </Field>
            <p className="text-[11px] text-terminal-muted mt-1 leading-snug">
              Only market signals are pushed (not every limit order), and sends are rate-limited to avoid spamming
              your bot. Message <span className="text-emerald-300">@ImperaTradingBot</span> with{" "}
              <span className="text-emerald-300">/start</span> once so it can deliver messages to you.
            </p>
          </div>
        </section>
      </motion.div>
    </motion.div>
  );
}

function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 mb-5 pb-4 border-b border-terminal-border/50">
      <div className="p-2 rounded-xl bg-terminal-accentBg text-terminal-accent border border-terminal-accent/25">{icon}</div>
      <div>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h2>
        <p className="text-caption-xs text-terminal-muted">{sub}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-sm text-terminal-muted mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function gradeBar(n: number): string {
  if (n >= 90) return "A+";
  if (n >= 85) return "A";
  if (n >= 80) return "B";
  if (n >= 70) return "C";
  return "F";
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-terminal-muted">{label}</span>
      <button
        onClick={() => onChange(!value)}
        aria-checked={value}
        role="switch"
        className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${value ? "bg-terminal-accent shadow-[0_0_14px_rgba(34,211,238,0.4)]" : "bg-terminal-border"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ${value ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}