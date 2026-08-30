"use client";

import { motion } from "framer-motion";
import { Send, ArrowRight, CheckCircle2 } from "lucide-react";

/**
 * Premium Telegram call-to-action band. Reads Telegram config from /api/telegram/status
 * (which never exposes secrets) to decide whether to show the "join / enable" CTA.
 */
export function TelegramCta({
  telegramUrl = "https://t.me/",
  enabled = true,
  className = "",
}: {
  telegramUrl?: string;
  enabled?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      className={`tg-cta relative overflow-hidden rounded-2xl p-6 sm:p-8 ${className}`}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="tg-cta-glow" />
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#229ED9]/20 border border-[#229ED9]/40 flex items-center justify-center flex-shrink-0">
            <Send className="w-6 h-6 text-[#4db6e8]" />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-terminal-text">
              Get signals pushed straight to Telegram
            </h3>
            <p className="text-terminal-muted text-sm mt-1 max-w-md">
              Every high-confidence setup is delivered to your phone in real time — never miss an entry.
            </p>
            <div className="flex flex-wrap gap-4 mt-3 text-caption text-terminal-textDim">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-terminal-bull" /> Real-time push
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-terminal-bull" /> Entry / SL / TP
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-terminal-bull" /> Risk-managed
              </span>
            </div>
          </div>
        </div>
        {enabled && (
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-telegram btn-lg flex-shrink-0"
          >
            <Send className="w-4 h-4" /> Join Telegram <ArrowRight className="w-4 h-4" />
          </a>
        )}
      </div>
    </motion.div>
  );
}
