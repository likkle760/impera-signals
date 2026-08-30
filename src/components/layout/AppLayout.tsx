"use client";

import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import Sidebar from "@/components/layout/Sidebar";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { motion } from "framer-motion";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-terminal-bg">
      <TopBar onMenuClick={() => setMenuOpen(true)} />
      <div className="flex">
        <Sidebar />
        <motion.main
          className="flex-1 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] pb-20 lg:pb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {children}
        </motion.main>
      </div>
      <MobileNavigation open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
