"use client";
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, UserSettings } from "@/lib/settings";
import { useMarketStore } from "@/lib/hooks/use-market-store";

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
    <div className="max-w-2xl space-y-5">
      <div className="panel p-5">
        <h2 className="panel-title mb-4">SIGNAL FILTERS</h2>
        <Field label={`Minimum Signal Score (${s.minSignalScore}/100)`}>
          <input
            type="range" min={30} max={95} value={s.minSignalScore}
            onChange={(e) => update({ minSignalScore: +e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label="Maximum Risk Level">
          <select
            value={s.maxRiskLevel}
            onChange={(e) => update({ maxRiskLevel: e.target.value })}
            className="bg-terminal-panel border border-terminal-border rounded px-2 py-1 text-sm text-white"
          >
            {["VERY LOW", "LOW", "MEDIUM", "HIGH", "VERY HIGH"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label={`Minimum Risk/Reward (1:${s.minRiskReward.toFixed(1)})`}>
          <input
            type="range" min={1} max={3} step={0.1} value={s.minRiskReward}
            onChange={(e) => update({ minRiskReward: +e.target.value })}
            className="w-full"
          />
        </Field>
      </div>

      <div className="panel p-5">
        <h2 className="panel-title mb-4">SCANNING</h2>
        <Field label={`Scan Frequency (${s.scanSeconds}s)`}>
          <input
            type="range" min={10} max={120} step={5} value={s.scanSeconds}
            onChange={(e) => update({ scanSeconds: +e.target.value })}
            className="w-full"
          />
        </Field>
        <Toggle label="Scalping Mode" value={s.scalpingMode} onChange={(v) => update({ scalpingMode: v })} />
        <Toggle label="Day Trade Mode" value={s.dayTradeMode} onChange={(v) => update({ dayTradeMode: v })} />
        <Toggle label="Swing Mode" value={s.swingMode} onChange={(v) => update({ swingMode: v })} />
        <div className="mt-2 border-t border-terminal-border pt-2">
          <Toggle label="More Signals (High Volume)" value={s.moreSignals} onChange={(v) => update({ moreSignals: v })} />
          <p className="text-[11px] text-amber-300/80">
            Higher-frequency MARKET, SWING and LIMIT signals on gold/silver/FX. Relaxes strict
            filters (trend strength + momentum) but NEVER fades the higher-timeframe trend.
            Higher risk — choose if you want frequent setups.
          </p>
        </div>
      </div>

      <div className="panel p-5">
        <h2 className="panel-title mb-4">FUNDED ACCOUNT (PROP FIRM PACER)</h2>
        <p className="text-[11px] text-terminal-muted mb-3">
          Discipline/pacing targets for funded-eval rules — helps you trade inside them. Eligibility and profit are
          never guaranteed.
        </p>
        <Field label={`Account Size ($${s.propAccountSize})`}>
          <input
            type="range" min={1000} max={200000} step={1000} value={s.propAccountSize}
            onChange={(e) => update({ propAccountSize: +e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label={`Max Loss % (${s.propMaxLossPct}%)`}>
          <input
            type="range" min={3} max={20} step={0.5} value={s.propMaxLossPct}
            onChange={(e) => update({ propMaxLossPct: +e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label={`Daily Loss % (${s.propDailyLossPct}%)`}>
          <input
            type="range" min={1} max={10} step={0.5} value={s.propDailyLossPct}
            onChange={(e) => update({ propDailyLossPct: +e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label={`Risk % per Trade (${s.propRiskPct}%)`}>
          <input
            type="range" min={0.1} max={2} step={0.1} value={s.propRiskPct}
            onChange={(e) => update({ propRiskPct: +e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label={`Consistency Cap (${s.propConsistencyCap === 0 ? "off" : s.propConsistencyCap * 100 + "%"})`}>
          <input
            type="range" min={0} max={1} step={0.05} value={s.propConsistencyCap}
            onChange={(e) => update({ propConsistencyCap: +e.target.value })}
            className="w-full"
          />
        </Field>
      </div>

      <div className="panel p-5">
        <h2 className="panel-title mb-4">DATA & NOTIFICATIONS</h2>
        <Field label="Data Mode">
          <div className="flex gap-2">
            <button
              onClick={() => update({ dataMode: "demo" })}
              className={`badge cursor-pointer border ${s.dataMode === "demo" ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-terminal-panel border-terminal-border text-terminal-muted"}`}
            >
              DEMO
            </button>
            <button
              onClick={() => update({ dataMode: "live" })}
              className={`badge cursor-pointer border ${s.dataMode === "live" ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" : "bg-terminal-panel border-terminal-border text-terminal-muted"}`}
            >
              LIVE
            </button>
          </div>
        </Field>
        <Toggle label="Browser Notifications" value={s.notifications} onChange={(v) => update({ notifications: v })} />
        <button
          onClick={() => store.requestNotificationPermission()}
          className="btn btn-ghost text-xs mt-2"
        >
          Request notification permission
        </button>
        <div className="mt-4 border-t border-terminal-border pt-3">
          <h3 className="text-sm text-white mb-2">TELEGRAM BOT</h3>
          <Toggle label="Send new signals to Telegram bot" value={s.telegramEnabled} onChange={(v) => update({ telegramEnabled: v })} />
          <Field label={`Max signals sent per scan (${s.telegramMaxPerScan})`}>
            <input
              type="range" min={1} max={5} step={1} value={s.telegramMaxPerScan}
              onChange={(e) => update({ telegramMaxPerScan: +e.target.value })}
              className="w-full"
            />
          </Field>
          <p className="text-[11px] text-terminal-muted mt-1">
            Only market signals are pushed (not every limit order), and sends are rate-limited
            to avoid spamming your bot. Message <span className="text-emerald-300">@ImperaTradingBot</span> with{" "}
            <span className="text-emerald-300">/start</span> once so it can deliver messages to you.
          </p>
        </div>
      </div>

      <button onClick={save} className="btn btn-primary w-full">
        {saved ? "SETTINGS SAVED ✓" : "SAVE & RE-SCAN"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-sm text-terminal-muted mb-1">{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-terminal-muted">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors relative ${value ? "bg-sky-500" : "bg-terminal-border"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${value ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}
