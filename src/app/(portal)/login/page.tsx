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

  const formatKey = (v: string) =>
    v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 19).replace(/(.{4})/g, "$1-").replace(/-$/, "");

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
    <div className="relative min-h-screen bg-terminal-bg overflow-hidden flex items-center justify-center px-4">
      {/* Animated background */}
      <div className="portal-bg" />
      <div className="portal-orb portal-orb-1" />
      <div className="portal-orb portal-orb-2" />

      <div className="relative z-10 w-full max-w-md animate-rise">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3 animate-glow inline-block">◈</div>
          <h1 className="font-mono font-bold text-2xl tracking-tight text-white">
            IMPERA <span className="text-sky-400">SIGNALS</span>
          </h1>
          <p className="text-terminal-muted text-sm mt-1">
            Licensed trading intelligence platform
          </p>
        </div>

        {/* Card */}
        <div className="panel p-6 backdrop-blur bg-terminal-panel/80">
          <div className="flex mb-6 border-b border-terminal-border">
            <button
              onClick={() => { setMode("login"); setError(null); }}
              className={`flex-1 pb-3 text-sm font-semibold transition-colors ${
                mode === "login" ? "text-sky-300 border-b-2 border-sky-400" : "text-terminal-muted hover:text-white border-b-2 border-transparent"
              }`}
            >
              SIGN IN
            </button>
            <button
              onClick={() => { setMode("activate"); setError(null); }}
              className={`flex-1 pb-3 text-sm font-semibold transition-colors ${
                mode === "activate" ? "text-sky-300 border-b-2 border-sky-400" : "text-terminal-muted hover:text-white border-b-2 border-transparent"
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
                  className="accent-sky-500"
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
        @keyframes glowp { 0%,100% { text-shadow: 0 0 12px rgba(56,189,248,.6); } 50% { text-shadow: 0 0 28px rgba(56,189,248,.95); } }
        .animate-glow { animation: glowp 2.6s ease-in-out infinite; display: inline-block; }
        @keyframes orba { 0%{transform:translate(0,0) scale(1);} 50%{transform:translate(60px,-40px) scale(1.15);} 100%{transform:translate(0,0) scale(1);} }
        @keyframes orbb { 0%{transform:translate(0,0) scale(1);} 50%{transform:translate(-50px,-60px) scale(1.2);} 100%{transform:translate(0,0) scale(1);} }
        .portal-orb { position: absolute; border-radius: 9999px; filter: blur(90px); opacity: .35; }
        .portal-orb-1 { width: 420px; height: 420px; background: #1d4ed8; top: -120px; left: -120px; animation: orba 16s ease-in-out infinite; }
        .portal-orb-2 { width: 380px; height: 380px; background: #7c3aed; bottom: -140px; right: -120px; animation: orbb 20s ease-in-out infinite; }
        .portal-bg { position: absolute; inset: 0;
          background-image: radial-gradient(circle at 1px 1px, rgba(56,189,248,.12) 1px, transparent 0);
          background-size: 34px 34px; }
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
        className={`w-full bg-terminal-panel2 border border-terminal-border rounded px-3 py-2 text-sm text-white placeholder:text-terminal-muted/60 focus:border-sky-500 focus:outline-none ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
      {text}
    </div>
  );
}
