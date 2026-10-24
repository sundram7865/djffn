import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Mode = "light" | "dark";

/*
 * Chart colours per mode (SVG attributes cannot resolve CSS variables, so charts read these).
 * Validated with the dataviz palette validator: forecast/shortfall/actual are distinguishable
 * in both modes; surplus is a de-emphasised neutral because shortfall is the buyer's risk.
 */
const palettes = {
  light: {
    forecast: "#2a78d6",
    actual: "#2b2a27",
    short: "#e34948",
    surplus: "#b3b2aa",
    secondary: "#eb6834",
    grid: "#e1e0d9",
    baseline: "#c3c2b7",
    muted: "#7a7973",
    ink: "#0b0b0b",
    surface: "#fcfcfb",
    later: "#c9c8c1",
    neutral: "#6f6e68",
    third: "#1baf7a",
    seq: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  },
  dark: {
    forecast: "#3987e5",
    actual: "#e7e6e2",
    short: "#e66767",
    surplus: "#5e5d58",
    secondary: "#d95926",
    grid: "#2c2c2a",
    baseline: "#383835",
    muted: "#8f8e88",
    ink: "#f0efec",
    surface: "#1a1a19",
    later: "#4a4a46",
    neutral: "#a3a29b",
    third: "#199e70",
    seq: ["#14304f", "#184f95", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"],
  },
} as const;

export type ChartColors = (typeof palettes)[Mode];

interface ThemeCtx {
  mode: Mode;
  toggle: () => void;
  colors: ChartColors;
}

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = "winddesk-theme";

function initialMode(): Mode {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(initialMode);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* storage unavailable (private mode) - theme still works for this session */
    }
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === "dark" ? "light" : "dark")), []);
  const value = useMemo(() => ({ mode, toggle, colors: palettes[mode] }), [mode, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/** Map a value in [min, max] onto the sequential ramp. */
export function seqColor(colors: ChartColors, v: number, min: number, max: number): string {
  const t = max > min ? (v - min) / (max - min) : 0.5;
  const i = Math.min(colors.seq.length - 1, Math.max(0, Math.floor(t * colors.seq.length)));
  return colors.seq[i];
}
