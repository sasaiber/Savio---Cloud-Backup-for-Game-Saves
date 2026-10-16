import {
  CorePalette,
  TonalPalette,
  Hct,
  Blend,
  argbFromHex,
  hexFromArgb,
} from "@material/material-color-utilities";
import type { ColorStyle } from "../state/settings";

/** All Material 3 color roles we publish as CSS variables (--md-sys-color-<role>). */
const ROLES = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "inversePrimary",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "background",
  "onBackground",
  "surface",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "inverseSurface",
  "inverseOnSurface",
  "outline",
  "outlineVariant",
  "shadow",
  "scrim",
] as const;

export type ColorRole = (typeof ROLES)[number];
export type ColorTokens = Record<ColorRole, string>;

/** Sync status colors harmonized with the current theme. */
const STATUS_BASE = {
  synced: "#16A34A",
  playing: "#2563EB",
  localNewer: "#D97706",
  cloudNewer: "#9333EA",
  conflict: "#EA580C",
  error: "#DC2626",
} as const;

export type StatusKind = keyof typeof STATUS_BASE;
export const STATUS_KINDS = Object.keys(STATUS_BASE) as StatusKind[];

/**
 * Builds high-contrast, crystal-clear Material 3 tokens:
 * - Light theme: Pure crisp WHITE (#FFFFFF) background and surfaces with dark text.
 * - Dark theme: Pure deep OLED/Obsidian dark (#0B0F14) with bright text.
 */
export function buildTokens(seedHex: string, dark: boolean, style: ColorStyle): ColorTokens {
  const seedArgb = argbFromHex(seedHex);
  const core = CorePalette.of(seedArgb);

  let p = core.a1;
  let s = core.a2;
  let t = core.a3;

  if (style === "vibrant") {
    const hct = Hct.fromInt(seedArgb);
    p = TonalPalette.fromHueAndChroma(hct.hue, Math.max(hct.chroma, 64));
    s = TonalPalette.fromHueAndChroma(hct.hue + 25, 48);
    t = TonalPalette.fromHueAndChroma(hct.hue + 140, 48);
  } else if (style === "expressive") {
    const hct = Hct.fromInt(seedArgb);
    p = TonalPalette.fromHueAndChroma(hct.hue + 10, Math.max(hct.chroma, 60));
    s = TonalPalette.fromHueAndChroma(hct.hue + 35, 40);
    t = TonalPalette.fromHueAndChroma(hct.hue + 120, 52);
  }

  const n1 = core.n1;
  const n2 = core.n2;
  const err = core.error;
  const getHex = (palette: TonalPalette, tone: number) => hexFromArgb(palette.tone(tone));

  if (!dark) {
    // Material You Light: Crisp pure surface with dynamic primary-tinted tonal containers
    return {
      primary: getHex(p, 40),
      onPrimary: "#FFFFFF",
      primaryContainer: getHex(p, 90),
      onPrimaryContainer: getHex(p, 10),
      inversePrimary: getHex(p, 80),

      secondary: getHex(s, 40),
      onSecondary: "#FFFFFF",
      secondaryContainer: getHex(s, 90),
      onSecondaryContainer: getHex(s, 10),

      tertiary: getHex(t, 40),
      onTertiary: "#FFFFFF",
      tertiaryContainer: getHex(t, 90),
      onTertiaryContainer: getHex(t, 10),

      error: getHex(err, 40),
      onError: "#FFFFFF",
      errorContainer: getHex(err, 90),
      onErrorContainer: getHex(err, 10),

      background: "#FFFFFF",
      onBackground: getHex(n1, 10),

      surface: "#FFFFFF",
      onSurface: getHex(n1, 10),
      surfaceVariant: getHex(n2, 90),
      onSurfaceVariant: getHex(n2, 30),

      surfaceDim: getHex(n1, 87),
      surfaceBright: "#FFFFFF",
      surfaceContainerLowest: "#FFFFFF",
      surfaceContainerLow: getHex(n1, 96),
      surfaceContainer: getHex(n1, 94),
      surfaceContainerHigh: getHex(n1, 92),
      surfaceContainerHighest: getHex(n1, 90),

      inverseSurface: getHex(n1, 20),
      inverseOnSurface: getHex(n1, 95),

      outline: getHex(n2, 50),
      outlineVariant: getHex(n2, 85),
      shadow: "rgba(0,0,0,0.06)",
      scrim: "rgba(0,0,0,0.3)",
    };
  }

  // Material You Dark: Deep OLED obsidian background with luminous primary-tinted tonal containers
  return {
    primary: getHex(p, 80),
    onPrimary: getHex(p, 20),
    primaryContainer: getHex(p, 30),
    onPrimaryContainer: getHex(p, 90),
    inversePrimary: getHex(p, 40),

    secondary: getHex(s, 80),
    onSecondary: getHex(s, 20),
    secondaryContainer: getHex(s, 30),
    onSecondaryContainer: getHex(s, 90),

    tertiary: getHex(t, 80),
    onTertiary: getHex(t, 20),
    tertiaryContainer: getHex(t, 30),
    onTertiaryContainer: getHex(t, 90),

    error: getHex(err, 80),
    onError: getHex(err, 20),
    errorContainer: getHex(err, 30),
    onErrorContainer: getHex(err, 90),

    background: "#080C10",
    onBackground: getHex(n1, 90),

    surface: getHex(n1, 6),
    onSurface: getHex(n1, 90),
    surfaceVariant: getHex(n2, 30),
    onSurfaceVariant: getHex(n2, 80),

    surfaceDim: getHex(n1, 6),
    surfaceBright: getHex(n1, 24),
    surfaceContainerLowest: getHex(n1, 4),
    surfaceContainerLow: getHex(n1, 10),
    surfaceContainer: getHex(n1, 13),
    surfaceContainerHigh: getHex(n1, 17),
    surfaceContainerHighest: getHex(n1, 22),

    inverseSurface: getHex(n1, 90),
    inverseOnSurface: getHex(n1, 20),

    outline: getHex(n2, 60),
    outlineVariant: getHex(n2, 30),
    shadow: "rgba(0,0,0,0.45)",
    scrim: "rgba(0,0,0,0.7)",
  };
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Every CSS variable for the whole app theme. */
export function buildCssVariables(seedHex: string, dark: boolean, style: ColorStyle): Record<string, string> {
  const tokens = buildTokens(seedHex, dark, style);
  const vars: Record<string, string> = {};
  for (const role of ROLES) {
    vars[`--md-sys-color-${kebab(role)}`] = tokens[role];
  }

  const source = argbFromHex(seedHex);
  for (const kind of STATUS_KINDS) {
    const palette = TonalPalette.fromInt(Blend.harmonize(argbFromHex(STATUS_BASE[kind]), source));
    const name = kebab(kind);
    vars[`--status-${name}`] = hexFromArgb(palette.tone(dark ? 80 : 40));
    vars[`--status-${name}-container`] = hexFromArgb(palette.tone(dark ? 28 : 92));
    vars[`--status-${name}-on-container`] = hexFromArgb(palette.tone(dark ? 90 : 15));
  }
  return vars;
}
