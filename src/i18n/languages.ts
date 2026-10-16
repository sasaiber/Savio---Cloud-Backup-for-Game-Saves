export const LANGUAGES = [
  { code: "en", nativeName: "English" },
  { code: "uk", nativeName: "Українська" },
  { code: "ru", nativeName: "Русский" },
  { code: "pl", nativeName: "Polski" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((l) => l.code === value);
}

/** "ru-RU" -> "ru", "uk-UA" -> "uk", anything unsupported -> "en". */
export function detectLanguage(locale: string): Language {
  const prefix = locale.toLowerCase().split(/[-_]/)[0];
  return isLanguage(prefix) ? prefix : "en";
}
