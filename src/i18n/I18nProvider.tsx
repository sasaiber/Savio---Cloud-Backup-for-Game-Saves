import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import en from "../locales/en.json";
import uk from "../locales/uk.json";
import ru from "../locales/ru.json";
import pl from "../locales/pl.json";
import type { Language } from "./languages";

/**
 * A tiny translation engine (no extra libraries = smaller app).
 * - Keys are dotted paths: t("library.title")
 * - Variables: t("onboarding.step", { current: 1, total: 3 }) with "{current}" in the text
 * - Plurals: if the value is an object { one, few, many, other }, pass { count } and
 *   the right form is picked with the built-in Intl.PluralRules (handles UK/RU/PL rules).
 */

type Dictionary = { [key: string]: string | Dictionary };
type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Language, Dictionary> = { en, uk, ru, pl };

function lookup(dict: Dictionary, key: string): string | Dictionary | undefined {
  let node: string | Dictionary | undefined = dict;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return node;
}

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : match,
  );
}

export type TFunction = (key: string, vars?: Vars) => string;

interface I18nContextValue {
  lang: Language;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  const plurals = useMemo(() => new Intl.PluralRules(lang), [lang]);

  const t = useCallback<TFunction>(
    (key, vars) => {
      const resolve = (dict: Dictionary): string | undefined => {
        const node = lookup(dict, key);
        if (typeof node === "string") return interpolate(node, vars);
        if (node && typeof node === "object" && vars && typeof vars.count === "number") {
          const form = plurals.select(vars.count);
          const text = node[form] ?? node.other;
          if (typeof text === "string") return interpolate(text, vars);
        }
        return undefined;
      };
      // Fall back to English if a translation is missing, then to the key itself.
      return resolve(DICTIONARIES[lang]) ?? resolve(DICTIONARIES.en) ?? key;
    },
    [lang, plurals],
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, t }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
