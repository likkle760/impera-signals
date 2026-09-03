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

  private previousSignals = new Map<string, Signal>();

  private telegramSentThisScan = 0;
  private swingTelegramSentThisScan = 0;
  private telegramLastScanKey = "";
  private lastTelegramSentAt = 0;

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
      swingMode: settings.swingMode
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
        this.setState({ lastMarketUpdate: Date.now() });
      },
      onError: (e) => {
        this.setState({ error: e.message, connection: "lost" });
      }
    });
    await this.provider.start();
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
    this.setState({ lastScanStart: start });
    this.telegramLastScanKey = `${start}`;
    this.telegramSentThisScan = 0;
    this.swingTelegramSentThisScan = 0;
    const snapshot = this.coordinator.analyze(this.provider);

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
  }

  private updateHistory(newSignals: Signal[]): HistoryEntry[] {
    let history = [...this.state.history];
    // terminal entries we already have stay; remove active entries that no longer exist
    const activeIds = new Set(newSignals.map((s) => s.id));

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
