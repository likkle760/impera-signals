"use client";

import { useMarketState } from "@/lib/hooks/use-market-store";
import { formatTime } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge, LiveIndicator } from "@/components/ui";
import { Menu, Bell, LogOut, Settings, Shield, ChevronDown } from "lucide-react";

export default function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const state = useMarketState();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/portal/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d?.user) setUser({ email: d.user.email, role: d.user.role });
      })
      .catch(() => {});
  }, []);

  // Close the user menu when clicking outside or pressing Escape
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowUserMenu(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const logout = async () => {
    setShowUserMenu(false);
    await fetch("/api/portal/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  const sessionColors: Record<string, string> = {
    "LONDON/NEW YORK OVERLAP": "text-terminal-accent",
    "LONDON": "text-terminal-bull",
    "NEW YORK": "text-terminal-accent",
    "ASIA": "text-terminal-warn",
    "OFF HOURS": "text-terminal-muted"
  };

  return (
    <motion.header
      className="h-16 bg-terminal-bg/95 backdrop-blur-xl border-b border-terminal-border sticky top-0 z-40"
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="h-full flex items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
        {/* LEFT: Brand + Mode + Session */}
        <div className="flex items-center gap-4 min-w-0">
          <motion.button
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-1 rounded-xl text-terminal-muted hover:text-terminal-text hover:bg-terminal-panel transition-colors focus-ring"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.9 }}
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </motion.button>

          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="w-9 h-9 rounded-xl bg-terminal-accentBg border border-terminal-accent/30 flex items-center justify-center">
              <span className="font-mono font-bold text-terminal-accent text-base">◈</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="font-display font-bold tracking-tight text-terminal-text text-sm">
                IMPERA <span className="text-terminal-accent">SIGNALS</span>
              </h1>
              <div className="text-caption text-terminal-muted">Institutional SMC Terminal</div>
            </div>
          </motion.div>

          <motion.div
            className="hidden md:flex items-center gap-2 border-l border-terminal-border pl-3 ml-2"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <LiveIndicator status={state.mode === "LIVE" ? "live" : "connecting"} size="sm" showDot />
            <LiveIndicator
              status={state.connection === "connected" ? "live" : state.connection === "lost" ? "disconnected" : "warning"}
              size="sm"
              label={state.session}
              showDot={false}
            />
          </motion.div>
        </div>

        {/* CENTER: Key Metrics */}
        <motion.div
          className="hidden lg:flex items-center gap-6 text-caption"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="flex flex-col items-center leading-tight">
            <span className="text-terminal-muted uppercase tracking-wider">Analysis</span>
            <span className="font-mono text-terminal-accent">
              {state.lastAnalysis ? formatTime(state.lastAnalysis) : "--:--:--"}
            </span>
          </div>
          <div className="w-px h-6 bg-terminal-border" />
          <div className="flex flex-col items-center leading-tight">
            <span className="text-terminal-muted uppercase tracking-wider">Market</span>
            <span className="font-mono text-terminal-text">
              {state.lastMarketUpdate ? formatTime(state.lastMarketUpdate) : "--:--:--"}
            </span>
          </div>
        </motion.div>

        {/* RIGHT: Actions & User Menu */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <div className="hidden sm:flex items-center gap-2">
            <LiveIndicator
              status={state.connection === "connected" ? "live" : state.connection === "lost" ? "disconnected" : "warning"}
              size="sm"
            />
          </div>

          {/* Notifications Button */}
          <div className="hidden sm:block">
            <button className="p-2 rounded-xl bg-terminal-panel/50 hover:bg-terminal-panel transition-colors text-terminal-muted hover:text-terminal-text focus-ring relative">
              <Bell className="w-5 h-5" />
            </button>
          </div>

          {/* User Menu */}
          {user && (
            <motion.div
              ref={userMenuRef}
              className="relative"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.5 }}
            >
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-3 pl-3 pr-2 h-10 rounded-xl bg-terminal-panel/50 border border-terminal-border/50 hover:border-terminal-border hover:bg-terminal-panel transition-all duration-200"
                aria-expanded={showUserMenu}
                aria-haspopup="menu"
              >
                <motion.div
                  className="w-8 h-8 rounded-xl bg-terminal-accentBg border border-terminal-accent/30 flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                >
                  <span className="font-mono font-bold text-terminal-accent text-sm">{user.email.charAt(0).toUpperCase()}</span>
                </motion.div>
                <div className="hidden md:flex flex-col items-end gap-0.5">
                  <span className="text-caption text-terminal-muted truncate max-w-[160px]">{user.email}</span>
                  {user.role === "admin" && (
                    <Badge variant="info" size="sm">ADMIN</Badge>
                  )}
                </div>
                <motion.span
                  animate={{ rotate: showUserMenu ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-terminal-muted"
                >
                  <ChevronDown className="w-4 h-4" />
                </motion.span>
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <motion.div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-56 bg-terminal-panel/95 backdrop-blur-xl border border-terminal-border rounded-2xl py-2 shadow-elevated z-50"
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    <div className="px-4 py-3 border-b border-terminal-border/50">
                      <p className="font-mono text-sm text-terminal-text">{user.email}</p>
                      <p className="text-caption text-terminal-muted">{user.role === "admin" ? "Administrator" : "User"}</p>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => { setShowUserMenu(false); router.push("/settings"); }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-terminal-textDim hover:text-terminal-text hover:bg-terminal-panel2 rounded-xl mx-2 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </button>
                      {user.role === "admin" && (
                        <button
                          onClick={() => { setShowUserMenu(false); router.push("/admin"); }}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-terminal-textDim hover:text-terminal-text hover:bg-terminal-panel2 rounded-xl mx-2 transition-colors"
                        >
                          <Shield className="w-4 h-4" />
                          Admin Panel
                        </button>
                      )}
                      <hr className="border-terminal-border/50 mx-2 my-1" />
                      <button
                        onClick={logout}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-terminal-bear hover:text-terminal-bear hover:bg-terminal-bearBg/50 rounded-xl mx-2 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </motion.div>
      </div>
    </motion.header>
  );
}