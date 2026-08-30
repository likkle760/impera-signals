"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  Time,
  UTCTimestamp
} from "lightweight-charts";
import { useMarketState } from "@/lib/hooks/use-market-store";
import type { Timeframe } from "@/lib/types";

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "4h", "1d"];

type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number };

function emaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (!closes.length) return out;
  const k = 2 / (period + 1);
  let e = closes[0];
  for (let i = 0; i < closes.length; i++) {
    e = i === 0 ? closes[i] : closes[i] * k + e * (1 - k);
    out[i] = Number.isFinite(e) ? e : null;
  }
  return out;
}

function smaSeries(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const start = i - period + 1;
    if (start < 0) continue;
    let sum = 0;
    let ok = true;
    for (let j = start; j <= i; j++) {
      if (values[j] == null) { ok = false; break; }
      sum += values[j] as number;
    }
    if (ok) out[i] = sum / period;
  }
  return out;
}

function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  const avgGain = () => gain / period;
  const avgLoss = () => loss / period;
  out[period] = 100 - 100 / (1 + (avgLoss() === 0 ? 100 : avgGain() / avgLoss()));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d >= 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = 100 - 100 / (1 + (loss === 0 ? 100 : gain / loss));
  }
  return out;
}

function macdSeries(closes: number[], fast = 12, slow = 26, signal = 9): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const ef = emaSeries(closes, fast);
  const es = emaSeries(closes, slow);
  const macd: (number | null)[] = closes.map((_, i) =>
    ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null
  );
  const signalLine = emaSeriesFrom(macd, signal);
  const hist: (number | null)[] = macd.map((m, i) =>
    m != null && signalLine[i] != null ? m - (signalLine[i] as number) : null
  );
  return { macd, signal: signalLine, hist };
}

function emaSeriesFrom(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let e: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { e = null; continue; }
    e = e == null ? v : v * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

function bollingerSeries(closes: number[], period = 20, mult = 2): { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } {
  const mid = smaSeries(closes.map((c) => c), period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    if (mid[i] == null) continue;
    const start = i - period + 1;
    let sum = 0;
    for (let j = start; j <= i; j++) sum += (closes[j] - (mid[i] as number)) ** 2;
    const sd = Math.sqrt(sum / period);
    upper[i] = (mid[i] as number) + mult * sd;
    lower[i] = (mid[i] as number) - mult * sd;
  }
  return { upper, mid, lower };
}

function vwapSeries(bars: Bar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let cumPV = 0, cumVol = 0, start = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i - start >= period) {
      const idx = start;
      cumPV -= (bars[idx].high + bars[idx].low + bars[idx].close) / 3 * Math.max(1, bars[idx].close);
      cumVol -= Math.max(1, bars[idx].close);
      start++;
    }
    cumPV += (bars[i].high + bars[i].low + bars[i].close) / 3 * Math.max(1, bars[i].close);
    cumVol += Math.max(1, bars[i].close);
    out[i] = cumVol > 0 ? cumPV / cumVol : bars[i].close;
  }
  return out;
}

function toData(candles: Bar[], values: (number | null)[]): { time: UTCTimestamp; value: number }[] {
  return candles
    .map((c, i) => (values[i] == null ? null : { time: c.time, value: values[i] as number }))
    .filter((x): x is { time: UTCTimestamp; value: number } => x != null);
}

export default function ChartsPage() {
  const state = useMarketState();
  const instruments = Object.values(state.snapshot.instruments || {});

  const [symbol, setSymbol] = useState<string>("XAUUSD");
  const [tf, setTf] = useState<Timeframe>("5m");
  const [showEma, setShowEma] = useState(true);
  const [showVol, setShowVol] = useState(true);
  const [showBoll, setShowBoll] = useState(false);
  const [showVwap, setShowVwap] = useState(false);
  const [showRsi, setShowRsi] = useState(false);
  const [showMacd, setShowMacd] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);
  const legendRef = useRef<HTMLDivElement | null>(null);

  const instrument = instruments.find((i) => i.symbol === symbol) ?? instruments[0];

  useEffect(() => {
    if (instruments.length && !instruments.some((i) => i.symbol === symbol)) {
      setSymbol(instruments[0].symbol);
    }
  }, [instruments, symbol]);

  useEffect(() => {
    if (!containerRef.current || !instrument) return;

    const chart: IChartApi = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0f17" },
        textColor: "#c9d1d9",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
      },
      grid: { vertLines: { color: "#131a26" }, horzLines: { color: "#131a26" } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "#3b4657" }, horzLine: { color: "#3b4657" } },
      rightPriceScale: { borderColor: "#2d333b" },
      timeScale: { borderColor: "#2d333b", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      autoSize: true,
      watermark: {
        visible: true,
        text: symbol,
        color: "#1c2333",
        fontSize: 64,
        fontStyle: "bold"
      }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350"
    });

    const ema20 = chart.addLineSeries({ color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "EMA20" });
    const ema50 = chart.addLineSeries({ color: "#38bdf8", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "EMA50" });

    const volSeries: ISeriesApi<"Histogram"> | null = showVol
      ? chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false })
      : null;
    if (volSeries) chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    const bollUpper = showBoll ? chart.addLineSeries({ color: "rgba(167,139,250,0.8)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "Boll U" }) : null;
    const bollMid = showBoll ? chart.addLineSeries({ color: "rgba(167,139,250,0.5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "Boll M" }) : null;
    const bollLower = showBoll ? chart.addLineSeries({ color: "rgba(167,139,250,0.8)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "Boll L" }) : null;
    const vwapLine = showVwap ? chart.addLineSeries({ color: "#e879f9", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "VWAP" }) : null;

    const rsiPane: number | null = null;
    const macdPane: number | null = null;

    const zoneMarkers: ISeriesApi<"Line"> | null = showZones ? chart.addLineSeries({ color: "transparent", priceLineVisible: false, lastValueVisible: false }) : null;

    const src = state.snapshot.instruments[symbol]?.series.find((s) => s.timeframe === tf);
    const candles = src?.candles ?? [];
    const bars: Bar[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }));
    candleSeries.setData(bars);

    // Real EMA overlay: compute the actual rolling EMA value for every candle so
    // the line is an accurate moving average, not a flat last-value step.
    const closes = candles.map((c) => c.close);
    if (showEma) {
      const e20 = emaSeries(closes, 20);
      const e50 = emaSeries(closes, 50);
      ema20.setData(
        candles.map((c, i) => ({ time: c.time as UTCTimestamp, value: e20[i] ?? c.close }))
      );
      ema50.setData(
        candles.map((c, i) => ({ time: c.time as UTCTimestamp, value: e50[i] ?? c.close }))
      );
    } else {
      ema20.setData([]);
      ema50.setData([]);
    }

    if (volSeries) {
      volSeries.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume ?? 0,
          color: c.close >= c.open ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)"
        }))
      );
    }

    const closesA = candles.map((c) => c.close);

    if (showBoll && bollUpper && bollMid && bollLower) {
      const bb = bollingerSeries(closesA, 20, 2);
      bollUpper.setData(toData(bars, bb.upper));
      bollMid.setData(toData(bars, bb.mid));
      bollLower.setData(toData(bars, bb.lower));
    } else {
      bollUpper?.setData([]); bollMid?.setData([]); bollLower?.setData([]);
    }

    if (showVwap && vwapLine) {
      vwapLine.setData(toData(bars, vwapSeries(bars, 20)));
    } else {
      vwapLine?.setData([]);
    }

    if (zoneMarkers && instrument?.orderBlocks) {
      const mark: { time: UTCTimestamp; price: number; color: string; text: string; shape: "arrowUp" | "arrowDown"; position: "aboveBar" | "belowBar" }[] = [];
      const ob = instrument.orderBlocks;
      for (const z of ob.bullish ?? []) {
        if (isFinite(z.high) && isFinite(z.low)) {
          const t = candles.find((c) => ((z.high + z.low) / 2) >= c.low && ((z.high + z.low) / 2) <= c.high)?.time;
          if (t != null) mark.push({ time: t as UTCTimestamp, price: (z.high + z.low) / 2, color: "#26a69a", text: "Demand", shape: "arrowUp", position: "belowBar" });
        }
      }
      for (const z of ob.bearish ?? []) {
        if (isFinite(z.high) && isFinite(z.low)) {
          const t = candles.find((c) => ((z.high + z.low) / 2) >= c.low && ((z.high + z.low) / 2) <= c.high)?.time;
          if (t != null) mark.push({ time: t as UTCTimestamp, price: (z.high + z.low) / 2, color: "#ef5350", text: "Supply", shape: "arrowDown", position: "aboveBar" });
        }
      }
      zoneMarkers.setMarkers(mark.slice(0, 200));
    } else {
      zoneMarkers?.setMarkers([]);
    }

    chart.timeScale().fitContent();

    const updateLegend = (p: MouseEventParams<Time>) => {
      const el = legendRef.current;
      if (!el) return;
      if (!p.time) { el.textContent = "—"; return; }
      const item = p.seriesData.get(candleSeries) as { close: number } | undefined;
      if (!item) { el.textContent = "—"; return; }
      const { close } = item;
      const bar = bars.find((b) => b.time === p.time);
      if (!bar) { el.textContent = "—"; return; }
      const dir = bar.close >= bar.open ? "▲" : "▼";
      const col = bar.close >= bar.open ? "#26a69a" : "#ef5350";
      el.innerHTML =
        `<span style="color:#8b949e">O</span> <span style="color:#e6edf3">${bar.open.toFixed(4)}</span> ` +
        `<span style="color:#8b949e">H</span> <span style="color:#e6edf3">${bar.high.toFixed(4)}</span> ` +
        `<span style="color:#8b949e">L</span> <span style="color:#e6edf3">${bar.low.toFixed(4)}</span> ` +
        `<span style="color:#8b949e">C</span> <span style="color:${col}">${close.toFixed(4)}</span> ` +
        `<span style="color:${col}">${dir}</span>`;
    };
    chart.subscribeCrosshairMove(updateLegend);

    let active = true;
    const iv = setInterval(() => {
      if (active) updateLive();
    }, 1500);

    function updateLive() {
      const s = state.snapshot.instruments[symbol]?.series.find((x) => x.timeframe === tf);
      if (!s) return;
      const liveBars: Bar[] = s.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      }));
      candleSeries.setData(liveBars);
      // Live EMA update
      if (showEma) {
        const lc = s.candles.map((c) => c.close);
        const e20 = emaSeries(lc, 20);
        const e50 = emaSeries(lc, 50);
        ema20.setData(s.candles.map((c, i) => ({ time: c.time as UTCTimestamp, value: e20[i] ?? c.close })));
        ema50.setData(s.candles.map((c, i) => ({ time: c.time as UTCTimestamp, value: e50[i] ?? c.close })));
      }

      const sCloses = s.candles.map((c) => c.close);

      if (showBoll && bollUpper && bollMid && bollLower) {
        const bb = bollingerSeries(sCloses, 20, 2);
        bollUpper.setData(toData(liveBars, bb.upper));
        bollMid.setData(toData(liveBars, bb.mid));
        bollLower.setData(toData(liveBars, bb.lower));
      }

      if (showVwap && vwapLine) {
        vwapLine.setData(toData(liveBars, vwapSeries(liveBars, 20)));
      }
    }

    return () => {
      active = false;
      clearInterval(iv);
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, showEma, showVol, showBoll, showVwap, showRsi, showMacd, showZones, instrument?.symbol]);

  // Bottom indicator subchart (RSI / MACD) — a second lightweight-chart instance,
  // the standard way to get "panes" on lightweight-charts v4.
  useEffect(() => {
    const el = subRef.current;
    if (!el || !instrument) return;
    if (!showRsi && !showMacd) return;

    const chart: IChartApi = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: "#0b0f17" }, textColor: "#c9d1d9", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" },
      grid: { vertLines: { color: "#131a26" }, horzLines: { color: "#131a26" } },
      rightPriceScale: { borderColor: "#2d333b" },
      timeScale: { borderColor: "#2d333b", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      autoSize: true,
      watermark: { visible: true, text: showRsi ? "RSI 14" : "MACD", color: "#1c2333", fontSize: 48, fontStyle: "bold" }
    });

    const src = state.snapshot.instruments[symbol]?.series.find((s) => s.timeframe === tf);
    const bars: Bar[] = (src?.candles ?? []).map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }));
    const closes = bars.map((b) => b.close);

    if (showRsi) {
      const line = chart.addLineSeries({ color: "#22d3ee", lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
      const ov = chart.addLineSeries({ color: "rgba(239,83,80,0.7)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      const uv = chart.addLineSeries({ color: "rgba(38,166,154,0.7)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      line.setData(toData(bars, rsiSeries(closes, 14)));
      ov.setData(bars.map((b) => ({ time: b.time, value: 70 })));
      uv.setData(bars.map((b) => ({ time: b.time, value: 30 })));
      return () => { chart.remove(); };
    }

    if (showMacd) {
      const m = macdSeries(closes, 12, 26, 9);
      const hist = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      const macdL = chart.addLineSeries({ color: "#38bdf8", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      const sig = chart.addLineSeries({ color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      hist.setData(
        bars
          .map((b, i) => (m.hist[i] == null ? null : { time: b.time, value: m.hist[i] as number, color: (m.hist[i] as number) >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)" }))
          .filter((x): x is { time: UTCTimestamp; value: number; color: string } => x != null)
      );
      macdL.setData(toData(bars, m.macd));
      sig.setData(toData(bars, m.signal));
      return () => { chart.remove(); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, showRsi, showMacd, instrument?.symbol]);

  if (!instrument) return <div style={{ padding: 20, color: "#8b949e" }}>No market data yet…</div>;

  return (
    <div style={{ minHeight: "100vh", padding: 20, color: "#e6edf3", background: "#0b0f17", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, margin: 0, fontWeight: 600 }}>TradingView-Style Charts</h1>
        <span className="badge" style={{ color: state.connection === "connected" ? "#2ea043" : "#d29922", background: state.connection === "connected" ? "rgba(46,160,67,0.12)" : "rgba(210,153,34,0.12)", border: "1px solid currentColor" }}>
          {state.connection === "connected" ? "● live" : "○ connecting"}
        </span>
        <div ref={legendRef} style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", marginLeft: "auto" }}>—</div>
      </div>

      <div className="tv-row" style={{ margin: "14px 0" }}>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="tv-select">
          {instruments.map((i) => (
            <option key={i.symbol} value={i.symbol}>
              {i.symbol} — {i.name} ({i.assetClass})
            </option>
          ))}
        </select>

        <div className="tv-row" style={{ gap: 6 }}>
          {TIMEFRAMES.map((t) => (
            <button key={t} className={`tv-chip ${t === tf ? "active" : ""}`} onClick={() => setTf(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="tv-row" style={{ gap: 16, fontSize: 13 }}>
          <label className="tv-label">
            <span className="tv-switch">
              <input type="checkbox" checked={showEma} onChange={(e) => setShowEma(e.target.checked)} />
              <span className="track" />
            </span>
            EMA 20/50
          </label>
          <label className="tv-label">
            <span className="tv-switch">
              <input type="checkbox" checked={showVol} onChange={(e) => setShowVol(e.target.checked)} />
              <span className="track" />
            </span>
            Volume
          </label>
          <label className="tv-label">
            <span className="tv-switch">
              <input type="checkbox" checked={showBoll} onChange={(e) => setShowBoll(e.target.checked)} />
              <span className="track" />
            </span>
            Bollinger
          </label>
          <label className="tv-label">
            <span className="tv-switch">
              <input type="checkbox" checked={showVwap} onChange={(e) => setShowVwap(e.target.checked)} />
              <span className="track" />
            </span>
            VWAP
          </label>
          <label className="tv-label">
            <span className="tv-switch">
              <input type="checkbox" checked={showRsi} onChange={(e) => setShowRsi(e.target.checked)} />
              <span className="track" />
            </span>
            RSI 14
          </label>
          <label className="tv-label">
            <span className="tv-switch">
              <input type="checkbox" checked={showMacd} onChange={(e) => setShowMacd(e.target.checked)} />
              <span className="track" />
            </span>
            MACD
          </label>
          <label className="tv-label">
            <span className="tv-switch">
              <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
              <span className="track" />
            </span>
            OB zones
          </label>
        </div>
      </div>

      <div style={{ marginBottom: 8, display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
        <span>Price: <b style={{ color: "#58a6ff" }}>{Number.isFinite(instrument.price) ? instrument.price.toFixed(4) : "—"}</b></span>
        <span>Trend: <b style={{ color: "#58a6ff" }}>{instrument.trend?.regime ?? "—"}</b></span>
        <span>Session: <b style={{ color: "#58a6ff" }}>{instrument.session ?? "—"}</b></span>
        {instrument.orderBlocks && instrument.orderBlocks.bullish.length > 0 && (
          <span>Demand zones: <b style={{ color: "#26a69a" }}>{instrument.orderBlocks.bullish.length}</b></span>
        )}
        {instrument.orderBlocks && instrument.orderBlocks.bearish.length > 0 && (
          <span>Supply zones: <b style={{ color: "#ef5350" }}>{instrument.orderBlocks.bearish.length}</b></span>
        )}
      </div>

      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: 560,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid #21262d",
          transition: "border-color 200ms cubic-bezier(0.2,0.8,0.2,1), box-shadow 200ms cubic-bezier(0.2,0.8,0.2,1)"
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#3b4657"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#21262d"; }}
      />
      {(showRsi || showMacd) && (
        <div
          ref={subRef}
          style={{ width: "100%", height: 180, marginTop: 8, borderRadius: 8, overflow: "hidden", border: "1px solid #21262d" }}
        />
      )}
      <p style={{ fontSize: 11, color: "#4b5563", marginTop: 8 }}>
        Hover/pan/zoom to inspect. Toggle EMA20/50, Bollinger, VWAP, RSI 14 &amp; MACD (bottom pane) and order-block zone markers, all updated live. Indices/futures feed is simulated (no free live feed). Not financial advice.
      </p>
    </div>
  );
}
