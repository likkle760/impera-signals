import { AggregateMarketDataProvider } from "./src/lib/providers/aggregate";
import { OandaMarketDataProvider } from "./src/lib/providers/oanda";
import { CryptoMarketDataProvider } from "./src/lib/providers/crypto";
import { FuturesMarketDataProvider } from "./src/lib/providers/futures";
import { DemoMarketDataProvider } from "./src/lib/providers/demo";
import { AnalysisCoordinator, DEFAULT_ANALYSIS_CONFIG } from "./src/lib/engine/coordinator";
import { loadSettings, DEFAULT_SETTINGS } from "./src/lib/settings";

async function main() {
  const settings = Object.assign({}, DEFAULT_SETTINGS, { minConfidence: DEFAULT_SETTINGS.minConfidence });
  const config = {
    ...DEFAULT_ANALYSIS_CONFIG,
    minSignalScore: settings.minSignalScore,
    minRiskReward: settings.minRiskReward,
    minConfidence: settings.minConfidence,
    moreSignals: true,
    scalpingMode: true,
    dayTradeMode: true,
    swingMode: true,
    enabledInstruments: []
  };
  const providers = [
    new OandaMarketDataProvider(),
    new CryptoMarketDataProvider(),
    new FuturesMarketDataProvider(),
    new DemoMarketDataProvider()
  ];
  const agg = new AggregateMarketDataProvider(providers);
  await agg.start();

  // wait a moment for stream data
  await new Promise((r) => setTimeout(r, 6000));

  const coord = new AnalysisCoordinator(config);
  const snap = coord.analyze(agg);

  console.log(`\n=== SCAN ${new Date().toISOString()} (weekend?) ===`);
  console.log(`instruments analyzed: ${Object.keys(snap.instruments).length}`);
  console.log(`signals: ${snap.signals.length}, futures: ${snap.futureOpportunities.length}`);

  for (const row of snap.scanner.slice(40, 90)) {
    const sim = row.simulated ? " [SIM]" : "";
    const conf = row.confidenceFilter ? `${row.confidenceFilter.grade} ${row.confidenceFilter.total}${row.confidenceFilter.passed ? "" : " REJECT"} [${row.confidenceFilter.reasons.join(" · ")}] rr=${row.confidenceFilter.rr.toFixed(2)}` : "-";
    console.log(`${row.symbol.padEnd(8)} ${(row.status || "").padEnd(10)}${sim} conf=${conf.padEnd(14)} score=${row.signalScore ?? "-"} dir=${row.direction ?? "-"} ${row.noTradeReason ?? ""}`);
  }

  console.log("\n--- SIGNAL DETAILS ---");
  for (const s of snap.signals) {
    console.log(`${s.symbol} ${s.type} ${s.direction} conf=${s.confidence} entry=${s.entry} SL=${s.stopLoss} TP=[${s.takeProfits.join(",")}] rr=${s.riskReward.toFixed(2)} grade=${s.universeConfidence?.grade ?? "-"}`);
  }

// Show per-instrument status detail for a few key symbols
  for (const sym of ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD"]) {
    const inst = snap.instruments[sym];
    if (!inst) { console.log(`\n${sym}: NO ANALYSIS`); continue; }
    const ser = inst.series.map((s) => `${s.timeframe}:${s.candles.length}`).join(" ");
    console.log(`\n${sym} price=${inst.price} atr=${inst.atr?.toFixed(4)} session=${inst.session} sim=${inst.simulated} tf=[${ser}]`);
    console.log(`  trend: ${inst.trend.regime} / htf=${inst.trend.higherTimeframe} / dbias=${inst.trend.directionalBias}`);
    console.log(`  struct: ${inst.structure.structureType} bos=${inst.structure.bos} choch=${inst.structure.choch}`);
    console.log(`  liq: ${inst.liquidity.areas.length} areas, ${inst.liquidity.sweeps.length} sweeps, fvg=${inst.fvg.length}, ifvg=${inst.ifvg.length}`);
    const instObj = { symbol: sym, name: inst.name, assetClass: inst.assetClass, baseDecimals: 2 };
    const drafts = coord["signalEngine"].detect(instObj as any, inst);
    console.log(`  drafts: ${drafts.length}`);
    for (const d of drafts) {
      const score = coord["signalEngine"].score(instObj as any, inst, d);
      // replicate confidence gate using structureTargets via buildSignal
      const risk = coord["risk"].evaluate(instObj as any, inst, { entry: inst.price, stopLoss: inst.price - (inst.atr || inst.price * 0.002), takeProfits: [0,0,0] as any, direction: d.direction });
      const sig = coord["signalEngine"].buildSignal(instObj as any, inst, d, score, risk);
      console.log(`    ${d.type} score=${score.toFixed(0)} noTrade=${d.noTrade ?? "-"} rr=${sig ? sig.riskReward.toFixed(2) : "-"} confReason=[${d.reasons.join("; ")}]`);
    }
  }

  // Also show confidences for rejected drafts
  console.log("\n--- SCANNER confidence/status mapping ---");
  // Simulate the full detect' flow per live instrument to see rejections
  for (const row of snap.scanner) {
    if (row.simulated) continue;
    const inst = snap.instruments[row.symbol];
    if (!inst) continue;
    const drafts = coord["signalEngine"].detect(inst as any, inst);
    for (const d of drafts) {
      const score = coord["signalEngine"].score(inst as any, inst, d);
      console.log(`  ${row.symbol} ${d.type} score=${score.toFixed(0)} noTrade=${d.noTrade ?? "-"} reasons=[${d.reasons.join("; ")}]`);
    }
  }
  agg.stop();
}

main().catch((e) => { console.error(e); process.exit(1); });