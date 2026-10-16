import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type BootstrapInfo } from "../lib/tauri";
import { detectLanguage, isLanguage, type Language } from "../i18n/languages";

export type ThemeMode = "system" | "light" | "dark";
export type ColorSource = "windows" | "custom";
export type ColorStyle = "tonal" | "vibrant" | "expressive";
export type BackupTargetType = "asus" | "nas" | "local" | "gdrive" | "mega" | "webdav";

export interface CloudAccountAuth {
  connected: boolean;
  email?: string;
  name?: string;
  accessToken?: string;
  refreshToken?: string;
  obscuredPass?: string;
}

export interface CustomGameDef {
  id: string;
  name: string;
  savePath: string;
  exePath?: string;
  coverUrl?: string;
  notes?: string;
  createdAt: number;
}

export interface GameSyncConfig {
  enabled: boolean;
  syncOnExit: boolean;
  syncIntervalMinutes: number; // 0 = disabled (only on exit/manual)
  autoCloudUpload: boolean;
  customExeName?: string;
  notifyOnSync: boolean;
}

export interface Settings {
  version: 1;
  language: Language;
  theme: ThemeMode;
  colorSource: ColorSource;
  customColor: string;
  colorStyle: ColorStyle;
  onboardingDone: boolean;
  hiddenGameIds: string[];
  enabledSyncGameIds: string[];
  customGames: CustomGameDef[];
  customSavePaths: Record<string, string>;
  gameSyncConfigs: Record<string, GameSyncConfig>;
  backupTargetType: BackupTargetType;
  asusRouterIp: string;
  asusShareName: string;
  asusUsername?: string;
  asusPassword?: string;
  steamGridDbApiKey?: string;
  nasPath: string;
  localBackupPath: string;
  gdrivePath: string;
  gdriveAuth: CloudAccountAuth;
  megaPath: string;
  megaAuth: CloudAccountAuth;
  webdavUrl: string;
  webdavUser: string;
  webdavPass: string;
  webdavRemotePath: string;
  cloudRetentionLimit: number;
  localRetentionLimit: number;
  skipUnchangedSaves: boolean;
  syncBeforeLaunch: boolean;
  corruptionGuardEnabled: boolean;
  autostartEnabled: boolean;
  autostartMinimized: boolean;
}

/** Savio's own brand color, used when Windows has no accent color. */
export const DEFAULT_SEED = "#1B6B5F";

function defaultSettings(systemLocale: string): Settings {
  return {
    version: 1,
    language: detectLanguage(systemLocale),
    theme: "system",
    colorSource: "windows",
    customColor: DEFAULT_SEED,
    colorStyle: "tonal",
    onboardingDone: false,
    hiddenGameIds: [],
    enabledSyncGameIds: [],
    customGames: [],
    customSavePaths: {},
    gameSyncConfigs: {},
    backupTargetType: "gdrive",
    asusRouterIp: "192.168.50.1",
    asusShareName: "SaveVault",
    asusUsername: "",
    asusPassword: "",
    steamGridDbApiKey: "",
    nasPath: "\\\\NAS\\SaveVault",
    localBackupPath: "D:\\SavioBackups",
    gdrivePath: "G:\\My Drive\\SavioSaves",
    gdriveAuth: { connected: false },
    megaPath: "",
    megaAuth: { connected: false },
    webdavUrl: "https://dav.box.com/dav",
    webdavUser: "",
    webdavPass: "",
    webdavRemotePath: "SavioSaves",
    cloudRetentionLimit: 5,
    localRetentionLimit: 10,
    skipUnchangedSaves: true,
    syncBeforeLaunch: true,
    corruptionGuardEnabled: true,
    autostartEnabled: false,
    autostartMinimized: true,
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Merges whatever is stored on disk with defaults, ignoring broken or unknown values. */
function sanitize(raw: unknown, systemLocale: string): Settings {
  const base = defaultSettings(systemLocale);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  return {
    version: 1,
    language: isLanguage(r.language) ? r.language : base.language,
    theme: r.theme === "light" || r.theme === "dark" || r.theme === "system" ? r.theme : base.theme,
    colorSource: r.colorSource === "custom" || r.colorSource === "windows" ? r.colorSource : base.colorSource,
    customColor: typeof r.customColor === "string" && HEX.test(r.customColor) ? r.customColor : base.customColor,
    colorStyle:
      r.colorStyle === "tonal" || r.colorStyle === "vibrant" || r.colorStyle === "expressive"
        ? r.colorStyle
        : base.colorStyle,
    onboardingDone: r.onboardingDone === true,
    hiddenGameIds: Array.isArray(r.hiddenGameIds) ? r.hiddenGameIds.filter((x): x is string => typeof x === "string") : [],
    enabledSyncGameIds: Array.isArray(r.enabledSyncGameIds) ? r.enabledSyncGameIds.filter((x): x is string => typeof x === "string") : [],
    customGames: Array.isArray(r.customGames)
      ? (r.customGames as any[])
          .filter(
            (c) =>
              c &&
              typeof c === "object" &&
              typeof c.id === "string" &&
              typeof c.name === "string" &&
              typeof c.savePath === "string"
          )
          .map((c) => ({
            id: String(c.id),
            name: String(c.name),
            savePath: String(c.savePath),
            exePath: typeof c.exePath === "string" ? c.exePath : undefined,
            coverUrl: typeof c.coverUrl === "string" ? c.coverUrl : undefined,
            notes: typeof c.notes === "string" ? c.notes : undefined,
            createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
          }))
      : [],
    customSavePaths: typeof r.customSavePaths === "object" && r.customSavePaths !== null ? (r.customSavePaths as Record<string, string>) : {},
    gameSyncConfigs:
      typeof r.gameSyncConfigs === "object" && r.gameSyncConfigs !== null
        ? (r.gameSyncConfigs as Record<string, GameSyncConfig>)
        : {},
    backupTargetType:
      r.backupTargetType === "asus" ||
      r.backupTargetType === "nas" ||
      r.backupTargetType === "local" ||
      r.backupTargetType === "webdav" ||
      r.backupTargetType === "gdrive" ||
      r.backupTargetType === "mega"
        ? r.backupTargetType
        : "gdrive",
    asusRouterIp: typeof r.asusRouterIp === "string" ? r.asusRouterIp : base.asusRouterIp,
    asusShareName: typeof r.asusShareName === "string" ? r.asusShareName : base.asusShareName,
    asusUsername: typeof r.asusUsername === "string" ? r.asusUsername : base.asusUsername,
    asusPassword: typeof r.asusPassword === "string" ? r.asusPassword : base.asusPassword,
    steamGridDbApiKey: typeof r.steamGridDbApiKey === "string" ? r.steamGridDbApiKey : base.steamGridDbApiKey,
    nasPath: typeof r.nasPath === "string" ? r.nasPath : base.nasPath,
    localBackupPath: typeof r.localBackupPath === "string" ? r.localBackupPath : base.localBackupPath,
    gdrivePath: typeof r.gdrivePath === "string" ? r.gdrivePath : base.gdrivePath,
    gdriveAuth: typeof r.gdriveAuth === "object" && r.gdriveAuth !== null ? (r.gdriveAuth as CloudAccountAuth) : base.gdriveAuth,
    megaPath: typeof r.megaPath === "string" ? r.megaPath : base.megaPath,
    megaAuth:
      typeof r.megaAuth === "object" && r.megaAuth !== null
        ? {
            connected: Boolean((r.megaAuth as any).connected && (r.megaAuth as any).obscuredPass),
            email: (r.megaAuth as any).email || "",
            obscuredPass: (r.megaAuth as any).obscuredPass,
          }
        : base.megaAuth,
    webdavUrl: typeof r.webdavUrl === "string" ? r.webdavUrl : base.webdavUrl,
    webdavUser: typeof r.webdavUser === "string" ? r.webdavUser : base.webdavUser,
    webdavPass: typeof r.webdavPass === "string" ? r.webdavPass : base.webdavPass,
    webdavRemotePath: typeof r.webdavRemotePath === "string" ? r.webdavRemotePath : base.webdavRemotePath,
    cloudRetentionLimit: typeof r.cloudRetentionLimit === "number" ? r.cloudRetentionLimit : base.cloudRetentionLimit,
    localRetentionLimit: typeof r.localRetentionLimit === "number" ? r.localRetentionLimit : base.localRetentionLimit,
    skipUnchangedSaves: typeof r.skipUnchangedSaves === "boolean" ? r.skipUnchangedSaves : base.skipUnchangedSaves,
    syncBeforeLaunch: typeof r.syncBeforeLaunch === "boolean" ? r.syncBeforeLaunch : base.syncBeforeLaunch,
    corruptionGuardEnabled: typeof r.corruptionGuardEnabled === "boolean" ? r.corruptionGuardEnabled : base.corruptionGuardEnabled,
    autostartEnabled: typeof r.autostartEnabled === "boolean" ? r.autostartEnabled : base.autostartEnabled,
    autostartMinimized: typeof r.autostartMinimized === "boolean" ? r.autostartMinimized : base.autostartMinimized,
  };
}

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  factoryResetApp: (wipeSnapshots?: boolean, wipeCache?: boolean) => Promise<void>;
  system: Omit<BootstrapInfo, "settings">;
  accentColor: string | null;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ boot, children }: { boot: BootstrapInfo; children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => sanitize(boot.settings, boot.systemLocale));
  const [accentColor, setAccentColor] = useState<string | null>(boot.accentColor);
  const saveTimer = useRef<number | undefined>(undefined);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const factoryResetApp = useCallback(async (wipeSnapshots = true, wipeCache = true) => {
    window.clearTimeout(saveTimer.current);
    try {
      await api.factoryReset(wipeSnapshots, wipeCache);
    } catch (e) {
      console.error("factoryReset error", e);
    }
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    const fresh = defaultSettings(boot.systemLocale);
    fresh.onboardingDone = false;
    setSettings(fresh);
  }, [boot.systemLocale]);

  // Save to disk shortly after the last change (so dragging a color picker doesn't spam the disk).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api.saveSettings(settings).catch((err) => console.error("Failed to save settings", err));
    }, 300);
    return () => window.clearTimeout(saveTimer.current);
  }, [settings]);

  // Windows accent color can change while Savio is open: re-check when the window gets focus.
  useEffect(() => {
    const refresh = () => {
      api
        .getAccentColor()
        .then((color) => setAccentColor(color))
        .catch(() => undefined);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const value = useMemo<SettingsContextValue>(() => {
    const { settings: _ignored, ...system } = boot;
    return { settings, update, factoryResetApp, system, accentColor };
  }, [settings, update, factoryResetApp, boot, accentColor]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}

export function getGameSyncConfig(settings: Settings, gameId: string): GameSyncConfig {
  const isEnabled = (settings.enabledSyncGameIds || []).includes(gameId);
  const custom = settings.gameSyncConfigs?.[gameId];
  if (custom) {
    return {
      ...custom,
      enabled: isEnabled,
    };
  }
  return {
    enabled: isEnabled,
    syncOnExit: true,
    syncIntervalMinutes: 0,
    autoCloudUpload: true,
    notifyOnSync: true,
  };
}

export interface StorageStatusInfo {
  configured: boolean;
  targetType: BackupTargetType;
  title: string;
  detail: string;
  warning?: string;
}

export function getStorageStatus(settings: Settings): StorageStatusInfo {
  const target = settings.backupTargetType || "gdrive";
  switch (target) {
    case "gdrive": {
      if (settings.gdriveAuth?.connected) {
        return {
          configured: true,
          targetType: "gdrive",
          title: "Google Drive",
          detail: settings.gdriveAuth.email ? `Google Drive (${settings.gdriveAuth.email})` : "Google Drive (подключен)",
        };
      }
      if (settings.gdrivePath && settings.gdrivePath.trim().length > 3) {
        return {
          configured: true,
          targetType: "gdrive",
          title: "Google Drive",
          detail: `Google Drive (${settings.gdrivePath})`,
        };
      }
      return {
        configured: false,
        targetType: "gdrive",
        title: "Google Drive",
        detail: "Google Drive",
        warning: "Аккаунт Google Drive не подключен",
      };
    }
    case "mega": {
      if (settings.megaAuth?.connected && settings.megaAuth?.obscuredPass) {
        return {
          configured: true,
          targetType: "mega",
          title: "MEGA Cloud",
          detail: settings.megaAuth.email ? `MEGA (${settings.megaAuth.email})` : "MEGA (подключен)",
        };
      }
      if (settings.megaPath && settings.megaPath.trim().length > 3) {
        return {
          configured: true,
          targetType: "mega",
          title: "MEGA Cloud",
          detail: `MEGA (${settings.megaPath})`,
        };
      }
      return {
        configured: false,
        targetType: "mega",
        title: "MEGA Cloud",
        detail: "MEGA Cloud",
        warning: "Аккаунт MEGA не подключен (требуется вход)",
      };
    }
    case "local": {
      const p = (settings.localBackupPath || "").trim();
      if (p.length >= 3) {
        return {
          configured: true,
          targetType: "local",
          title: "Локальная папка",
          detail: p,
        };
      }
      return {
        configured: false,
        targetType: "local",
        title: "Локальная папка",
        detail: "Не указана",
        warning: "Папка для бэкапов не выбрана",
      };
    }
    case "webdav": {
      if (settings.webdavUrl && settings.webdavUrl.trim().length > 5 && settings.webdavUser) {
        return {
          configured: true,
          targetType: "webdav",
          title: "WebDAV",
          detail: settings.webdavUrl,
        };
      }
      return {
        configured: false,
        targetType: "webdav",
        title: "WebDAV",
        detail: "Не настроен",
        warning: "WebDAV сервер не настроен",
      };
    }
    case "asus": {
      if (settings.asusRouterIp && settings.asusShareName) {
        return {
          configured: true,
          targetType: "asus",
          title: "ASUS Router SMB",
          detail: `\\\\${settings.asusRouterIp}\\${settings.asusShareName}`,
        };
      }
      return {
        configured: false,
        targetType: "asus",
        title: "ASUS Router SMB",
        detail: "Не настроен",
        warning: "Параметры роутера ASUS не указаны",
      };
    }
    case "nas": {
      if (settings.nasPath && settings.nasPath.trim().length > 3) {
        return {
          configured: true,
          targetType: "nas",
          title: "NAS / SMB",
          detail: settings.nasPath,
        };
      }
      return {
        configured: false,
        targetType: "nas",
        title: "NAS / SMB",
        detail: "Не указан",
        warning: "Путь к сетевой папке NAS не указан",
      };
    }
    default:
      return {
        configured: false,
        targetType: "local",
        title: "Хранилище",
        detail: "",
        warning: "Хранилище не выбрано",
      };
  }
}

