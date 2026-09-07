"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { computeDeviceFingerprint } from "@/lib/hwid";

type Mode = "login" | "activate";

export default function PortalLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [fp, setFp] = useState<string>("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [remember, setRemember] = useState(true);

  const [licEmail, setLicEmail] = useState("");
  const [licName, setLicName] = useState("");
  const [licPassword, setLicPassword] = useState("");
  const [licenseKey, setLicenseKey] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // If already authenticated, go straight in.
  useEffect(() => {
    setFp(computeDeviceFingerprint());
    fetch("/api/portal/auth/me", { cache: "no-store" })
      .then((r) => {
        if (r.ok) router.replace("/");
      })
      .finally(() => setChecking(false));
  }, [router]);

  const showError = (m: string) => {
    setError(m);
    setTimeout(() => setError(null), 4000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          deviceFingerprint: fp
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showError(data?.error || "Login failed");
        return;
      }
      router.replace("/");
    } catch {
      showError("Network error, please try again");
    } finally {
      setLoading(false);
    }
  };

  const formatKey = (v: string) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^IMPERA/, "");
    const body = cleaned.slice(0, 16).replace(/(.{4})/g, "$1-").replace(/-$/, "");
    return `IMPERA-${body}`;
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/portal/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey,
          email: licEmail,
          name: licName,
          password: licPassword,
          deviceFingerprint: fp
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showError(data?.error || "Activation failed");
        return;
      }
      router.replace("/");
    } catch {
      showError("Network error, please try again");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <div className="text-terminal-muted animate-pulse">Loading…</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-terminal-ink overflow-hidden flex items-center justify-center px-4">
      {/* Animated background */}
      <div className="portal-bg" />
      <div className="portal-orb portal-orb-1" />
      <div className="portal-orb portal-orb-2" />
      <div className="portal-orb portal-orb-3" />

      <div className="relative z-10 w-full max-w-md animate-rise">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-terminal-accent via-sky-500 to-terminal-violet shadow-aurora-lg mb-4">
            <span className="font-mono font-bold text-terminal-ink text-3xl leading-none">◈</span>
          </div>
          <h1 className="font-display font-bold text-3xl tracking-tight">
            IMPERA <span className="aurora-text">SIGNALS</span>
          </h1>
          <p className="text-terminal-muted text-sm mt-1">
            Licensed trading intelligence platform
          </p>
        </div>

        {/* Card */}
        <div className="relative card-elevated p-6">
          <div className="absolute top-0 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-terminal-accent/50 to-transparent" />
          <div className="flex mb-6 border-b border-terminal-border/60">
            <button
              onClick={() => { setMode("login"); setError(null); }}
              className={`flex-1 pb-3 text-sm font-semibold transition-all ${
                mode === "login"
                  ? "text-terminal-accent border-b-2 border-terminal-accent"
                  : "text-terminal-muted hover:text-white border-b-2 border-transparent"
              }`}
            >
              SIGN IN
            </button>
            <button
              onClick={() => { setMode("activate"); setError(null); }}
              className={`flex-1 pb-3 text-sm font-semibold transition-all ${
                mode === "activate"
                  ? "text-terminal-accent border-b-2 border-terminal-accent"
                  : "text-terminal-muted hover:text-white border-b-2 border-transparent"
              }`}
            >
              ACTIVATE LICENSE
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <Input label="EMAIL" type="email" value={loginEmail} onChange={setLoginEmail} placeholder="you@email.com" required />
              <Input label="PASSWORD" type="password" value={loginPassword} onChange={setLoginPassword} placeholder="••••••••" required />
              <label className="flex items-center gap-2 text-sm text-terminal-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="accent-cyan-400"
                />
                Remember me (stay signed in on this device)
              </label>
              {error && <ErrorNote text={error} />}
              <button type="submit" disabled={loading} className="btn btn-primary w-full py-2.5">
                {loading ? "Signing in…" : "SIGN IN →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              <Input
                label="LICENSE KEY"
                type="text"
                value={licenseKey}
                onChange={(v) => setLicenseKey(formatKey(v))}
                placeholder="IMPERA-XXXX-XXXX-XXXX"
                mono
                required
              />
              <Input label="FULL NAME" type="text" value={licName} onChange={setLicName} placeholder="Your name" />
              <Input label="EMAIL" type="email" value={licEmail} onChange={setLicEmail} placeholder="you@email.com" required />
              <Input label="CREATE PASSWORD" type="password" value={licPassword} onChange={setLicPassword} placeholder="Min 6 characters" required />
              {error && <ErrorNote text={error} />}
              <button type="submit" disabled={loading} className="btn btn-primary w-full py-2.5">
                {loading ? "Activating…" : "ACTIVATE & ENTER →"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[11px] text-terminal-muted mt-4">
          Licenses are device-locked (HWID). Sharing your key to another device disables access.
        </p>
      </div>

      <style jsx>{`
        @keyframes rse { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .animate-rise { animation: rse 600ms cubic-bezier(.2,.8,.2,1) both; }
        @keyframes orba { 0%{transform:translate(0,0) scale(1);} 50%{transform:translate(60px,-40px) scale(1.15);} 100%{transform:translate(0,0) scale(1);} }
        @keyframes orbb { 0%{transform:translate(0,0) scale(1);} 50%{transform:translate(-50px,-60px) scale(1.2);} 100%{transform:translate(0,0) scale(1);} }
        .portal-orb { position: absolute; border-radius: 9999px; filter: blur(90px); opacity: .4; pointer-events: none; }
        .portal-orb-1 { width: 420px; height: 420px; background: radial-gradient(circle, #22d3ee 0%, #1d4ed8 60%, transparent); top: -120px; left: -120px; animation: orba 16s ease-in-out infinite; }
        .portal-orb-2 { width: 380px; height: 380px; background: radial-gradient(circle, #a855f7 0%, #7c3aed 60%, transparent); bottom: -140px; right: -120px; animation: orbb 20s ease-in-out infinite; }
        .portal-orb-3 { width: 260px; height: 260px; background: radial-gradient(circle, #089981 0%, #065f46 60%, transparent); top: 40%; left: 55%; opacity: .25; animation: orba 24s ease-in-out infinite reverse; }
        .portal-bg { position: absolute; inset: 0;
          background-image:
            radial-gradient(circle at 1px 1px, rgba(56,189,248,.1) 1px, transparent 0),
            linear-gradient(to right, rgba(34,211,238,.02) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(34,211,238,.02) 1px, transparent 1px);
          background-size: 34px 34px, 64px 64px, 64px 64px;
        }
      `}</style>
    </div>
  );
}

function Input({
  label, type, value, onChange, placeholder, mono, required
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-terminal-muted mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`w-full bg-terminal-panel2/80 border border-terminal-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-terminal-muted/60 focus:border-terminal-accent focus:ring-2 focus:ring-terminal-accent/20 focus:outline-none transition-all ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="text-sm text-rose-400 bg-terminal-bearBg border border-terminal-bearBorder rounded-lg px-3 py-2">
      {text}
    </div>
  );
}
