import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useI18n } from "../i18n/I18nProvider";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { StatusBadge } from "../components/StatusBadge";
import { ExpressiveShape } from "../components/ExpressiveShape";
import { api, type DetectedGame, type GameProcessStatus, type GameSyncEvent, type WatchedGame, type CloudBackupItem } from "../lib/tauri";
import { useSettings, getGameSyncConfig, getStorageStatus, type CustomGameDef } from "../state/settings";
import { notifySyncProgress } from "../components/LiveSyncNotifier";
import { SaveManagerModal } from "../components/SaveManagerModal";
import { GameSettingsModal } from "../components/GameSettingsModal";
import { AddCustomGameModal, EditCustomGameModal, DeleteCustomGameModal } from "../components/CustomGameModal";
import { ScanPcGamesModal } from "../components/ScanPcGamesModal";
import { SyncBeforeLaunchModal } from "../components/SyncBeforeLaunchModal";
import type { StatusKind } from "../theme/color";

export interface GameItem {
  id: string;
  name: string;
  store: "Steam" | "Epic Games" | "Ubisoft" | "GOG" | "Xbox" | "Custom";
  storeId?: string;
  status: StatusKind;
  lastBackup: string;
  saveSize: string;
  saveFilesCount?: number;
  savePath?: string | null;
  coverUrl?: string | null;
  coverGradient: string;
  installDir?: string;
  exePath?: string;
  notes?: string;
  isCustom?: boolean;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes === 0) return "—";
  if (bytes > 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes > 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes > 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
}

const GRADIENTS = [
  "linear-gradient(135deg, #1E1B4B 0%, #4338CA 100%)",
  "linear-gradient(135deg, #311042 0%, #701A75 100%)",
  "linear-gradient(135deg, #064E3B 0%, #047857 100%)",
  "linear-gradient(135deg, #7C2D12 0%, #C2410C 100%)",
  "linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)",
  "linear-gradient(135deg, #4C1D95 0%, #6D28D9 100%)",
];

export interface LibraryProps {
  onNavigateTab?: (tab: "library" | "clouds" | "settings") => void;
}

export function Library({ onNavigateTab }: LibraryProps = {}) {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const storageStatus = getStorageStatus(settings);

  const [search, setSearch] = useState("");
  const [selectedStore, setSelectedStore] = useState<string>("All");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [games, setGames] = useState<GameItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const syncingIdRef = useRef<string | null>(null);
  const syncingAllRef = useRef<boolean>(false);

  useEffect(() => {
    syncingIdRef.current = syncingId;
  }, [syncingId]);

  useEffect(() => {
    syncingAllRef.current = syncingAll;
  }, [syncingAll]);

  // Modals state
  const [confirmingSyncGame, setConfirmingSyncGame] = useState<GameItem | null>(null);
  const [editingPathGame, setEditingPathGame] = useState<GameItem | null>(null);
  const [manualPathInput, setManualPathInput] = useState<string>("");
  const [managingGame, setManagingGame] = useState<GameItem | null>(null);
  const [managingInitialTab, setManagingInitialTab] = useState<"local" | "cloud">("local");
  const [settingsGame, setSettingsGame] = useState<GameItem | null>(null);
  const [runningGamesMap, setRunningGamesMap] = useState<Record<string, GameProcessStatus>>({});

  // Custom games modals state
  const [isAddCustomOpen, setIsAddCustomOpen] = useState(false);
  const [isScanPcOpen, setIsScanPcOpen] = useState(false);
  const [editingCustomGame, setEditingCustomGame] = useState<CustomGameDef | null>(null);
  const [deletingCustomGame, setDeletingCustomGame] = useState<GameItem | null>(null);

  // Sync Before Launch state
  const [launchConflict, setLaunchConflict] = useState<{
    game: GameItem;
    targetToLaunch: string;
    cloudBackup: CloudBackupItem;
    localLastModified: number;
    localSizeBytes: number;
  } | null>(null);
  const [isCheckingLaunch, setIsCheckingLaunch] = useState<string | null>(null);
  const [isRestoringForLaunch, setIsRestoringForLaunch] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  const rawStoreGamesRef = useRef<DetectedGame[] | null>(null);

  const loadGames = useCallback(async (forceRescan = false) => {
    setIsScanning(true);
    try {
      // 1. Map custom games from settings
      const customMapped: GameItem[] = await Promise.all(
        (settings.customGames || []).map(async (c, idx) => {
          let stats = null;
          if (c.savePath && c.savePath.trim().length >= 3) {
            try {
              stats = await api.inspectFolder(c.savePath);
            } catch {
              stats = null;
            }
          }
          const saveSizeStr = stats ? formatBytes(stats.totalSizeBytes) : "—";
          const lastBackupStr = stats?.lastModified
            ? new Date(stats.lastModified * 1000).toLocaleDateString()
            : t("common.custom");

          return {
            id: c.id,
            name: c.name,
            store: "Custom" as const,
            storeId: c.id,
            status: "localNewer" as StatusKind,
            lastBackup: lastBackupStr,
            saveSize: saveSizeStr,
            saveFilesCount: stats?.fileCount,
            savePath: c.savePath,
            coverUrl: c.coverUrl || null,
            coverGradient: GRADIENTS[(idx + 3) % GRADIENTS.length],
            installDir: c.exePath ? c.exePath.replace(/\\[^\\]+$/, "") : undefined,
            exePath: c.exePath,
            notes: c.notes,
            isCustom: true,
          };
        })
      );

      // 2. Map store games from native scanner (cached unless forceRescan or first load)
      let scanned = rawStoreGamesRef.current;
      if (forceRescan || scanned === null) {
        scanned = await api.scanGames();
        rawStoreGamesRef.current = scanned;
      }

      let storeMapped: GameItem[] = [];
      if (scanned && scanned.length > 0) {
        const seen = new Set<string>();
        const unique = scanned.filter((g) => {
          if (seen.has(g.id)) return false;
          seen.add(g.id);
          return true;
        });

        storeMapped = unique.map((g: DetectedGame, idx: number) => {
          const customPath = settings.customSavePaths[g.id];
          const finalSavePath = customPath || g.saveInfo?.primaryPath || null;

          const saveSizeStr = g.saveInfo
            ? formatBytes(g.saveInfo.totalSizeBytes)
            : formatBytes(g.sizeBytes);

          const lastBackupStr = g.saveInfo?.lastModified
            ? new Date(g.saveInfo.lastModified * 1000).toLocaleDateString()
            : g.lastPlayed
            ? new Date(g.lastPlayed * 1000).toLocaleDateString()
            : t("library.readyToSave");

          return {
            id: g.id,
            name: g.name,
            store: g.store as any,
            storeId: g.storeId,
            status: "localNewer" as StatusKind,
            lastBackup: lastBackupStr,
            saveSize: saveSizeStr,
            saveFilesCount: g.saveInfo?.fileCount,
            savePath: finalSavePath,
            coverUrl: g.coverUrl,
            coverGradient: GRADIENTS[idx % GRADIENTS.length],
            installDir: g.installDir,
            isCustom: false,
          };
        });
      }

      setGames([...customMapped, ...storeMapped]);
    } catch (e) {
      console.warn("Failed to load games:", e);
    } finally {
      setIsScanning(false);
    }
  }, [settings.customSavePaths, settings.customGames]);

  useEffect(() => {
    loadGames(false);
  }, [loadGames]);

  // Counts
  const hiddenCount = useMemo(
    () => games.filter((g) => settings.hiddenGameIds.includes(g.id)).length,
    [games, settings.hiddenGameIds]
  );

  const enabledSyncCount = useMemo(
    () =>
      games.filter(
        (g) => settings.enabledSyncGameIds.includes(g.id) && !settings.hiddenGameIds.includes(g.id)
      ).length,
    [games, settings.enabledSyncGameIds, settings.hiddenGameIds]
  );

  const storeCounts = useMemo(() => {
    const counts: Record<string, number> = { All: 0, Custom: 0 };
    for (const g of games) {
      if (!settings.hiddenGameIds.includes(g.id)) {
        counts.All = (counts.All || 0) + 1;
        const st = g.isCustom ? "Custom" : (g.store || "Custom");
        counts[st] = (counts[st] || 0) + 1;
      }
    }
    return counts;
  }, [games, settings.hiddenGameIds]);

  const visibleStores = useMemo(() => {
    const base = ["All", "Custom", "Steam", "Epic Games", "Ubisoft", "Rockstar Games"];
    for (const s of Object.keys(storeCounts)) {
      if (!base.includes(s) && (storeCounts[s] || 0) > 0) {
        base.push(s);
      }
    }
    for (const s of ["EA App", "GOG", "Xbox"]) {
      if ((storeCounts[s] || 0) > 0 && !base.includes(s)) {
        base.push(s);
      }
    }
    return base;
  }, [storeCounts]);

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      const isHidden = settings.hiddenGameIds.includes(g.id);

      if (selectedStore === "Hidden") {
        if (!isHidden) return false;
      } else if (selectedStore === "Sync") {
        if (isHidden) return false;
        if (!settings.enabledSyncGameIds.includes(g.id)) return false;
      } else if (selectedStore === "Custom") {
        if (isHidden) return false;
        if (!g.isCustom && g.store !== "Custom") return false;
      } else {
        if (isHidden) return false;
        if (selectedStore !== "All" && g.store !== selectedStore) return false;
      }

      if (search.trim()) {
        const query = search.toLowerCase();
        return g.name.toLowerCase().includes(query);
      }
      return true;
    });
  }, [games, selectedStore, search, settings.hiddenGameIds]);

  // 1. Register watched games with background auto-sync watcher
  useEffect(() => {
    if (games.length === 0) return;
    const watchedList: WatchedGame[] = [];
    for (const g of games) {
      const cfg = getGameSyncConfig(settings, g.id);
      const isSyncOn = settings.enabledSyncGameIds.includes(g.id);
      if (isSyncOn && g.savePath) {
        watchedList.push({
          gameId: g.id,
          gameName: g.name,
          store: g.isCustom ? "Custom" : g.store,
          savePath: g.savePath,
          installDir: g.installDir,
          exePath: g.exePath,
          customExeName: cfg.customExeName,
          syncOnExit: cfg.syncOnExit,
          syncIntervalMinutes: cfg.syncIntervalMinutes,
          autoCloudUpload: cfg.autoCloudUpload,
          notifyOnSync: cfg.notifyOnSync,
        });
      }
    }

    api.registerWatchedGames(watchedList);
  }, [games, settings.enabledSyncGameIds, settings.gameSyncConfigs]);

  // 2. Poll running process status for games (lightweight, paused during active uploads/downloads)
  const gameIdsKey = useMemo(
    () => games.map((g) => `${g.id}:${g.exePath || ""}`).join("|"),
    [games]
  );

  useEffect(() => {
    if (games.length === 0) return;
    const queries = games.map((g) => {
      const cfg = getGameSyncConfig(settings, g.id);
      return {
        gameId: g.id,
        gameName: g.name,
        exePath: g.exePath,
        installDir: g.installDir,
        customExeName: cfg.customExeName,
      };
    });

    const runCheck = async () => {
      // Pause process check during active transfer to avoid CPU/disk contention and lag
      if (syncingIdRef.current || syncingAllRef.current) return;
      try {
        const res = await api.checkRunningGames(queries);
        setRunningGamesMap(res);
      } catch {
        /* ignore */
      }
    };

    runCheck();
    const interval = setInterval(runCheck, 5000);
    return () => clearInterval(interval);
  }, [gameIdsKey, settings.gameSyncConfigs]);

  // 3. Listen for background game watcher events (started, exited, auto-synced)
  useEffect(() => {
    let unlistenStarted: (() => void) | undefined;
    let unlistenExited: (() => void) | undefined;
    let unlistenSynced: (() => void) | undefined;

    listen<{ gameId: string; gameName: string; pid?: number; exeName?: string }>(
      "savio://game-started",
      (event) => {
        showToast(t("library.gameStartedToast", { game: event.payload.gameName }));
        setRunningGamesMap((prev) => ({
          ...prev,
          [event.payload.gameId]: {
            isRunning: true,
            pid: event.payload.pid,
            exeName: event.payload.exeName,
          },
        }));
      }
    ).then((u) => {
      unlistenStarted = u;
    });

    listen<{ gameId: string; gameName: string }>(
      "savio://game-exited",
      (event) => {
        showToast(t("library.gameClosedToast", { game: event.payload.gameName }));
        setRunningGamesMap((prev) => ({
          ...prev,
          [event.payload.gameId]: { isRunning: false },
        }));
      }
    ).then((u) => {
      unlistenExited = u;
    });

    listen<GameSyncEvent>("savio://game-synced", (event) => {
      const p = event.payload;
      if (p.success) {
        showToast(`✓ «${p.gameName}»: ${p.message}`);
        setGames((prev) =>
          prev.map((g) => (g.id === p.gameId ? { ...g, lastBackup: t("common.justNow"), status: "synced" } : g))
        );
      } else {
        showToast(`⚠️ «${p.gameName}»: ${p.message}`);
      }
    }).then((u) => {
      unlistenSynced = u;
    });

    return () => {
      if (unlistenStarted) unlistenStarted();
      if (unlistenExited) unlistenExited();
      if (unlistenSynced) unlistenSynced();
    };
  }, []);

  // Actions
  const handleToggleHideGame = (gameId: string) => {
    const isHidden = settings.hiddenGameIds.includes(gameId);
    let updated: string[];
    if (isHidden) {
      updated = settings.hiddenGameIds.filter((id) => id !== gameId);
      showToast(t("library.gameRestoredToast"));
    } else {
      updated = [...settings.hiddenGameIds, gameId];
      // Automatically remove from enabled sync if hidden
      const nextSync = settings.enabledSyncGameIds.filter((id) => id !== gameId);
      update({ enabledSyncGameIds: nextSync });
      showToast(t("library.gameHiddenToast"));
    }
    update({ hiddenGameIds: updated });
  };

  const handleOpenFolder = async (path: string) => {
    try {
      await api.openFolder(path);
    } catch (err) {
      showToast(t("library.folderNotExistsToast", { path }));
    }
  };

  const handlePickCustomFolder = async () => {
    try {
      const picked = await api.pickFolder();
      if (picked) {
        setManualPathInput(picked);
      }
    } catch (e) {
      console.warn("Folder picker error:", e);
    }
  };

  const handleSaveCustomPath = () => {
    if (!editingPathGame) return;
    const path = manualPathInput.trim();
    const updated = { ...settings.customSavePaths, [editingPathGame.id]: path };
    update({ customSavePaths: updated });
    setGames((prev) =>
      prev.map((g) => (g.id === editingPathGame.id ? { ...g, savePath: path || null } : g))
    );
    setEditingPathGame(null);
    showToast(t("library.pathUpdatedToast", { game: editingPathGame.name }));
  };

  const handleEnableSync = (game: GameItem) => {
    setConfirmingSyncGame(game);
  };

  const confirmEnableSync = () => {
    if (!confirmingSyncGame) return;
    const updated = [...settings.enabledSyncGameIds, confirmingSyncGame.id];
    update({ enabledSyncGameIds: updated });
    setConfirmingSyncGame(null);
    showToast(t("library.syncEnabledToast", { game: confirmingSyncGame.name }));
  };

  const handleDisableSync = (gameId: string) => {
    const updated = settings.enabledSyncGameIds.filter((id) => id !== gameId);
    update({ enabledSyncGameIds: updated });
    showToast(t("library.syncDisabledToast"));
  };

  const handleSaveCustomGame = (newGame: CustomGameDef) => {
    const next = [...(settings.customGames || []), newGame];
    update({ customGames: next });
    // User chooses when to enable sync manually, do NOT auto-enable
  };

  const handleImportDiscoveredGames = (newGames: CustomGameDef[]) => {
    const existingIds = new Set((settings.customGames || []).map((cg) => cg.id));
    const existingNames = new Set(
      (settings.customGames || []).map((cg) => cg.name.trim().toLowerCase())
    );
    const existingExes = new Set(
      (settings.customGames || [])
        .map((cg) => (cg.exePath ? cg.exePath.trim().toLowerCase().replace(/\\/g, "/") : ""))
        .filter(Boolean)
    );

    const safeToAdd = newGames.filter((g) => {
      if (existingIds.has(g.id)) return false;
      if (existingNames.has(g.name.trim().toLowerCase())) return false;
      if (g.exePath && existingExes.has(g.exePath.trim().toLowerCase().replace(/\\/g, "/"))) return false;
      return true;
    });

    if (safeToAdd.length === 0) return;

    const next = [...(settings.customGames || []), ...safeToAdd];
    update({
      customGames: next,
    });
    showToast(t("library.gamesDiscoveredToast", { count: safeToAdd.length }));
  };

  const handleUpdateCustomGame = (updated: CustomGameDef) => {
    const next = (settings.customGames || []).map((c) => (c.id === updated.id ? updated : c));
    update({ customGames: next });
  };

  const handleConfirmDeleteCustomGame = () => {
    if (!deletingCustomGame) return;
    const id = deletingCustomGame.id;
    const nextGames = (settings.customGames || []).filter((c) => c.id !== id);
    const nextSync = settings.enabledSyncGameIds.filter((x) => x !== id);
    const nextHidden = settings.hiddenGameIds.filter((x) => x !== id);
    update({
      customGames: nextGames,
      enabledSyncGameIds: nextSync,
      hiddenGameIds: nextHidden,
    });
    showToast(t("library.gameDeletedToast", { game: deletingCustomGame.name }));
    setDeletingCustomGame(null);
  };

  const handleLaunchGame = async (game: GameItem) => {
    let target = game.exePath;
    if (!target && game.store?.toLowerCase() === "steam" && game.id.startsWith("steam_")) {
      const appid = game.id.replace("steam_", "");
      target = `steam://run/${appid}`;
    }

    if (!target) {
      showToast(t("library.exeNotFoundToast"));
      return;
    }

    if (settings.syncBeforeLaunch && game.savePath) {
      setIsCheckingLaunch(game.id);
      try {
        const gameStore = game.isCustom ? "Custom" : game.store;
        const cloudBackups = await api.listCloudBackups(
          game.name,
          settings.backupTargetType,
          settings,
          gameStore,
          game.id
        );

        if (cloudBackups && cloudBackups.length > 0) {
          const sorted = [...cloudBackups].sort((a, b) => (b.modified || 0) - (a.modified || 0));
          const latestCloud = sorted[0];

          if (latestCloud && latestCloud.modified) {
            const localInfo = await api.inspectFolder(game.savePath);
            const localMtimeSec = localInfo?.lastModified ? Math.floor(localInfo.lastModified / 1000) : 0;

            if (latestCloud.modified > localMtimeSec + 60) {
              setLaunchConflict({
                game,
                targetToLaunch: target,
                cloudBackup: latestCloud,
                localLastModified: localInfo?.lastModified || 0,
                localSizeBytes: localInfo?.totalSizeBytes || 0,
              });
              setIsCheckingLaunch(null);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("Sync before launch check failed:", err);
      } finally {
        setIsCheckingLaunch(null);
      }
    }

    try {
      await api.launchGame(target);
      showToast(t("library.launchingGameToast", { game: game.name }));
    } catch (e) {
      showToast(t("library.launchErrorToast", { error: String(e) }));
    }
  };

  const handleResolveConflictDownloadAndLaunch = async () => {
    if (!launchConflict) return;
    const { game, targetToLaunch, cloudBackup } = launchConflict;
    setIsRestoringForLaunch(true);
    showToast(t("library.downloadingFreshToast"));

    try {
      const gameStore = game.isCustom ? "Custom" : game.store;
      await api.restoreCloudBackup(
        game.id,
        game.name,
        cloudBackup.fileName,
        game.savePath!,
        settings.backupTargetType,
        settings,
        gameStore
      );
      showToast(t("library.saveRestoredLaunchToast"));
      setLaunchConflict(null);
      await api.launchGame(targetToLaunch);
    } catch (e) {
      showToast(t("library.restoreErrorToast", { error: String(e) }));
    } finally {
      setIsRestoringForLaunch(false);
    }
  };

  const handleResolveConflictKeepLocalAndLaunch = async () => {
    if (!launchConflict) return;
    const { targetToLaunch, game } = launchConflict;
    setLaunchConflict(null);
    try {
      await api.launchGame(targetToLaunch);
      showToast(t("library.launchingLocalToast", { game: game.name }));
    } catch (e) {
      showToast(t("library.launchErrorToast", { error: String(e) }));
    }
  };

  const handleSyncSingle = async (game: GameItem) => {
    if (!game.savePath) {
      showToast(t("library.noSavePathToast"));
      return;
    }

    if (!storageStatus.configured) {
      showToast(t("library.noStorageConfiguredToast"));
      notifySyncProgress({
        gameId: game.id,
        gameName: game.name,
        status: "error",
        message: t("library.noStorageConfiguredToast"),
        timestamp: Date.now(),
      });
      return;
    }

    setSyncingId(game.id);
    notifySyncProgress({
      gameId: game.id,
      gameName: game.name,
      status: "syncing",
      stage: "creating",
      cloudTarget: storageStatus.title,
      message: t("library.syncStatusPreparing", { game: game.name }),
      timestamp: Date.now(),
    });

    try {
      if (settings.skipUnchangedSaves) {
        const hasChanged = await api.hasSaveChanged(game.id, game.savePath);
        if (!hasChanged) {
          showToast(t("library.savesUpToDateToast", { game: game.name }));
          notifySyncProgress({
            gameId: game.id,
            gameName: game.name,
            status: "skipped",
            cloudTarget: storageStatus.title,
            message: t("library.savesUpToDateToast", { game: game.name }),
            timestamp: Date.now(),
          });
          setGames((prev) =>
            prev.map((g) => (g.id === game.id ? { ...g, status: "synced" } : g))
          );
          setSyncingId(null);
          return;
        }
      }

      const gameStore = game.isCustom ? "Custom" : game.store;
      const snap = await api.createSnapshot(
        game.id,
        game.name,
        game.savePath,
        t("library.lastBackup", { time: new Date().toLocaleDateString() }),
        t("library.syncNow"),
        gameStore
      );

      notifySyncProgress({
        gameId: game.id,
        gameName: game.name,
        status: "syncing",
        stage: "uploading",
        cloudTarget: storageStatus.title,
        sizeBytes: snap.totalSizeBytes,
        message: t("library.syncStatusUploading", { target: storageStatus.title }),
        timestamp: Date.now(),
      });

      const res = await api.syncSnapshotToCloud(
        game.id,
        game.name,
        snap.id,
        settings.backupTargetType,
        settings,
        gameStore
      );

      setGames((prev) =>
        prev.map((g) => (g.id === game.id ? { ...g, status: "synced", lastBackup: t("common.justNow") } : g))
      );

      notifySyncProgress({
        gameId: game.id,
        gameName: game.name,
        status: "success",
        stage: "done",
        cloudTarget: storageStatus.title,
        sizeBytes: snap.totalSizeBytes,
        message: t("library.syncStatusSuccess", { game: game.name, target: storageStatus.title }),
        timestamp: Date.now(),
      });

      showToast(res || t("library.uploadSuccessToast"));
    } catch (e) {
      notifySyncProgress({
        gameId: game.id,
        gameName: game.name,
        status: "error",
        cloudTarget: storageStatus.title,
        message: String(e),
        timestamp: Date.now(),
      });
      showToast(t("library.uploadErrorToast", { error: String(e) }));
    } finally {
      setSyncingId(null);
    }
  };

  const handleOpenCloudRestore = (game: GameItem) => {
    setManagingInitialTab("cloud");
    setManagingGame(game);
  };

  const handleOpenLocalHistory = (game: GameItem) => {
    setManagingInitialTab("local");
    setManagingGame(game);
  };

  const handleSyncAll = async () => {
    if (!storageStatus.configured) {
      showToast(t("library.noStorageConfiguredToast"));
      notifySyncProgress({
        gameId: "all_games",
        gameName: t("library.title"),
        status: "error",
        message: t("library.noStorageConfiguredToast"),
        timestamp: Date.now(),
      });
      return;
    }

    const syncable = games.filter(
      (g) =>
        settings.enabledSyncGameIds.includes(g.id) &&
        !settings.hiddenGameIds.includes(g.id) &&
        g.savePath
    );

    if (syncable.length === 0) {
      showToast(t("library.noTrackedGamesToast"));
      return;
    }

    setSyncingAll(true);
    let successCount = 0;
    let skippedCount = 0;
    for (let idx = 0; idx < syncable.length; idx++) {
      const g = syncable[idx];
      try {
        notifySyncProgress({
          gameId: g.id,
          gameName: g.name,
          status: "syncing",
          stage: "uploading",
          cloudTarget: storageStatus.title,
          message: t("library.syncAllProgress", { current: String(idx + 1), total: String(syncable.length), game: g.name }),
          timestamp: Date.now(),
        });

        if (settings.skipUnchangedSaves) {
          const changed = await api.hasSaveChanged(g.id, g.savePath!);
          if (!changed) {
            skippedCount++;
            continue;
          }
        }
        const gameStore = g.isCustom ? "Custom" : g.store;
        const snap = await api.createSnapshot(
          g.id,
          g.name,
          g.savePath!,
          t("library.lastBackup", { time: new Date().toLocaleDateString() }),
          t("library.syncNow"),
          gameStore
        );
        await api.syncSnapshotToCloud(
          g.id,
          g.name,
          snap.id,
          settings.backupTargetType,
          settings,
          gameStore
        );
        successCount++;
      } catch (err) {
        console.warn(`Sync failed for ${g.name}:`, err);
      }
    }
    setGames((prev) =>
      prev.map((g) =>
        syncable.some((s) => s.id === g.id)
          ? { ...g, status: "synced", lastBackup: t("common.justNow") }
          : g
      )
    );
    setSyncingAll(false);
    notifySyncProgress({
      gameId: "all_games",
      gameName: t("library.title"),
      status: "success",
      stage: "done",
      cloudTarget: storageStatus.title,
      message: t("library.groupSyncSuccessToast", { success: String(successCount), total: String(syncable.length), target: storageStatus.title }),
      timestamp: Date.now(),
    });
    if (skippedCount > 0) {
      showToast(t("library.groupSyncDoneToast", { success: String(successCount), skipped: String(skippedCount) }));
    } else {
      showToast(t("library.groupSyncSuccessToast", { success: String(successCount), total: String(syncable.length), target: settings.backupTargetType.toUpperCase() }));
    }
  };

  const getTargetStorageLabel = () => {
    switch (settings.backupTargetType) {
      case "gdrive":
        return settings.gdriveAuth?.connected
          ? `Google Drive (${settings.gdriveAuth.email})`
          : `Google Drive (${settings.gdrivePath || "G:\\My Drive\\SavioSaves"})`;
      case "mega":
        return settings.megaAuth?.connected && settings.megaAuth?.obscuredPass
          ? `MEGA Cloud (${settings.megaAuth.email})`
          : `MEGA (${settings.megaPath || "MEGAsync\\SavioSaves"})`;
      case "webdav":
        return `WebDAV (${settings.webdavUrl})`;
      case "asus":
        return `ASUS Router SMB (\\\\${settings.asusRouterIp}\\${settings.asusShareName})`;
      case "local":
        return t("library.localFolderLabel", { path: settings.localBackupPath });
      case "nas":
        return `NAS (${settings.nasPath})`;
      default:
        return t("common.storage");
    }
  };

  const getTargetStorageName = () => {
    switch (settings.backupTargetType) {
      case "gdrive":
        return "Google Drive";
      case "mega":
        return "MEGA";
      case "webdav":
        return "WebDAV";
      case "asus":
        return "ASUS SMB";
      case "local":
        return t("common.local");
      case "nas":
        return "NAS";
      default:
        return t("common.cloud");
    }
  };

  return (
    <div
      style={{
        flex: 1,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: "28px 36px",
        background: "transparent",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: 30,
            right: 36,
            zIndex: 1000,
            background: "var(--md-sys-color-inverse-surface)",
            color: "var(--md-sys-color-inverse-on-surface)",
            padding: "14px 22px",
            borderRadius: 18,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            fontSize: 13,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 12,
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          <Icon name="info" size={20} color="var(--md-sys-color-primary)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* M3 Expressive Save Vault Banner */}
      <div
        style={{
          borderRadius: 32,
          padding: "24px 28px",
          background: "linear-gradient(135deg, var(--md-sys-color-primary-container) 0%, var(--md-sys-color-surface-container-high) 100%)",
          border: "1.5px solid var(--md-sys-color-outline-variant)",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 8px 28px var(--md-sys-color-shadow)",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <ExpressiveShape size={64} initialShape="cookie9" hoverShape="squircle" fill="var(--md-sys-color-primary)">
            <Icon name="verified_user" size={32} color="var(--md-sys-color-on-primary)" />
          </ExpressiveShape>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px", color: "var(--md-sys-color-on-primary-container)" }}>
                Savio Game Vault
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: 9999,
                  background: enabledSyncCount > 0 ? "var(--status-synced-container)" : "var(--md-sys-color-surface-container-high)",
                  color: enabledSyncCount > 0 ? "var(--status-synced)" : "var(--md-sys-color-on-surface-variant)",
                  letterSpacing: "0.4px",
                  textTransform: "uppercase",
                }}
              >
                {t("library.trackedCount", { count: enabledSyncCount, total: games.length })}
              </span>
            </div>
            <p
              style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", marginTop: 4, lineHeight: 1.4 }}
              dangerouslySetInnerHTML={{
                __html: t("library.storageLabel", { storage: getTargetStorageLabel() })
              }}
            />
            {!storageStatus.configured && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 14px",
                  borderRadius: 14,
                  background: "var(--md-sys-color-error-container)",
                  color: "var(--md-sys-color-on-error-container)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700 }}>
                  <Icon name="sync_problem" size={16} color="var(--md-sys-color-error)" />
                  <span>{t("library.storageNotConfiguredBanner")}</span>
                </div>
                <Button
                  variant="filled"
                  size="sm"
                  pill
                  icon="cloud"
                  onClick={() => onNavigateTab?.("clouds")}
                >
                  {t("library.setupStorageButton")}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <Button
            variant="filled"
            size="lg"
            pill
            icon="sync"
            disabled={syncingAll || isScanning || enabledSyncCount === 0}
            onClick={handleSyncAll}
          >
            {syncingAll ? t("library.syncing") : t("library.syncAll", { count: enabledSyncCount })}
          </Button>
          <Button
            variant="tonal"
            size="lg"
            pill
            icon="restart_alt"
            disabled={isScanning}
            onClick={() => loadGames(true)}
          >
            {isScanning ? t("common.loading") : t("library.refreshLibrary")}
          </Button>
        </div>
      </div>

      {/* Header Row: Title, Add Custom Game, & Expressive Search Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>
            {selectedStore === "Hidden"
              ? t("library.hiddenTitle")
              : selectedStore === "Sync"
              ? t("library.syncTitle")
              : selectedStore === "Custom"
              ? t("library.customGamesCount", { count: filteredGames.length })
              : t("library.title")}
          </h1>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--md-sys-color-primary)",
              background: "var(--md-sys-color-primary-container)",
              padding: "3px 12px",
              borderRadius: 9999,
            }}
          >
            {filteredGames.length}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Button
            variant="tonal"
            size="md"
            pill
            icon="search"
            onClick={() => setIsScanPcOpen(true)}
          >
            {t("library.scanPcButton")}
          </Button>

          <Button
            variant="filled"
            size="md"
            pill
            icon="add"
            onClick={() => setIsAddCustomOpen(true)}
          >
            {t("library.addCustomGame")}
          </Button>

          {/* Large M3 Pill Search Input */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "var(--md-sys-color-surface-container-high)",
              borderRadius: 9999,
              padding: "0 20px",
              height: 48,
              width: 320,
              border: "1.5px solid var(--md-sys-color-outline-variant)",
              boxShadow: "0 2px 8px var(--md-sys-color-shadow)",
            }}
          >
            <Icon name="search" size={22} color="var(--md-sys-color-primary)" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("library.search")}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--md-sys-color-on-surface)",
                fontSize: 14,
                width: "100%",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="m3-btn"
                style={{ color: "var(--md-sys-color-on-surface-variant)", display: "flex", cursor: "pointer", background: "none", border: "none" }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>✕</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* M3 Expressive Filter Chips Row (Including 'Hidden' island) */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          marginBottom: 24,
          padding: "2px 0",
        }}
      >
        {visibleStores.map((s) => {
          const isSelected = selectedStore === s;
          const count = s === "All" ? storeCounts.All || 0 : s === "Custom" ? storeCounts.Custom || 0 : storeCounts[s] || 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSelectedStore(s)}
              className="m3-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 18px",
                borderRadius: 9999,
                fontSize: 13,
                fontWeight: 700,
                background: isSelected
                  ? "var(--md-sys-color-primary-container)"
                  : "var(--md-sys-color-surface-container-low)",
                color: isSelected
                  ? "var(--md-sys-color-on-primary-container)"
                  : "var(--md-sys-color-on-surface)",
                border: isSelected
                  ? "2px solid var(--md-sys-color-primary)"
                  : "2px solid var(--md-sys-color-outline-variant)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxSizing: "border-box",
                boxShadow: isSelected ? "0 2px 8px var(--md-sys-color-shadow)" : "none",
                flexShrink: 0,
              }}
            >
              {isSelected && <Icon name="check" size={16} />}
              <span>
                {s === "All"
                  ? `${t("library.all")} (${count})`
                  : s === "Custom"
                  ? `${t("common.custom")} (${count})`
                  : `${s} (${count})`}
              </span>
            </button>
          );
        })}

        {/* Dedicated Synchronized Games Island Chip */}
        <button
          type="button"
          onClick={() => setSelectedStore(selectedStore === "Sync" ? "All" : "Sync")}
          className="m3-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 700,
            background: selectedStore === "Sync"
              ? "var(--md-sys-color-primary-container)"
              : "var(--md-sys-color-surface-container-low)",
            color: selectedStore === "Sync"
              ? "var(--md-sys-color-on-primary-container)"
              : "var(--md-sys-color-on-surface)",
            border: selectedStore === "Sync"
              ? "2px solid var(--md-sys-color-primary)"
              : "2px solid var(--md-sys-color-outline-variant)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            boxSizing: "border-box",
            flexShrink: 0,
            boxShadow: selectedStore === "Sync" ? "0 2px 10px rgba(0, 180, 216, 0.3)" : "none",
          }}
        >
          <Icon name="sync" size={16} color={selectedStore === "Sync" ? "var(--md-sys-color-on-primary-container)" : "var(--status-synced)"} />
          <span>{t("library.syncFilter", { count: enabledSyncCount })}</span>
        </button>

        {/* Dedicated Hidden Games Island Chip */}
        <button
          type="button"
          onClick={() => setSelectedStore(selectedStore === "Hidden" ? "All" : "Hidden")}
          className="m3-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 700,
            background: selectedStore === "Hidden"
              ? "var(--md-sys-color-error-container)"
              : "var(--md-sys-color-surface-container-low)",
            color: selectedStore === "Hidden"
              ? "var(--md-sys-color-on-error-container)"
              : "var(--md-sys-color-on-surface-variant)",
            border: selectedStore === "Hidden"
              ? "2px solid var(--md-sys-color-error)"
              : "2px dashed var(--md-sys-color-outline-variant)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            boxSizing: "border-box",
            flexShrink: 0,
          }}
        >
          <Icon name="visibility_off" size={16} />
          <span>{t("library.hiddenGames", { count: hiddenCount })}</span>
        </button>
      </div>

      {/* Games Grid (Material You 3 Expressive Cards) */}
      {filteredGames.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--md-sys-color-on-surface-variant)",
            fontSize: 16,
            minHeight: 260,
            gap: 16,
            textAlign: "center",
          }}
        >
          <Icon name={selectedStore === "Hidden" ? "visibility" : "sports_esports"} size={54} color="var(--md-sys-color-outline)" />
          <div style={{ maxWidth: 440 }}>
            {selectedStore === "Hidden" ? (
              <span>{t("library.noHiddenGames")}</span>
            ) : selectedStore === "Custom" ? (
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--md-sys-color-on-surface)", marginBottom: 6 }}>
                  {t("library.noCustomGamesTitle")}
                </h3>
                <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.5, margin: 0 }}>
                  {t("library.noCustomGamesText")}
                </p>
                <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center" }}>
                  <Button variant="filled" size="md" pill icon="search" onClick={() => setIsScanPcOpen(true)}>
                    {t("library.scanPcButton")}
                  </Button>
                  <Button variant="tonal" size="md" pill icon="add" onClick={() => setIsAddCustomOpen(true)}>
                    {t("library.addCustomGame")}
                  </Button>
                </div>
              </div>
            ) : (
              <span>{t("library.empty")}</span>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 22,
            paddingBottom: 32,
          }}
        >
          {filteredGames.map((game) => {
            const isSyncing = syncingId === game.id;
            const isHidden = settings.hiddenGameIds.includes(game.id);
            const isSyncEnabled = settings.enabledSyncGameIds.includes(game.id);

            return (
              <Card
                key={game.id}
                elevation="low"
                radius={28}
                interactive
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: 16,
                  background: "var(--md-sys-color-surface-container-low)",
                  border: isSyncEnabled
                    ? "1.5px solid var(--md-sys-color-primary)"
                    : "1px solid var(--md-sys-color-outline-variant)",
                  gap: 14,
                  opacity: isHidden ? 0.85 : 1,
                }}
              >
                {/* Artwork Container with Store Badge & Hide Action */}
                <div
                  style={{
                    height: 148,
                    borderRadius: 20,
                    position: "relative",
                    overflow: "hidden",
                    background: game.coverGradient,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: 14,
                    boxShadow: "inset 0 0 30px rgba(0,0,0,0.3)",
                  }}
                >
                  {game.coverUrl && (
                    <img
                      src={game.coverUrl}
                      alt={game.name}
                      loading="lazy"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        zIndex: 0,
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = "none";
                      }}
                    />
                  )}
                  {/* Frosted gradient scrim */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.85) 100%)",
                      zIndex: 1,
                    }}
                  />

                  <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {!game.isCustom && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: "4px 12px",
                            borderRadius: 9999,
                            background: "rgba(0, 0, 0, 0.65)",
                            color: "#FFFFFF",
                            backdropFilter: "blur(10px)",
                            letterSpacing: "0.5px",
                            textTransform: "uppercase",
                          }}
                        >
                          {game.store}
                        </span>
                      )}
                      {game.notes && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: 9999,
                            background: "rgba(0, 0, 0, 0.65)",
                            color: "#FFFFFF",
                            backdropFilter: "blur(10px)",
                          }}
                        >
                          {game.notes}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {/* Status indicator: Playing vs Sync enabled vs not monitored */}
                      {runningGamesMap[game.id]?.isRunning ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: "3px 10px",
                            borderRadius: 9999,
                            background: "var(--status-synced)",
                            color: "#000000",
                            boxShadow: "0 0 12px var(--status-synced)",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            letterSpacing: "0.5px",
                            textTransform: "uppercase",
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: 9999, background: "#000000" }} />
                          {t("library.inGameBadge")}
                        </span>
                      ) : isSyncing ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: "3px 10px",
                            borderRadius: 9999,
                            background: "var(--md-sys-color-primary-container)",
                            color: "var(--md-sys-color-on-primary-container)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            letterSpacing: "0.4px",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              border: "2px solid var(--md-sys-color-primary)",
                              borderTopColor: "transparent",
                              borderRadius: "50%",
                              animation: "spin 0.8s linear infinite",
                            }}
                          />
                          {t("library.uploading")}
                        </span>
                      ) : isSyncEnabled ? (
                        <StatusBadge status={game.status} />
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: 9999,
                            background: "rgba(0, 0, 0, 0.65)",
                            color: "#E2E8F0",
                            backdropFilter: "blur(8px)",
                          }}
                        >
                          {t("library.notTrackedBadge")}
                        </span>
                      )}

                      {/* If custom game, quick delete button */}
                      {game.isCustom && (
                        <button
                          type="button"
                          title={t("library.deleteFromSavioTitle")}
                          onClick={() => setDeletingCustomGame(game)}
                          className="m3-btn"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 9999,
                            background: "rgba(0,0,0,0.65)",
                            color: "#FF897D",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            cursor: "pointer",
                            backdropFilter: "blur(8px)",
                          }}
                        >
                          <Icon name="delete" size={15} />
                        </button>
                      )}

                      {/* Hide / Unhide button on card */}
                      <button
                        type="button"
                        title={isHidden ? t("library.restoreToLibrary") : t("library.hideFromList")}
                        onClick={() => handleToggleHideGame(game.id)}
                        className="m3-btn"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9999,
                          background: isHidden
                            ? "var(--md-sys-color-primary-container)"
                            : "rgba(0,0,0,0.65)",
                          color: isHidden ? "var(--md-sys-color-on-primary-container)" : "#FFFFFF",
                          border: isHidden
                            ? "1.5px solid var(--md-sys-color-primary)"
                            : "1px solid rgba(255,255,255,0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          backdropFilter: "blur(10px)",
                          boxShadow: isHidden ? "0 0 10px rgba(0, 180, 216, 0.4)" : "none",
                        }}
                      >
                        <Icon name={isHidden ? "visibility" : "visibility_off"} size={17} />
                      </button>
                    </div>
                  </div>

                  {/* Game Title */}
                  <div
                    style={{
                      position: "relative",
                      zIndex: 2,
                      fontSize: 17,
                      fontWeight: 800,
                      color: "#FFFFFF",
                      textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                      letterSpacing: "-0.3px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={game.name}
                  >
                    {game.name}
                  </div>
                </div>

                {/* Info row: Last Backup + Size on disk */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "var(--md-sys-color-on-surface-variant)",
                    }}
                    title={game.savePath ? `${t("library.saveFolder")} ${game.savePath}` : undefined}
                  >
                    <Icon name="schedule" size={16} />
                    <span>{game.lastBackup}</span>
                    {game.saveFilesCount ? (
                      <span style={{ opacity: 0.75, fontSize: 11 }}>
                        • {game.saveFilesCount} {t("common.files").charAt(0)}.
                      </span>
                    ) : null}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      background: game.savePath
                        ? "var(--md-sys-color-primary-container)"
                        : "var(--md-sys-color-surface-container-highest)",
                      color: game.savePath
                        ? "var(--md-sys-color-on-primary-container)"
                        : "var(--md-sys-color-on-surface-variant)",
                    }}
                    title={game.savePath ? `${t("library.saveFolder")} ${game.savePath}` : "—"}
                  >
                    {game.saveSize}
                  </span>
                </div>

                {/* Bottom Action Area: 2-tier structured layout */}
                {isHidden ? (
                  /* Hidden state action */
                  <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                    <Button
                      variant="filled"
                      size="md"
                      pill
                      icon="visibility"
                      onClick={() => handleToggleHideGame(game.id)}
                      style={{ flex: 1 }}
                    >
                      {t("library.restoreToLibrary")}
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
                    {/* Tier 1: Direct Cloud Actions: To Cloud & From Cloud */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Button
                        variant={isSyncEnabled ? "filled" : "tonal"}
                        size="sm"
                        pill
                        icon={isSyncing ? "sync" : "cloud_upload"}
                        disabled={isSyncing || !game.savePath}
                        onClick={() => handleSyncSingle(game)}
                        title={
                          game.savePath
                            ? t("library.toCloud")
                            : t("library.specifySavePathTitle")
                        }
                        style={{
                          width: "100%",
                          height: 32,
                          padding: "0 8px",
                          fontSize: 12,
                          fontWeight: 700,
                          minWidth: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isSyncing ? t("library.uploading") : t("library.toCloud")}
                      </Button>

                      <Button
                        variant="tonal"
                        size="sm"
                        pill
                        icon="cloud_download"
                        disabled={!game.savePath}
                        onClick={() => handleOpenCloudRestore(game)}
                        title={t("library.fromCloud")}
                        style={{
                          width: "100%",
                          height: 32,
                          padding: "0 8px",
                          fontSize: 12,
                          fontWeight: 700,
                          minWidth: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t("library.fromCloud")}
                      </Button>
                    </div>

                    {/* Tier 2: Compact Secondary Utility Toolbar */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                        paddingTop: 2,
                      }}
                    >
                      {/* Left tool buttons: History, Settings, Save Folder */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          title={t("common.storage")}
                          onClick={() => handleOpenLocalHistory(game)}
                          className="m3-btn"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 9999,
                            background: "var(--md-sys-color-surface-container-high)",
                            color: "var(--md-sys-color-primary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "1px solid var(--md-sys-color-outline-variant)",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          <Icon name="history" size={16} />
                        </button>

                        <button
                          type="button"
                          title={t("gameSettings.title", { game: game.name })}
                          onClick={() => setSettingsGame(game)}
                          className="m3-btn"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 9999,
                            background: "var(--md-sys-color-surface-container-high)",
                            color: "var(--md-sys-color-primary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "1px solid var(--md-sys-color-outline-variant)",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          <Icon name="tune" size={16} />
                        </button>

                        {game.savePath && (
                          <button
                            type="button"
                            title={game.savePath}
                            onClick={() => handleOpenFolder(game.savePath!)}
                            className="m3-btn"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 9999,
                              background: "var(--md-sys-color-surface-container-high)",
                              color: "var(--md-sys-color-primary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px solid var(--md-sys-color-outline-variant)",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            <Icon name="folder_open" size={16} />
                          </button>
                        )}
                      </div>

                      {/* Right tool buttons: Launch & Auto-sync toggle */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {(game.exePath || (game.store?.toLowerCase() === "steam" && game.id.startsWith("steam_"))) && (
                          <button
                            type="button"
                            title={t("library.launchingGameToast", { game: game.name })}
                            disabled={isCheckingLaunch === game.id}
                            onClick={() => handleLaunchGame(game)}
                            className="m3-btn"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 9999,
                              background: "var(--md-sys-color-primary-container)",
                              color: "var(--md-sys-color-on-primary-container)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1.5px solid var(--md-sys-color-primary)",
                              cursor: isCheckingLaunch === game.id ? "wait" : "pointer",
                              flexShrink: 0,
                            }}
                          >
                            <Icon name={isCheckingLaunch === game.id ? "sync" : "play_arrow"} size={16} />
                          </button>
                        )}

                        {isSyncEnabled ? (
                          <button
                            type="button"
                            title={t("library.disableSyncTooltip")}
                            onClick={() => handleDisableSync(game.id)}
                            className="m3-btn"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 9999,
                              background: "var(--md-sys-color-primary-container)",
                              color: "var(--md-sys-color-primary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1.5px solid var(--md-sys-color-primary)",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            <Icon name="check" size={16} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title={t("library.enableSyncTooltip")}
                            onClick={() => handleEnableSync(game)}
                            className="m3-btn"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 9999,
                              background: "var(--md-sys-color-surface-container-high)",
                              color: "var(--md-sys-color-outline)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px solid var(--md-sys-color-outline-variant)",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            <Icon name="pause_circle" size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal: Enable Sync */}
      {confirmingSyncGame && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              background: "var(--md-sys-color-surface-container-high)",
              borderRadius: 32,
              padding: 32,
              border: "1.5px solid var(--md-sys-color-outline-variant)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ExpressiveShape size={52} initialShape="cookie9" fill="var(--md-sys-color-primary)">
                <Icon name="verified_user" size={28} color="var(--md-sys-color-on-primary)" />
              </ExpressiveShape>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800 }}>{t("library.enableSyncModalTitle")}</h3>
                <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {confirmingSyncGame.name}
                </p>
              </div>
            </div>

            <div
              style={{
                fontSize: 13,
                color: "var(--md-sys-color-on-surface)",
                lineHeight: 1.6,
                background: "var(--md-sys-color-surface-container)",
                padding: "16px 20px",
                borderRadius: 18,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div>
                <strong>{t("library.saveFolder")}</strong>
                <div style={{ fontFamily: "var(--font-family-mono)", fontSize: 12, marginTop: 4, wordBreak: "break-all", color: "var(--md-sys-color-primary)" }}>
                  {confirmingSyncGame.savePath || t("library.saveFolderNotFound")}
                </div>
              </div>
              <div>
                <strong>{t("library.backupDestination")}</strong>
                <div style={{ fontFamily: "var(--font-family-mono)", fontSize: 12, marginTop: 4, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {getTargetStorageLabel()}
                </div>
              </div>
              {!storageStatus.configured && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: "var(--md-sys-color-error-container)",
                    color: "var(--md-sys-color-on-error-container)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 13 }}>
                    <Icon name="sync_problem" size={18} color="var(--md-sys-color-error)" />
                    <span>{t("library.noStorageConnectedTitle")}</span>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                    {t("library.noStorageConnectedDesc")}
                  </div>
                  <Button
                    variant="tonal"
                    size="sm"
                    pill
                    icon="cloud"
                    onClick={() => {
                      setConfirmingSyncGame(null);
                      onNavigateTab?.("clouds");
                    }}
                    style={{ alignSelf: "flex-start", marginTop: 2 }}
                  >
                    {t("library.connectStorageButton")}
                  </Button>
                </div>
              )}
              <div style={{ fontSize: 12, color: "var(--status-synced)", marginTop: 4 }}>
                {t("library.safetyGuarantee")}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button variant="tonal" size="md" pill onClick={() => setConfirmingSyncGame(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="filled" size="md" pill icon="check" onClick={confirmEnableSync}>
                {t("library.confirmAndEnable")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Save Path Modal */}
      {editingPathGame && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "var(--md-sys-color-surface-container-high)",
              borderRadius: 32,
              padding: 32,
              border: "1.5px solid var(--md-sys-color-outline-variant)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ExpressiveShape size={52} initialShape="squircle" fill="var(--md-sys-color-primary)">
                <Icon name="folder" size={28} color="var(--md-sys-color-on-primary)" />
              </ExpressiveShape>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800 }}>{t("library.specifySavePathTitle")}</h3>
                <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {editingPathGame.name}
                </p>
              </div>
            </div>

            <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.5 }}>
              {t("library.specifySavePathDesc")}
            </p>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={manualPathInput}
                onChange={(e) => setManualPathInput(e.target.value)}
                placeholder="C:\Users\...\Saved Games\Game"
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  borderRadius: 14,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  fontFamily: "var(--font-family-mono)",
                  outline: "none",
                }}
              />
              <Button variant="tonal" size="md" pill icon="folder_open" onClick={handlePickCustomFolder}>
                {t("common.browse")}
              </Button>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
              <Button variant="tonal" size="md" pill onClick={() => setEditingPathGame(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="filled" size="md" pill icon="save" onClick={handleSaveCustomPath}>
                {t("library.savePathButton")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Save Manager Modal (Snapshots, Restore, Import/Export) */}
      {managingGame && (
        <SaveManagerModal
          gameId={managingGame.id}
          gameName={managingGame.name}
          store={managingGame.isCustom ? "Custom" : managingGame.store}
          savePath={managingGame.savePath || null}
          initialTab={managingInitialTab}
          onClose={() => setManagingGame(null)}
          onNotify={showToast}
        />
      )}

      {/* Custom Game Modals (Add, Edit, Delete) */}
      {isAddCustomOpen && (
        <AddCustomGameModal
          onClose={() => setIsAddCustomOpen(false)}
          onSave={handleSaveCustomGame}
          onNotify={showToast}
        />
      )}

      {/* PC Game Scanner Modal */}
      {isScanPcOpen && (
        <ScanPcGamesModal
          onClose={() => setIsScanPcOpen(false)}
          onImportGames={handleImportDiscoveredGames}
          existingGames={games.map((g) => ({
            name: g.name,
            installDir: g.installDir,
            exePath: g.exePath,
          }))}
        />
      )}

      {editingCustomGame && (
        <EditCustomGameModal
          game={editingCustomGame}
          onClose={() => setEditingCustomGame(null)}
          onSave={handleUpdateCustomGame}
          onNotify={showToast}
        />
      )}

      {deletingCustomGame && (
        <DeleteCustomGameModal
          game={deletingCustomGame}
          onClose={() => setDeletingCustomGame(null)}
          onConfirm={handleConfirmDeleteCustomGame}
        />
      )}

      {/* Unified Game Settings Modal (Paths, Exe, Custom Game Info, Cloud Actions, Triggers) */}
      {settingsGame && (
        <GameSettingsModal
          game={settingsGame}
          onClose={() => setSettingsGame(null)}
          targetStorageName={getTargetStorageName()}
          targetStorageLabel={getTargetStorageLabel()}
          onNotify={showToast}
          onOpenCloudRestore={handleOpenCloudRestore}
          onDeleteCustomGame={setDeletingCustomGame}
          onSaved={() => loadGames(false)}
        />
      )}

      {/* Sync Before Launch Conflict Warning Modal */}
      {launchConflict && (
        <SyncBeforeLaunchModal
          game={launchConflict.game}
          cloudBackup={launchConflict.cloudBackup}
          localLastModified={launchConflict.localLastModified}
          localSizeBytes={launchConflict.localSizeBytes}
          targetStorageName={getTargetStorageName()}
          isRestoring={isRestoringForLaunch}
          onDownloadAndLaunch={handleResolveConflictDownloadAndLaunch}
          onKeepLocalAndLaunch={handleResolveConflictKeepLocalAndLaunch}
          onCancel={() => setLaunchConflict(null)}
        />
      )}
    </div>
  );
}
