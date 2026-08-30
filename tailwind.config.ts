import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // Premium dark trading terminal palette
        terminal: {
          bg: "#030712",           // Deep navy - main background
          bgElevated: "#0b1324",   // Slightly elevated surfaces
          panel: "#0f172a",        // Card/panel backgrounds
          panel2: "#111c33",       // Inner/secondary panel surfaces
          panelHover: "#151e3a",   // Hover state for panels
          border: "#1e293b",       // Subtle borders
          borderHover: "#334155",  // Hover borders
          muted: "#64748b",        // Muted text
          text: "#e2e8f0",         // Primary text
          textDim: "#94a3b8",      // Dimmed text
          accent: "#22d3ee",       // Primary accent - cyan
          accentDim: "#06b6d4",    // Accent hover
          accentBg: "rgba(34, 211, 228, 0.08)", // Accent background
          // Semantic colors
          bull: "#089981",         // Bullish/long - trading-standard green
          bullBright: "#22c55e",
          bullBg: "rgba(8, 153, 129, 0.12)",
          bullBorder: "rgba(8, 153, 129, 0.3)",
          bear: "#f23645",         // Bearish/short - trading-standard red
          bearBright: "#ef4444",
          bearBg: "rgba(242, 54, 69, 0.12)",
          bearBorder: "rgba(242, 54, 69, 0.3)",
          warn: "#f59e0b",         // Warning - amber
          warnBg: "rgba(245, 158, 11, 0.12)",
          warnBorder: "rgba(245, 158, 11, 0.3)",
          info: "#3b82f6",         // Info - blue
          infoBg: "rgba(59, 130, 246, 0.12)",
          infoBorder: "rgba(59, 130, 246, 0.3)",
          violet: "#a855f7",       // Violet accent
          violetBg: "rgba(168, 85, 247, 0.12)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["4.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-lg": ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-md": ["2.25rem", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "700" }],
        "display-sm": ["1.875rem", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-xl": ["1.5rem", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-lg": ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-md": ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }],
        "heading-sm": ["1rem", { lineHeight: "1.4", fontWeight: "600" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6" }],
        "body": ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5" }],
        "caption": ["0.75rem", { lineHeight: "1.5", letterSpacing: "0.02em" }],
        "caption-xs": ["0.6875rem", { lineHeight: "1.5", letterSpacing: "0.03em" }],
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
        "26": "6.5rem",
        "30": "7.5rem",
      },
      borderRadius: {
        "xl": "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      boxShadow: {
        "glow": "0 0 20px rgba(34, 211, 228, 0.15), 0 0 40px rgba(34, 211, 228, 0.08)",
        "glow-bull": "0 0 20px rgba(34, 197, 94, 0.2), 0 0 40px rgba(34, 197, 94, 0.1)",
        "glow-bear": "0 0 20px rgba(239, 68, 68, 0.2), 0 0 40px rgba(239, 68, 68, 0.1)",
        "glow-warn": "0 0 20px rgba(245, 158, 11, 0.2), 0 0 40px rgba(245, 158, 11, 0.1)",
        "card": "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
        "card-hover": "0 8px 30px rgba(0,0,0,0.4), 0 0 0 1px rgba(34, 211, 228, 0.15)",
        "elevated": "0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)",
        "inner-glow": "inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      backgroundImage: {
        "grid-pattern": "linear-gradient(rgba(34, 211, 228, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 228, 0.03) 1px, transparent 1px)",
        "gradient-radial": "radial-gradient(ellipse at center, var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "mesh": "url(\"data:image/svg+xml,%3Csvg width='600' height='600' viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
      },
      animation: {
        "fade-in": "fadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "fade-up": "fadeUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "fade-down": "fadeDown 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "slide-in-right": "slideInRight 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "slide-in-left": "slideInLeft 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "slide-up": "slideUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "scale-in": "scaleIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "pulse-soft": "pulseSoft 3s ease-in-out infinite",
        "pulse-live": "pulseLive 2s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
        "shimmer": "shimmer 2s infinite",
        "accordion-down": "accordionDown 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "accordion-up": "accordionUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "count-up": "countUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "progress-fill": "progressFill 1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "live-flash-up": "liveFlashUp 0.9s cubic-bezier(0.2,0.8,0.2,1) forwards",
        "live-flash-down": "liveFlashDown 0.9s cubic-bezier(0.2,0.8,0.2,1) forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeDown: {
          "0%": { opacity: "0", transform: "translateY(-16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.02)" },
        },
        pulseLive: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(34, 197, 94, 0.4)" },
          "50%": { opacity: "1", boxShadow: "0 0 0 12px rgba(34, 197, 94, 0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        accordionDown: {
          "0%": { height: "0", opacity: "0" },
          "100%": { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        accordionUp: {
          "0%": { height: "var(--radix-accordion-content-height)", opacity: "1" },
          "100%": { height: "0", opacity: "0" },
        },
        countUp: {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        progressFill: {
          "0%": { width: "0%" },
          "100%": { width: "var(--progress-width)" },
        },
        liveFlashUp: {
          "0%": { backgroundColor: "rgba(8,153,129,0.22)", color: "#34d399" },
          "100%": { backgroundColor: "transparent", color: "inherit" },
        },
        liveFlashDown: {
          "0%": { backgroundColor: "rgba(242,54,69,0.22)", color: "#f87171" },
          "100%": { backgroundColor: "transparent", color: "inherit" },
        },
      },
      transitionDuration: {
        "0": "0ms",
        "75": "75ms",
        "150": "150ms",
        "200": "200ms",
        "300": "300ms",
        "400": "400ms",
        "500": "500ms",
        "700": "700ms",
        "1000": "1000ms",
      },
      transitionTimingFunction: {
        "premium": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};
export default config;