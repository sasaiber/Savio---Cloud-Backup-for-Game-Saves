import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSettings, DEFAULT_SEED } from "../state/settings";
import { buildCssVariables, buildTokens, type ColorTokens } from "./color";
import { installCssSprings } from "./motion";
import { api } from "../lib/tauri";

interface ThemeContextValue {
  isDark: boolean;
  seedColor: string;
  tokens: ColorTokens;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, accentColor, system } = useSettings();

  // Listen to browser media query as secondary signal
  const [mediaDark, setMediaDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    installCssSprings();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setMediaDark(e.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const isDark = useMemo(() => {
    if (settings.theme === "dark") return true;
    if (settings.theme === "light") return false;
    // For "system" mode: check Windows 11 registry (system.isSystemDark), fallback to media query
    return typeof system.isSystemDark === "boolean" ? system.isSystemDark : mediaDark;
  }, [settings.theme, system.isSystemDark, mediaDark]);

  const seedColor = useMemo(() => {
    if (settings.colorSource === "windows" && accentColor) {
      return accentColor;
    }
    return settings.customColor || DEFAULT_SEED;
  }, [settings.colorSource, settings.customColor, accentColor]);

  const tokens = useMemo(() => {
    return buildTokens(seedColor, isDark, settings.colorStyle);
  }, [seedColor, isDark, settings.colorStyle]);

  // Apply variables to :root and sync with Windows 11 Title Bar INSTANTLY before paint
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = isDark ? "dark" : "light";
    root.style.colorScheme = isDark ? "dark" : "light";

    const vars = buildCssVariables(seedColor, isDark, settings.colorStyle);
    for (const [key, val] of Object.entries(vars)) {
      root.style.setProperty(key, val);
    }

    // Direct instant body update
    document.body.style.backgroundColor = vars["--md-sys-color-background"];
    document.body.style.color = vars["--md-sys-color-on-background"];

    // Windows 11 title bar coloring via DWM
    api.setTitlebarColors(tokens.surface, tokens.onSurface, isDark).catch(() => undefined);
  }, [seedColor, isDark, settings.colorStyle, tokens]);

  const value = useMemo(() => ({ isDark, seedColor, tokens }), [isDark, seedColor, tokens]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
