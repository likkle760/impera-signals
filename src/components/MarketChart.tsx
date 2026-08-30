"use client";
import { useEffect, useRef } from "react";
import { createChart, IChartApi, ISeriesApi, ColorType } from "lightweight-charts";
import type { Candle, Timeframe } from "@/lib/types";
import type { InstrumentAnalysis } from "@/lib/engine/analysis-types";
import { ema } from "@/lib/engine/indicators";

export default function MarketChart({
  candles,
  timeframe,
  analysis
}: {
  candles: Candle[];
  timeframe: Timeframe;
  analysis: InstrumentAnalysis | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaRefs = useRef<ISeriesApi<"Line">[]>([]);
  const lineRefs = useRef<ISeriesApi<"Line">[]>([]);
  const markerRefs = useRef<ISeriesApi<"Baseline"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#111827" },
        textColor: "#9ca3af"
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" }
      },
      width: containerRef.current.clientWidth,
      height: 380,
      timeScale: { timeVisible: true, secondsVisible: false }
    });
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e"
    });
    candleRef.current = candleSeries;
    chartRef.current = chart;
    chart.timeScale().fitContent();

    const onResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      emaRefs.current = [];
      lineRefs.current = [];
    };
  }, []);

  useEffect(() => {
    if (!candleRef.current || !candles.length) return;
    candleRef.current.setData(candles.map((c) => ({ ...c, time: c.time as any })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    if (!chartRef.current) return;
    // Clear previous overlays
    for (const s of emaRefs.current) chartRef.current.removeSeries(s);
    for (const s of lineRefs.current) chartRef.current.removeSeries(s);
    if (markerRefs.current) chartRef.current.removeSeries(markerRefs.current);
    emaRefs.current = [];
    lineRefs.current = [];
    markerRefs.current = null;

    if (!candles.length) return;
    const closes = candles.map((c) => c.close);
    const times = candles.map((c) => c.time);

    // EMAs
    [9, 20, 50].forEach((p) => {
      const e = ema(closes, p);
      const series = chartRef.current!.addLineSeries({
        color: p === 9 ? "#fbbf24" : p === 20 ? "#38bdf8" : "#a78bfa",
        lineWidth: 1,
        priceLineVisible: false
      });
      series.setData(times.map((t, i) => ({ time: t as any, value: e[i] })).filter((d) => isFinite(d.value)));
      emaRefs.current.push(series);
    });

    // VWAP
    let pv = 0;
    let vol = 0;
    for (const c of candles) {
      const t = (c.high + c.low + c.close) / 3;
      pv += t * c.volume;
      vol += c.volume;
    }
    if (vol > 0) {
      const vwap = pv / vol;
      const vw = chartRef.current!.addLineSeries({
        color: "#34d399",
        lineWidth: 1,
        priceLineVisible: false,
        lineStyle: 2
      });
      vw.setData(times.map((t) => ({ time: t as any, value: vwap })));
      lineRefs.current.push(vw);
    }

    // Support / resistance lines
    if (analysis) {
      for (const s of analysis.supportResistance.supports.slice(0, 3)) {
        const ln = chartRef.current!.addLineSeries({ color: "#34d399", lineWidth: 1, priceLineVisible: false, lineStyle: 3 });
        ln.setData(times.map((t) => ({ time: t as any, value: s.price })));
        lineRefs.current.push(ln);
      }
      for (const r of analysis.supportResistance.resistances.slice(0, 3)) {
        const ln = chartRef.current!.addLineSeries({ color: "#fbbf24", lineWidth: 1, priceLineVisible: false, lineStyle: 3 });
        ln.setData(times.map((t) => ({ time: t as any, value: r.price })));
        lineRefs.current.push(ln);
      }
    }
  }, [analysis, candles]);

  return <div ref={containerRef} className="w-full" />;
}
