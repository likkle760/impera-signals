# IMPERA SIGNALS V1

An intelligent market scanner that continuously watches **forex, metals, indices and futures** and flags high-confluence **scalping** and **day-trading** setups as they develop.

> **Important:** Impera Signals V1 is a **probability-based market analysis tool**. It does **not** guarantee trades or profits. Every opportunity is presented with a confidence score, a risk classification, and clear "waiting for confirmation" states. Use it to identify opportunities — never as a promise of outcomes.

---

## Quick Start

### Requirements

- Node.js 20+
- npm

### Install & run (Demo Mode — no API keys needed)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app boots in **DEMO MODE** by default, generating simulated tick data so every part of the UI is fully testable. The top bar clearly shows **DEMO** — the app never presents simulated data as live.

### Production build

```bash
npm run build
npm start
```

### Tests

```bash
npm run test     # vitest: indicator + engine + integration tests
npm run typecheck
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in what you need. **Never commit real credentials.**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis (caching / real-time fan-out) |
| `MARKET_DATA_PROVIDER` | `demo` (default) or the id of a live provider |
| `MARKET_DATA_API_KEY` | API key for a live market-data provider |
| `MARKET_DATA_API_URL` | REST base URL for a live provider |
| `MARKET_DATA_WS_URL` | WebSocket URL for streaming quotes |
| `NEWS_API_KEY` / `NEWS_API_URL` | Economic-calendar / news provider |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Telegram notification bot |
| `DISCORD_WEBHOOK_URL` | Discord notification webhook |

If a news key is not configured, the UI shows **NEWS DATA UNAVAILABLE** rather than pretending data exists.

---

## Connecting a Market-Data Provider

Market data is abstracted behind the `MarketDataProvider` interface
(`src/lib/providers/types.ts`):

```ts
interface MarketDataProvider {
  getSymbols(): Instrument[];
  getQuote(symbol): Quote | undefined;
  getHistoricalCandles(symbol, timeframe, limit): Promise<Candle[]>;
  getCandleSeries(symbol): CandleSeries[];
  getMarketStatus(): MarketStatus;
  subscribe(listener): () => void;
  start(): Promise<void>;
  stop(): void;
}
```

`DemoMarketDataProvider` (`src/lib/providers/demo.ts`) implements this with a deterministic seeded random walk. To connect a real feed:

1. Create `src/lib/providers/<name>.ts` implementing `MarketDataProvider` (WebSocket streaming is recommended).
2. Set `MARKET_DATA_PROVIDER=<name>` in `.env`.
3. Wire it in `src/lib/engine/store.ts`.

The signal engine is fully provider-agnostic — swapping providers requires **no** signal-engine changes.

---

## Adding Instruments

Instruments are defined in `src/lib/instruments.ts`. Each has a provider-independent symbol plus a `providerSymbol` for mapping to a broker's naming.

```ts
{ symbol: "US100", name: "Nasdaq 100", assetClass: "indices",
  baseDecimals: 1, pipSize: 1, enabled: true, providerSymbol: "NAS100" }
```

Add future/commodity symbols (e.g. `RTY`, `SI` futures) the same way — nothing is hard-coded to one broker.

---

## How the Signal Engine Works

```
MARKET DATA
   ↓
DATA VALIDATION
   ↓
MULTI-TIMEFRAME ANALYSIS
   ↓
TREND ENGINE
   ↓
MARKET STRUCTURE
   ↓
TECHNICAL ANALYSIS
   ↓
SUPPORT/RESISTANCE
   ↓
VOLATILITY / LIQUIDITY / NEWS RISK
   ↓
SETUP DETECTION
   ↓
SIGNAL SCORING
   ↓
RISK ENGINE
   ↓
SIGNAL VALIDATION
   ↓
OPPORTUNITY  →  DASHBOARD  →  ALERT / COPY SIGNAL
```

Key modules in `src/lib/engine/`:

| Module | Responsibility |
| --- | --- |
| `technical-analysis.ts` | EMA, RSI, MACD, ATR, ADX, VWAP, Bollinger, Stochastic |
| `trend.ts` | Regime, strength, momentum, HTF/MTF/STF bias |
| `market-structure.ts` | HH/HL/LH/LL, break of structure, change of character, consolidation |
| `support-resistance.ts` | Zones (support/resistance, session/day/weekly levels) |
| `liquidity.ts` | Equal highs/lows, liquidity sweeps ("potential liquidity area") |
| `signal-engine.ts` | Setup detection + confidence scoring |
| `risk.ts` | Risk level + 0–100 risk score |
| `future-opportunity.ts` | WAITING/APPROACHING/TRIGGERED future setups |
| `coordinator.ts` | Orchestrates the full pipeline into an `AnalysisSnapshot` |
| `notification.ts` | Alerts + browser notifications |

### Multi-timeframe analysis

- **High timeframe** `1H / 4H` — trend direction
- **Structure** `15M / 30M` — market structure
- **Entry** `1M / 3M / 5M` — execution

The engine checks whether lower-timeframe setups agree with the higher-timeframe trend before scoring.

---

## Scoring

Each confluence factor contributes to a **0–100 confidence score**:

- Higher-timeframe trend (+weight)
- Lower-timeframe agreement
- Market structure / break of structure
- Momentum
- EMA alignment
- RSI, MACD, ADX, VWAP
- Support/resistance proximity
- Volatility
- Spread / session conditions
- News risk

**No single indicator can create a high-confidence signal** — confluence is required. Below the user's minimum threshold, the system reports **NO HIGH-QUALITY SETUP** with a reason (conflicting timeframes, excessive volatility, poor risk/reward, weak structure, large spread, low liquidity, choppy market, upcoming event, unconfirmed setup).

---

## Risk Scoring

Risk is graded **VERY LOW → VERY HIGH** with a numeric **0–100** score based on:

- Stop-loss distance vs ATR
- Volatility
- Spread
- Distance to opposing support/resistance
- Risk/reward
- Session liquidity
- Trend alignment
- Entry quality

---

## Signal Card & COPY SIGNAL

Every signal card has a **COPY SIGNAL** button that formats a clean message for Telegram / WhatsApp / Discord. The copy format is generated by `SignalFormatter` (`src/lib/engine/formatter.ts`) and is customisable.

---

## Signal Lifecycle

`DETECTED → WAITING → APPROACHING → TRIGGERED → ACTIVE → TP1 HIT / SL HIT → …` plus `INVALIDATED / EXPIRED / CANCELLED`. The UI reflects status changes automatically as new data arrives.

---

## Alerts & Notifications

Browser notifications work out of the box (see the **Alerts** page to request permission). Alerts fire for new buys/sells/limits, triggered/invalidated signals, TP/SL hits, risk increases and cancelled setups.

**Telegram / Discord:** the `NotificationEngine` provides the integration point. Add adapters that call your Telegram bot API / Discord webhook using `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `DISCORD_WEBHOOK_URL` — no dashboard changes are required.

---

## Analytics Disclaimer

The **Analytics** page shows performance figures that are clearly labelled **SIMULATION** (observation from demo data). They are **not** live or backtested trading performance.

---

## Deployment

The app is a standard Next.js project and deploys to any Node host:

- Vercel / Netlify (Next.js adapter)
- Docker: build with `next build`, run with `next start`
- Any Node process manager (PM2, systemd, etc.)

Remember to set environment variables in your hosting platform, not in the repo. For live data, point `MARKET_DATA_*` at your provider and keep secrets server-side.

---

## Project Structure

```
src/
  app/                # Next.js App Router pages (dashboard, scanner, signals, ...)
  components/         # UI: TopBar, Sidebar, SignalCard, MarketChart, badges
  lib/
    providers/        # MarketDataProvider interface + Demo implementation
    engine/           # Trend, structure, TA, S/R, liquidity, signal, risk,
                      # future-opportunity, coordinator, notification, formatter, store
    hooks/            # React store hooks (useMarketStore / useMarketState)
    types.ts          # Core domain types
    instruments.ts    # Symbol / asset-class configuration
    settings.ts       # User settings persistence
```

This separation keeps the "brain" (engines) fully independent of the UI, so providers and future AI models can be added without rewriting the dashboard.
