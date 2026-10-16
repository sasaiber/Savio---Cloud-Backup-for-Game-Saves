import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Data returned by Tauri backend once at startup. */
export interface BootstrapInfo {
  settings: unknown | null;
  systemLocale: string;
  accentColor: string | null;
  isSystemDark: boolean;
  portable: boolean;
  dataDir: string;
  version: string;
}

export interface SaveInfo {
  primaryPath: string;
  totalSizeBytes: number;
  fileCount: number;
  lastModified?: number | null;
}

export interface DetectedGame {
  id: string;
  name: string;
  store: "Steam" | "Epic Games" | "Ubisoft" | "GOG" | "Xbox" | "Custom";
  storeId: string;
  installDir: string;
  exePath?: string | null;
  coverUrl?: string | null;
  lastPlayed?: number | null;
  sizeBytes?: number | null;
  saveInfo?: SaveInfo | null;
}

export interface SnapshotMeta {
  id: string;
  gameId: string;
  gameName: string;
  title: string;
  note: string;
  createdAt: number;
  totalSizeBytes: number;
  fileCount: number;
  isActive: boolean;
  source: "local" | "imported" | "autobackup";
  snapshotDir: string;
  store?: string;
  saveFolderName?: string;
  isLocked?: boolean;
  dirHash?: string;
  safetyBackupId?: string;
  originalSavePath?: string;
}

export interface SyncProgressPayload {
  gameId: string;
  gameName: string;
  status: "syncing" | "success" | "skipped" | "error";
  stage?: "creating" | "uploading" | "downloading" | "restoring" | "done";
  cloudTarget?: string | null;
  message: string;
  fileName?: string | null;
  sizeBytes?: number | null;
  timestamp: number;
}

export interface CloudGameManifest {
  gameId: string;
  gameName: string;
  store: string;
  originalSavePath?: string | null;
  lastBackupFile?: string;
  updatedAt?: number;
  version?: string;
}

export interface CloudBackupItem {
  fileName: string;
  sizeBytes: number;
  modified?: number | null;
  targetType: string;
  downloadRef: string;
  isLocked?: boolean;
}

export interface GameProcessStatus {
  isRunning: boolean;
  pid?: number;
  exeName?: string;
}

export interface GameProcessQuery {
  gameId: string;
  gameName: string;
  exePath?: string;
  installDir?: string;
  customExeName?: string;
}

export interface WatchedGame {
  gameId: string;
  gameName: string;
  store?: string;
  savePath: string;
  installDir?: string;
  exePath?: string;
  customExeName?: string;
  syncOnExit: boolean;
  syncIntervalMinutes: number;
  autoCloudUpload: boolean;
  notifyOnSync: boolean;
}

export interface GameSyncEvent {
  gameId: string;
  gameName: string;
  trigger: "exit" | "interval" | "manual";
  success: boolean;
  cloudTarget?: string;
  message: string;
  timestamp: number;
}

const isTauri = typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

export const api = {
  bootstrap: async (): Promise<BootstrapInfo> => {
    if (isTauri) {
      try {
        return await invoke<BootstrapInfo>("bootstrap");
      } catch (e) {
        console.warn("Tauri invoke failed, falling back to defaults", e);
      }
    }

    // Browser dev fallback
    const saved = localStorage.getItem("savio_settings");
    let parsed = null;
    if (saved) {
      try {
        parsed = JSON.parse(saved);
      } catch {
        /* ignore */
      }
    }
    return {
      settings: parsed,
      systemLocale: navigator.language || "ru-RU",
      accentColor: "#0078D4",
      isSystemDark: true, // Default to true matching user Windows 11
      portable: false,
      dataDir: "C:\\Users\\AppData\\Local\\io.savio.desktop",
      version: "0.1.0",
    };
  },

  saveSettings: async (settings: object): Promise<void> => {
    if (isTauri) {
      try {
        return await invoke<void>("save_settings", { settings });
      } catch {
        /* fallback below */
      }
    }
    localStorage.setItem("savio_settings", JSON.stringify(settings));
  },

  getAccentColor: async (): Promise<string | null> => {
    if (isTauri) {
      try {
        return await invoke<string | null>("get_accent_color");
      } catch {
        /* fallback */
      }
    }
    return "#0078D4";
  },

  setTitlebarColors: async (caption: string, text: string, dark: boolean): Promise<void> => {
    if (isTauri) {
      try {
        await invoke<void>("set_titlebar_colors", { caption, text, dark });
      } catch {
        /* ignore */
      }
    }
  },

  openDataFolder: async (): Promise<void> => {
    if (isTauri) {
      return await invoke<void>("open_data_folder");
    }
    console.log("Open data folder requested");
  },

  showWindow: async (): Promise<void> => {
    if (isTauri) {
      try {
        const win = getCurrentWindow();
        await win.show();
        await win.setFocus();
      } catch {
        /* ignore */
      }
    }
  },

  scanGames: async (): Promise<DetectedGame[]> => {
    if (isTauri) {
      try {
        return await invoke<DetectedGame[]>("scan_games");
      } catch (e) {
        console.warn("scan_games failed:", e);
      }
    }
    return [];
  },

  openFolder: async (path: string): Promise<void> => {
    if (isTauri) {
      try {
        return await invoke<void>("open_folder", { path });
      } catch (e) {
        console.warn("open_folder failed:", e);
        throw e;
      }
    }
  },

  testStorageTarget: async (path: string, username?: string, password?: string): Promise<{ accessible: boolean; writable: boolean; message: string }> => {
    if (isTauri) {
      try {
        return await invoke<{ accessible: boolean; writable: boolean; message: string }>("test_storage_target", {
          path,
          username: username || null,
          password: password || null,
        });
      } catch (e) {
        return { accessible: false, writable: false, message: String(e) };
      }
    }
    return { accessible: true, writable: true, message: "Браузерный режим (хранилище проверено)" };
  },

  pickFolder: async (): Promise<string | null> => {
    if (isTauri) {
      try {
        return await invoke<string | null>("pick_folder");
      } catch (e) {
        console.warn("pick_folder failed:", e);
      }
    }
    return null;
  },

  inspectFolder: async (path: string): Promise<SaveInfo | null> => {
    if (isTauri) {
      try {
        return await invoke<SaveInfo | null>("inspect_folder", { path });
      } catch (e) {
        console.warn("inspect_folder failed:", e);
      }
    }
    return null;
  },

  pickFile: async (filter?: string): Promise<string | null> => {
    if (isTauri) {
      try {
        return await invoke<string | null>("pick_file", { filter });
      } catch (e) {
        console.warn("pick_file failed:", e);
      }
    }
    return null;
  },

  listSnapshots: async (gameId: string, savePath?: string | null): Promise<SnapshotMeta[]> => {
    if (isTauri) {
      try {
        return await invoke<SnapshotMeta[]>("list_snapshots", { gameId, savePath: savePath || null });
      } catch (e) {
        console.warn("list_snapshots failed:", e);
      }
    }
    return [];
  },

  createSnapshot: async (
    gameId: string,
    gameName: string,
    sourceDir: string,
    title: string,
    note: string,
    store?: string
  ): Promise<SnapshotMeta> => {
    if (isTauri) {
      return await invoke<SnapshotMeta>("create_snapshot", {
        gameId,
        gameName,
        store: store || null,
        sourceDir,
        title,
        note,
      });
    }
    throw new Error("Tauri only");
  },

  restoreSnapshot: async (
    gameId: string,
    gameName: string,
    snapshotId: string,
    targetDir: string
  ): Promise<SnapshotMeta> => {
    if (isTauri) {
      return await invoke<SnapshotMeta>("restore_snapshot", {
        gameId,
        gameName,
        snapshotId,
        targetDir,
      });
    }
    throw new Error("Tauri only");
  },

  deleteSnapshot: async (gameId: string, snapshotId: string): Promise<void> => {
    if (isTauri) {
      return await invoke<void>("delete_snapshot", { gameId, snapshotId });
    }
  },

  exportSnapshot: async (gameId: string, snapshotId: string, destPath?: string): Promise<string> => {
    if (isTauri) {
      return await invoke<string>("export_snapshot", { gameId, snapshotId, destPath });
    }
    return "export_mock.zip";
  },

  importSnapshot: async (
    gameId: string,
    gameName: string,
    sourcePath: string,
    title: string,
    note: string
  ): Promise<SnapshotMeta> => {
    if (isTauri) {
      return await invoke<SnapshotMeta>("import_snapshot", {
        gameId,
        gameName,
        sourcePath,
        title,
        note,
      });
    }
    throw new Error("Tauri only");
  },

  cloneSaveToDesktop: async (gameName: string, sourceDir: string): Promise<string> => {
    if (isTauri) {
      return await invoke<string>("clone_save_to_desktop", { gameName, sourceDir });
    }
    return "C:\\Users\\Desktop\\mock";
  },

  testWebdav: async (url: string, user: string, pass: string): Promise<string> => {
    if (isTauri) {
      return await invoke<string>("test_webdav", { url, user, pass });
    }
    return "WebDAV OK (Mock)";
  },

  syncSnapshotToCloud: async (
    gameId: string,
    gameName: string,
    snapshotId: string,
    targetType: string,
    settings: any,
    store?: string
  ): Promise<string> => {
    if (isTauri) {
      return await invoke<string>("sync_snapshot_to_cloud", {
        gameId,
        gameName,
        store: store || null,
        snapshotId,
        targetType,
        settings,
      });
    }
    return "Synced OK";
  },


  gdriveLoginOAuth: async (): Promise<{
    status: "success";
    email: string;
    accessToken: string;
    refreshToken: string;
  }> => {
    if (isTauri) {
      return await invoke<any>("gdrive_login_oauth");
    }
    return {
      status: "success",
      email: "user@gmail.com",
      accessToken: "mock_token",
      refreshToken: "mock_refresh",
    };
  },

  gdriveTestToken: async (
    accessToken: string
  ): Promise<{ status: string; email: string; name?: string }> => {
    if (isTauri) {
      return await invoke<any>("gdrive_test_token", { accessToken });
    }
    return { status: "success", email: "user@gmail.com", name: "User" };
  },

  testMegaLogin: async (email: string, pass: string): Promise<{ status: string; email: string; obscuredPass: string; message: string }> => {
    if (isTauri) {
      return await invoke<any>("test_mega_login", { email, pass });
    }
    return { status: "success", email, obscuredPass: "mock", message: `Аккаунт MEGA (${email}) подключен!` };
  },

  listCloudBackups: async (
    gameName: string,
    targetType: string,
    settings: any,
    store?: string,
    gameId?: string
  ): Promise<CloudBackupItem[]> => {
    if (isTauri) {
      return await invoke<CloudBackupItem[]>("list_cloud_backups", {
        gameId: gameId || null,
        gameName,
        store: store || null,
        targetType,
        settings,
      });
    }
    return [];
  },

  getCloudGameManifest: async (
    gameName: string,
    targetType: string,
    settings: any,
    store?: string,
    gameId?: string
  ): Promise<CloudGameManifest | null> => {
    if (isTauri) {
      try {
        return await invoke<CloudGameManifest | null>("get_cloud_game_manifest", {
          gameId: gameId || null,
          gameName,
          store: store || null,
          targetType,
          settings,
        });
      } catch (e) {
        console.warn("get_cloud_game_manifest failed:", e);
      }
    }
    return null;
  },

  restoreCloudBackup: async (
    gameId: string,
    gameName: string,
    fileName: string,
    targetDir: string,
    targetType: string,
    settings: any,
    store?: string
  ): Promise<SnapshotMeta> => {
    if (isTauri) {
      return await invoke<SnapshotMeta>("restore_cloud_backup", {
        gameId,
        gameName,
        store: store || null,
        fileName,
        targetDir,
        targetType,
        settings,
      });
    }
    throw new Error("Tauri only");
  },

  registerWatchedGames: async (games: WatchedGame[]): Promise<void> => {
    if (isTauri) {
      try {
        await invoke("register_watched_games", { games });
      } catch (e) {
        console.warn("register_watched_games failed:", e);
      }
    }
  },

  checkRunningGames: async (queries: GameProcessQuery[]): Promise<Record<string, GameProcessStatus>> => {
    if (isTauri) {
      try {
        return await invoke<Record<string, GameProcessStatus>>("check_running_games", { queries });
      } catch (e) {
        console.warn("check_running_games failed:", e);
      }
    }
    return {};
  },

  getGameExecutables: async (installDir: string): Promise<string[]> => {
    if (isTauri) {
      try {
        return await invoke<string[]>("get_game_executables", { installDir });
      } catch (e) {
        console.warn("get_game_executables failed:", e);
      }
    }
    return [];
  },

  toggleSnapshotLock: async (gameId: string, snapshotId: string): Promise<boolean> => {
    if (isTauri) {
      return await invoke<boolean>("toggle_snapshot_lock", { gameId, snapshotId });
    }
    return true;
  },

  toggleCloudBackupLock: async (
    gameName: string,
    fileName: string,
    targetType: string,
    settings: any,
    store?: string
  ): Promise<string> => {
    if (isTauri) {
      return await invoke<string>("toggle_cloud_backup_lock", {
        gameName,
        store: store || null,
        fileName,
        targetType,
        settings,
      });
    }
    return fileName;
  },

  deleteCloudBackup: async (
    gameName: string,
    fileName: string,
    targetType: string,
    settings: any,
    store?: string
  ): Promise<void> => {
    if (isTauri) {
      return await invoke<void>("delete_cloud_backup", {
        gameName,
        store: store || null,
        fileName,
        targetType,
        settings,
      });
    }
  },

  hasSaveChanged: async (gameId: string, savePath: string): Promise<boolean> => {
    if (isTauri) {
      return await invoke<boolean>("has_save_changed", { gameId, savePath });
    }
    return true;
  },

  getAutostartStatus: async (): Promise<{ enabled: boolean; minimized: boolean }> => {
    if (isTauri) {
      return await invoke<{ enabled: boolean; minimized: boolean }>("get_autostart_status");
    }
    return { enabled: false, minimized: true };
  },

  setAutostart: async (enabled: boolean, minimized: boolean): Promise<void> => {
    if (isTauri) {
      await invoke<void>("set_autostart", { enabled, minimized });
    }
  },

  launchGame: async (target: string): Promise<void> => {
    if (isTauri) {
      await invoke<void>("launch_game", { target });
    } else {
      console.log("Mock launch:", target);
    }
  },

  factoryReset: async (wipeSnapshots: boolean, wipeCache: boolean): Promise<void> => {
    if (isTauri) {
      await invoke<void>("factory_reset", { wipeSnapshots, wipeCache });
    }
  },

  getAvailableDrives: async (): Promise<string[]> => {
    if (isTauri) {
      try {
        return await invoke<string[]>("get_available_drives");
      } catch (e) {
        console.warn("get_available_drives failed:", e);
      }
    }
    return ["C:\\", "D:\\"];
  },

  scanPcGames: async (drives: string[], customPaths: string[]): Promise<DetectedGame[]> => {
    if (isTauri) {
      try {
        return await invoke<DetectedGame[]>("scan_pc_games", { drives, customPaths });
      } catch (e) {
        console.warn("scan_pc_games failed:", e);
      }
    }
    return [];
  },

  discoverRouterShares: async (ip: string, username?: string, password?: string): Promise<string[]> => {
    if (isTauri) {
      return await invoke<string[]>("discover_router_shares", {
        ip,
        username: username || null,
        password: password || null,
      });
    }
    return ["SAVES"];
  },

  inspectArchiveMetadata: async (
    targetType: string,
    settings: any,
    gameName: string,
    fileName: string,
    store?: string,
    gameId?: string
  ): Promise<{
    originalSavePath: string | null;
    adaptedSavePath: string | null;
    folderExists: boolean;
    store?: string;
    saveFolderName?: string;
    lastBackupFile?: string;
  }> => {
    if (isTauri) {
      try {
        return await invoke("inspect_archive_metadata", {
          targetType,
          settings,
          gameName,
          fileName,
          store: store || null,
          gameId: gameId || null,
        });
      } catch (e) {
        console.warn("inspect_archive_metadata failed:", e);
      }
    }
    return {
      originalSavePath: null,
      adaptedSavePath: null,
      folderExists: false,
    };
  },

  findGameCover: async (title: string, steamGridDbApiKey?: string): Promise<string | null> => {
    const cleanTitle = title
      .replace(/[\[\(].*?[\]\)]/g, "")
      .replace(/Complete Edition|Remastered|Definitive Edition|Game of the Year|GOTY|Enhanced Edition|Directors Cut/gi, "")
      .trim();

    // 1. SteamGridDB if API key is provided
    if (steamGridDbApiKey && steamGridDbApiKey.trim()) {
      try {
        const sgRes = await fetch(
          `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(cleanTitle || title)}`,
          { headers: { Authorization: `Bearer ${steamGridDbApiKey.trim()}` } }
        );
        if (sgRes.ok) {
          const sgData = await sgRes.json();
          if (sgData?.success && sgData.data?.length > 0) {
            const gameId = sgData.data[0].id;
            const gridRes = await fetch(
              `https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900`,
              { headers: { Authorization: `Bearer ${steamGridDbApiKey.trim()}` } }
            );
            if (gridRes.ok) {
              const gridData = await gridRes.json();
              if (gridData?.success && gridData.data?.length > 0) {
                return gridData.data[0].url || gridData.data[0].thumb;
              }
            }
          }
        }
      } catch {
        /* fallback to Steam / CheapShark */
      }
    }

    // 2. Steam Store Search (Vertical Library 600x900)
    try {
      const res = await fetch(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanTitle || title)}&l=english&cc=US`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          const id = data.items[0].id;
          return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`;
        }
      }
    } catch {
      /* fallback */
    }

    // 3. CheapShark API (Keyless multi-store PC game database)
    try {
      const csRes = await fetch(
        `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(cleanTitle || title)}`
      );
      if (csRes.ok) {
        const csData = await csRes.json();
        if (Array.isArray(csData) && csData.length > 0) {
          if (csData[0].steamAppID && csData[0].steamAppID !== "null") {
            return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${csData[0].steamAppID}/library_600x900.jpg`;
          }
          if (csData[0].thumb) {
            return csData[0].thumb;
          }
        }
      }
    } catch (e) {
      console.warn("Cover search failed:", e);
    }

    return null;
  },
};

