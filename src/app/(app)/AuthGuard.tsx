"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok">("loading");

  useEffect(() => {
    fetch("/api/portal/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) {
          setStatus("ok");
        } else {
          router.replace("/login");
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  if (status !== "ok") {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <div className="text-terminal-muted text-lg animate-pulse">Authenticating…</div>
      </div>
    );
  }
  return <>{children}</>;
}
