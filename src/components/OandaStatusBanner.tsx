"use client";
import { useEffect, useState } from "react";

type OandaStatus = {
  configured: boolean;
  env?: string;
  label?: string;
  accountEnvHint?: string | null;
  envMismatch?: boolean;
  supportedCount?: number;
  supportedInternal?: string[];
  probe?: {
    ok: boolean;
    httpStatus: number | null;
    attempted: boolean;
    oandaMessage?: string | null;
  };
};

export default function OandaStatusBanner() {
  const [status, setStatus] = useState<OandaStatus | null>(null);
  const [httpError, setHttpError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/market/oanda?action=status", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) {
          setHttpError(`${res.status} ${(data && data.error) ?? ""}`.trim());
          setStatus(null);
        } else {
          setHttpError(null);
          setStatus(data);
        }
      } catch (e) {
        if (active) {
          setHttpError(String(e));
          setStatus(null);
        }
      }
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (httpError) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        OANDA check failed (HTTP {httpError}) — prices may be simulated.
      </div>
    );
  }
  if (!status) {
    return (
      <div className="rounded-xl border border-terminal-border/50 bg-terminal-bgElevated/60 px-4 py-3 text-sm text-terminal-muted">
        Checking OANDA feed…
      </div>
    );
  }

  const probe = status.probe;

  let tone = "warn";
  let headline = "OANDA feed unavailable — prices are SIMULATED";
  let detail = "Only the configured account's supported instruments get real prices.";

  if (!status.configured) {
    tone = "warn";
    headline = "OANDA not configured — prices are SIMULATED";
    detail =
      "Set OANDA_TOKEN, OANDA_ACCOUNT_ID and OANDA_ENV on the Render service Env (no NEXT_PUBLIC_ prefix) and redeploy.";
  } else if (probe && !probe.ok) {
    tone = "error";
    headline = `OANDA reachable but pricing FAILED (HTTP ${probe.httpStatus ?? "?"}${status.envMismatch ? " — env mismatch" : ""})`;
    detail = status.accountEnvHint
      ? `Account prefix "${status.accountEnvHint}" doesn't match OANDA_ENV "${status.env}". Use the right token + OANDA_ENV for the ${status.accountEnvHint} account.`
      : `OANDA returned an error (${
          probe.oandaMessage ? slice(probe.oandaMessage, 200) : "no details"
        }).`;
  } else if (status.configured && probe && probe.ok) {
    tone = "ok";
    headline = `OANDA LIVE (${status.env}) — ${status.supportedCount ?? 0} instruments streaming`;
    detail =
      `${status.supportedInternal && status.supportedInternal.length ? status.supportedInternal.join(", ") + " — else normal." : "No supported symbols match the configured account."}`;
  } else {
    tone = "warn";
    headline = `OANDA configured (${status.env})${status.envMismatch ? " — ACCOUNT ENV MISMATCH" : ""}`;
    detail = status.accountEnvHint
      ? `Account prefix "${status.accountEnvHint}" vs OANDA_ENV "${status.env}".`
      : "Credentials are set but no live probe result yet.";
  }

  const styles =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "error"
      ? "border-red-500/40 bg-red-500/10 text-red-200"
      : "border-amber-500/40 bg-amber-500/10 text-amber-200";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <div className="font-semibold">{headline}</div>
      <div className="mt-0.5 opacity-90">{detail}</div>
    </div>
  );
}

function slice(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}