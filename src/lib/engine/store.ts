import type { MarketDataProvider } from "../providers/types";
import { DemoMarketDataProvider } from "../providers/demo";
import { AnalysisCoordinator, AnalysisConfig, DEFAULT_ANALYSIS_CONFIG } from "./coordinator";
import type { AnalysisSnapshot, Signal } from "./analysis-types";
import type { Timeframe } from "../types";
import { NotificationEngine, AlertEvent } from "./notification";
import { loadSettings } from "../settings";
import {
  HistoryEntry,
  loadHistory,
  saveHistory,
  upsertHistory
} from "./history";
import { sendTelegram } from "../telegram";
import { formatSignalMessage, formatWinMessage } from "./telegram-fmt";
import { refreshNewsCalendar } from "./news-feed";

export interface MarketStoreState {
  mode: "LIVE" | "DEMO";
  dataSource: "simulated-stream" | "demo-simulation";
  connection: "connected" | "lost" | "stale";
  snapshot: AnalysisSnapshot;
  history: HistoryEntry[];
  alerts: AlertEvent[];
  lastMarketUpdate: number;
  lastAnalysis: number;
  lastScanStart: number;
  instruments: string[];
  session: string;
  error: string | null;
}

const EMPTY_SNAPSHOT: AnalysisSnapshot = {
  timestamp: 0,
  instruments: {},
  signals: [],
  futureOpportunities: [],
  scanner: []
};

export class MarketStore {
  private provider: MarketDataProvider;
  private coordinator: AnalysisCoordinator;
  private notifier = new NotificationEngine();
  private config: AnalysisConfig;
  private scanTimer: ReturnType<typeof setInterval> | null = null;

  private state: MarketStoreState;
  private listeners = new Set<() => void>();
  /** Tick-only subscribers (quote clock). Never re-renders data pages — quote
   *  ticks are throttled to 1/sec and pushed ONLY here so data-heavy pages only
   *  ever re-render on real scan/analysis updates, not on every live tick. */
  private tickListeners = new Set<() => void>();

  private previousSignals = new Map<string, Signal>();
  /** Previous scan's approved live signals — the portfolio-risk layer reads
   *  this to compute open risk, correlated exposure and open-trade counts. */
  private previousApproved: Signal[] = [];

  private telegramSentThisScan = 0;
  private swingTelegramSentThisScan = 0;
  private telegramLastScanKey = "";
  private lastTelegramSentAt = 0;

  /** Quote ticks are throttled to 1/sec and pushed ONLY to the tick channel —
   *  data pages never re-render on ticks, only when the scan snapshot changes. */
  private lastQuoteStateAt = 0;
  static readonly QUOTE_STATE_THROTTLE_MS = 1000;

  constructor(provider?: MarketDataProvider, config?: Partial<AnalysisConfig>, onAlert?: (e: AlertEvent) => void) {
    const settings = loadSettings();
    this.config = {
      ...DEFAULT_ANALYSIS_CONFIG,
      ...config,
      minSignalScore: settings.minSignalScore,
      maxRiskLevel: settings.maxRiskLevel as any,
      minRiskReward: settings.minRiskReward,
      scanSeconds: settings.scanSeconds,
      scalpingMode: settings.scalpingMode,
      dayTradeMode: settings.dayTradeMode,
      swingMode: settings.swingMode,
      moreSignals: settings.moreSignals,
      minConfidence: settings.minConfidence,
      // Simulated instruments (e.g. XAUUSD whenever OANDA is unavailable/revoked)
      // always surface for observation — tagged SIM, excluded from history and
      // Telegram by updateHistory(). Real-money channels stay clean regardless.
      allowSimulatedSignals: true
    };
    this.provider = provider ?? new DemoMarketDataProvider();
    this.coordinator = new AnalysisCoordinator(this.config);
    const isLive = this.provider.isLive;
    this.state = {
      mode: isLive ? "LIVE" : "DEMO",
      dataSource: isLive ? "simulated-stream" : "demo-simulation",
      connection: "connected",
      snapshot: EMPTY_SNAPSHOT,
      history: loadHistory(),
      alerts: [],
      lastMarketUpdate: 0,
      lastAnalysis: 0,
      lastScanStart: 0,
      instruments: this.provider.getSymbols().map((s) => s.symbol),
      session: "",
      error: null
    };
    if (onAlert) this.notifier.subscribe(onAlert);
    this.notifier.subscribe((e) => {
      this.setState({ alerts: [e, ...this.state.alerts].slice(0, 100) });
    });
  }

  getState(): MarketStoreState {
    return this.state;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeTicks(fn: () => void): () => void {
    this.tickListeners.add(fn);
    return () => this.tickListeners.delete(fn);
  }

  private setState(patch: Partial<MarketStoreState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  getProvider(): MarketDataProvider {
    return this.provider;
  }

  getCandleSeries(symbol: string, timeframe: Timeframe) {
    const series = this.provider.getCandleSeries(symbol);
    return series.find((s) => s.timeframe === timeframe);
  }

  requestNotificationPermission() {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  async start() {
    this.provider.subscribe({
      onQuote: () => {
        const now = Date.now();
        if (now - this.lastQuoteStateAt < MarketStore.QUOTE_STATE_THROTTLE_MS) return;
        this.lastQuoteStateAt = now;
        // Quote ticks refresh the clock WITHOUT notifying data pages — they only
        // re-render when the scan/analysis snapshot actually changes. This is the
        // single biggest render-churn saver for low-end laptops.
        this.state = { ...this.state, lastMarketUpdate: now };
        for (const t of this.tickListeners) t();
      },
      onError: (e) => {
        this.setState({ error: e.message, connection: "lost" });
      }
    });
    await this.provider.start();
    // Warm the economic calendar from ForexFactory so signals react to real
    // news (non-blocking; keeps last-good calendar on failure).
    void refreshNewsCalendar().catch(() => {});
    this.runScan();
    const scanIntervalSec = this.config.scanSeconds ?? 30;
    this.scanTimer = setInterval(() => this.runScan(), scanIntervalSec * 1000);
  }

  stop() {
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.provider.stop();
  }

  runScan() {
    const start = Date.now();
    // Keep the news calendar warm each scan (throttled internally).
    void refreshNewsCalendar().catch(() => {});
    this.setState({ lastScanStart: start });
    this.telegramLastScanKey = `${start}`;
    this.telegramSentThisScan = 0;
    this.swingTelegramSentThisScan = 0;
    const snapshot = this.coordinator.analyze(this.provider, {
      history: this.state.history,
      previousOpen: this.previousApproved,
      now: start
    });

    const now = Date.now();
    const session = Object.values(snapshot.instruments)[0]?.session ?? "";

    this.setState({
      snapshot,
      lastAnalysis: now,
      session,
      connection: "connected"
    });

    const history = this.updateHistory(snapshot.signals);
    this.setState({ history });
    this.previousApproved = snapshot.signals.filter((s) => !s.simulated);
  }

  private updateHistory(allSignals: Signal[]): HistoryEntry[] {
    // Simulated (demo-fed) signals are for observation only. They must not
    // pollute the live ledger, win-rate analytics or Telegram.
    const newSignals = allSignals.filter((s) => !s.simulated);
    let history = [...this.state.history];
    // terminal entries we already have stay; remove active entries that no longer exist
    const activeIds = new Set(newSignals.map((s) => s.id));

    // ── RESOLVE LIVE OUTCOMES (§ history — fixed by stable signal IDs) ──
    // Previously-tracked (this-scan-old or older) live signals are compared
    // against the CURRENT price each scan. Once price crosses TP1 or the SL the
    // position settles as won/lost in the ledger. Stable bucketed ids mean the
    // same setup keeps its identity across scans — the old random ids made this
    // transition impossible, so the ledger never recorded wins/losses.
    for (const [id, prev] of this.previousSignals) {
      if (prev.status === "TP1 HIT" || prev.status === "SL HIT") continue;
      if (!activeIds.has(id)) continue; // setup no longer live — don't invent outcomes
      const inst = this.state.snapshot.instruments[prev.symbol];
      const price = inst?.price ?? prev.entry;
      const terminal = priceOutcome(prev, price);
      if (!terminal) continue;
      const won = terminal === "TP1 HIT";
      history = upsertHistory(history, {
        ...prev,
        status: terminal,
        updatedAt: Date.now(),
        outcome: won ? "won" : "lost",
        resultNote: won ? "TP1 reached" : "Stop loss hit"
      });
      if (won && loadSettings().telegramEnabled) {
        const exit = prev.takeProfits[0];
        sendTelegram(formatWinMessage(prev, exit, 0)).catch(() => {});
      }
    }

    for (const sig of newSignals) {
      const prev = this.previousSignals.get(sig.id);
      if (prev && prev.status !== sig.status) {
        if (sig.status === "TP1 HIT" || sig.status === "SL HIT") {
          const outcome: HistoryEntry["outcome"] = sig.status === "SL HIT" ? "lost" : "won";
          history = upsertHistory(history, {
            ...sig,
            outcome,
            resultNote: sig.status === "SL HIT" ? "Stop loss hit" : "TP1 reached"
          });
          // Push a Telegram win update with the realized pips when TP1 is reached,
          // so wins (and their pip totals) are easy to log and post.
          if (sig.status === "TP1 HIT" && loadSettings().telegramEnabled) {
            const exit = sig.takeProfits[0];
            sendTelegram(formatWinMessage(sig, exit, 0)).catch(() => {});
          }
        }
      }
    }

    // Add brand new signals to history
    for (const sig of newSignals) {
      if (!this.previousSignals.has(sig.id)) {
        history = upsertHistory(history, { ...sig, outcome: "pending" });
        const kind = sig.type.includes("LIMIT")
          ? (sig.direction === "BUY" ? "NEW BUY LIMIT" : "NEW SELL LIMIT")
          : (sig.direction === "BUY" ? "NEW BUY" : "NEW SELL");
        this.notifier.notify(kind as any, `${sig.symbol} ${sig.type} — Confidence ${sig.confidence}%`, `new:${sig.id}`);
        this.maybeSendTelegram(sig);
      }
    }

    this.previousSignals = new Map(newSignals.map((s) => [s.id, s]));
    saveHistory(history);
    return history;
  }

  /**
   * Push a new signal to Telegram, honouring the user's enable toggle and the
   * spam guard (cap + min interval + prefer market signals over limit orders).
   */
  private maybeSendTelegram(sig: Signal) {
    const settings = loadSettings();
    if (!settings.telegramEnabled) return;

    const isSwing = sig.type.includes("SWING");
    const isMarket = sig.type.includes("MARKET");

    // Prefer actionable market & swing signals over resting limit orders to reduce noise.
    if (!isMarket && !isSwing) return;

    const MIN_INTERVAL_MS = 60_000; // at least one minute between sends
    const maxPerScan = settings.telegramMaxPerScan ?? 1;

    // Swing gets its own notification budget so a SWING BUY/SELL is never starved
    // by a MARKET signal that fired in the same scan. Under strict swing output
    // this is rare, so each valid swing is guaranteed its own Telegram ping.
    const swingSlots = Math.max(1, maxPerScan);
    if (isSwing && this.swingTelegramSentThisScan >= swingSlots) return;
    if (!isSwing && this.telegramSentThisScan >= maxPerScan) return;

    const now = Date.now();
    if (now - this.lastTelegramSentAt < MIN_INTERVAL_MS && !isSwing) return;

    if (isSwing) this.swingTelegramSentThisScan += 1;
    else this.telegramSentThisScan += 1;
    this.lastTelegramSentAt = now;
    sendTelegram(formatSignalMessage(sig)).catch(() => {});
  }
}

/**
 * Resolve whether a live (non-limit) signal's price has reached its TP1 or SL.
 * WAITING/limit orders are never resolved from price alone (they need an entry
 * fill first), and non-numeric prices are ignored. Returns the terminal status
 * or null while the trade is still open.
 */
function priceOutcome(sig: Signal, price: number): "TP1 HIT" | "SL HIT" | null {
  if (!sig || sig.type.includes("LIMIT")) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  const entry = sig.entry;
  const sl = sig.stopLoss;
  const tp1 = sig.takeProfits?.[0];
  if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp1)) return null;
  if (sig.direction === "BUY") {
    if (price <= sl) return "SL HIT";
    if (price >= tp1) return "TP1 HIT";
  } else {
    if (price >= sl) return "SL HIT";
    if (price <= tp1) return "TP1 HIT";
  }
  return null;
}
