import { memo, useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "./Card";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { ExpressiveShape } from "./ExpressiveShape";
import { api, type SnapshotMeta, type CloudBackupItem, type CloudGameManifest } from "../lib/tauri";
import { useSettings } from "../state/settings";
import { useI18n } from "../i18n/I18nProvider";
import { notifySyncProgress } from "./LiveSyncNotifier";

interface SaveManagerModalProps {
  gameId: string;
  gameName: string;
  store?: string;
  savePath: string | null;
  initialTab?: "local" | "cloud";
  onClose: () => void;
  onNotify: (msg: string) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function parseCloudBackupInfo(
  fileName: string,
  modified: number | null | undefined,
  t: (key: string, params?: Record<string, any>) => string
) {
  const clean = fileName.replace(/\.zip$/i, "");
  const isLocked = clean.includes("_LOCKED") || clean.includes("_STAR");
  const unadorned = clean.replace(/_LOCKED|_STAR/g, "");

  // Match bracket tag: [...]
  const bracketMatch = unadorned.match(/\[(.*?)\]/);
  const tag = bracketMatch ? bracketMatch[1].trim() : null;

  // Match date and time pattern: YYYY-MM-DD_HH-MM
  const dateMatch = unadorned.match(/(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})/);
  let friendlyDateStr = "";
  let fullDateDisplay = "";
  if (dateMatch) {
    const [_, dStr, tStr] = dateMatch;
    const timeFormatted = tStr.replace("-", ":");
    const [y, m, d] = dStr.split("-").map(Number);
    try {
      const dt = new Date(y, m - 1, d, parseInt(tStr.split("-")[0], 10), parseInt(tStr.split("-")[1], 10));
      friendlyDateStr = dt.toLocaleString();
      fullDateDisplay = dt.toLocaleString();
    } catch {
      friendlyDateStr = `${dStr} ${timeFormatted}`;
      fullDateDisplay = friendlyDateStr;
    }
  } else if (modified) {
    fullDateDisplay = new Date(modified * 1000).toLocaleString();
    friendlyDateStr = fullDateDisplay;
  }

  // Determine display title:
  let title = "";
  let badgeLabel = "";
  let badgeColor = "var(--status-synced)";
  let badgeBg = "var(--status-synced-container)";

  if (tag) {
    title = tag;
    const lower = tag.toLowerCase();
    if (/exit|\u0432\u044b\u0445\u043e\u0434|\u0432\u0438\u0445\u0456\u0434|wyj/i.test(lower)) {
      badgeLabel = t("saveManager.badgeExit");
      badgeColor = "var(--md-sys-color-primary)";
      badgeBg = "var(--md-sys-color-primary-container)";
    } else if (/launch|start|\u0437\u0430\u043f\u0443\u0441\u043a|\u0441\u0442\u0430\u0440\u0442|uruchom/i.test(lower)) {
      badgeLabel = t("saveManager.badgeLaunch");
      badgeColor = "#0284C7";
      badgeBg = "rgba(2, 132, 199, 0.15)";
    } else {
      badgeLabel = t("saveManager.badgeManual");
      badgeColor = "var(--status-synced)";
      badgeBg = "var(--status-synced-container)";
    }
  } else if (friendlyDateStr) {
    title = t("saveManager.snapshotFromDate", { date: friendlyDateStr });
    badgeLabel = t("saveManager.badgeCloud");
  } else {
    title = fileName;
  }

  return {
    title,
    fullDateDisplay: fullDateDisplay || (modified ? new Date(modified * 1000).toLocaleString() : t("common.justNow")),
    badgeLabel,
    badgeColor,
    badgeBg,
    isLocked,
  };
}

export const SaveManagerModal = memo(function SaveManagerModal({
  gameId,
  gameName,
  store,
  savePath,
  initialTab,
  onClose,
  onNotify,
}: SaveManagerModalProps) {
  const { settings, update } = useSettings();
  const { t } = useI18n();
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Save Path (supports editing/re-linking right inside modal)
  const [effectiveSavePath, setEffectiveSavePath] = useState<string>(
    savePath || settings.customSavePaths[gameId] || ""
  );

  // Cloud Manifest for new PC migration
  const [cloudManifest, setCloudManifest] = useState<CloudGameManifest | null>(null);

  // Restore verification & confirmation
  const [restoreCheckState, setRestoreCheckState] = useState<{
    folderExists: boolean;
    pathDiffers: boolean;
    originalPath: string | null;
    proposedPath: string;
  } | null>(null);

  // Tab & Cloud states
  const [activeTab, setActiveTab] = useState<"local" | "cloud">(initialTab || "local");

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [cloudBackups, setCloudBackups] = useState<CloudBackupItem[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [restoringCloudFile, setRestoringCloudFile] = useState<CloudBackupItem | null>(null);

  // Modal sub-states
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  // Restore confirmation
  const [restoringSnap, setRestoringSnap] = useState<SnapshotMeta | null>(null);

  // Undo replacement state (safety autobackup rollback)
  const [undoBackup, setUndoBackup] = useState<{ safetySnapshotId: string; title: string } | null>(null);

  // Custom confirmation modals (replaces native window.confirm)
  const [confirmingDeleteSnap, setConfirmingDeleteSnap] = useState<{ id: string; title: string } | null>(null);
  const [confirmingDeleteCloud, setConfirmingDeleteCloud] = useState<CloudBackupItem | null>(null);

  // Snapshot filters & search for large snapshot lists
  const [snapFilter, setSnapFilter] = useState<"all" | "protected" | "auto">("all");
  const [snapSearch, setSnapSearch] = useState("");

  const visibleSnapshots = useMemo(() => {
    return snapshots.filter((s) => {
      if (snapFilter === "protected" && !s.isLocked) return false;
      if (snapFilter === "auto" && s.source !== "autobackup") return false;
      if (snapSearch.trim()) {
        const q = snapSearch.toLowerCase();
        const inTitle = s.title.toLowerCase().includes(q);
        const inNote = s.note ? s.note.toLowerCase().includes(q) : false;
        return inTitle || inNote;
      }
      return true;
    });
  }, [snapshots, snapFilter, snapSearch]);

  const targetLabel = useMemo(() => {
    switch (settings.backupTargetType) {
      case "mega":
        return "MEGA Cloud";
      case "gdrive":
        return "Google Drive";
      case "asus":
        return t("saveManager.targetAsus");
      case "nas":
        return t("saveManager.targetNas");
      case "local":
        return t("saveManager.targetLocal");
      default:
        return String(settings.backupTargetType).toUpperCase();
    }
  }, [settings.backupTargetType, t]);

  const loadSnapshots = useCallback(async () => {
    try {
      const list = await api.listSnapshots(gameId, effectiveSavePath || savePath);
      setSnapshots(list);
    } catch (e) {
      console.warn("Failed to list snapshots:", e);
    } finally {
      setLoading(false);
    }
  }, [gameId, savePath, effectiveSavePath]);

  const loadCloudBackups = useCallback(async () => {
    setCloudLoading(true);
    setCloudError(null);
    try {
      const list = await api.listCloudBackups(gameName, settings.backupTargetType, settings, store, gameId);
      setCloudBackups(list);
      api.getCloudGameManifest(gameName, settings.backupTargetType, settings, store, gameId)
        .then((m) => { if (m) setCloudManifest(m); })
        .catch(() => undefined);
    } catch (e) {
      setCloudError(String(e));
    } finally {
      setCloudLoading(false);
    }
  }, [gameId, gameName, store, settings.backupTargetType, settings]);

  useEffect(() => {
    loadSnapshots();
    if (activeTab === "cloud") {
      loadCloudBackups();
    }
  }, [loadSnapshots, activeTab, loadCloudBackups]);

  // Automatically refresh local snapshot verification when user returns to Savio from Windows Explorer
  useEffect(() => {
    const handleFocus = () => {
      loadSnapshots();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadSnapshots]);

  const handleCreateSnapshot = async () => {
    if (!savePath) {
      onNotify(t("saveManager.specifySavePathFirstToast"));
      return;
    }
    setProcessingAction("creating");
    try {
      const snap = await api.createSnapshot(
        gameId,
        gameName,
        savePath,
        newTitle.trim() || t("saveManager.snapshotFromDate", { date: new Date().toLocaleDateString() }),
        newNote.trim(),
        store
      );
      setSnapshots((prev) => [snap, ...prev]);
      setIsCreating(false);
      setNewTitle("");
      setNewNote("");
      onNotify(t("saveManager.snapshotSavedSuccess", { title: snap.title }));
    } catch (e) {
      onNotify(t("saveManager.createSnapshotError", { error: String(e) }));
    } finally {
      setProcessingAction(null);
    }
  };

  const handleRestore = async () => {
    if (!restoringSnap) return;
    const targetDir = effectiveSavePath || restoringSnap.originalSavePath || "";
    if (!targetDir || targetDir.trim().length < 3) {
      onNotify(t("saveManager.specifySavePathFirstToast"));
      await handlePickDifferentPath();
      return;
    }
    setProcessingAction(`restoring_${restoringSnap.id}`);
    try {
      const restored = await api.restoreSnapshot(gameId, gameName, restoringSnap.id, targetDir);
      await loadSnapshots();
      if (restored.safetyBackupId) {
        setUndoBackup({ safetySnapshotId: restored.safetyBackupId, title: restoringSnap.title });
      }
      update({
        customSavePaths: {
          ...settings.customSavePaths,
          [gameId]: targetDir,
        },
        customGames: (settings.customGames || []).map((cg) =>
          cg.id === gameId ? { ...cg, savePath: targetDir } : cg
        ),
      });
      setEffectiveSavePath(targetDir);
      setRestoringSnap(null);
      onNotify(t("saveManager.snapshotActivatedSuccess", { title: restoringSnap.title }));
    } catch (e) {
      onNotify(t("saveManager.activateSnapshotError", { error: String(e) }));
    } finally {
      setProcessingAction(null);
    }
  };

  const handleUndo = async () => {
    if (!undoBackup?.safetySnapshotId) return;
    const targetDir = effectiveSavePath;
    if (!targetDir) return;
    setProcessingAction("undoing");
    try {
      await api.restoreSnapshot(gameId, gameName, undoBackup.safetySnapshotId, targetDir);
      await loadSnapshots();
      const undoneTitle = undoBackup.title;
      setUndoBackup(null);
      onNotify(t("saveManager.undoReplaceSuccess", { title: undoneTitle }));
    } catch (e) {
      onNotify(t("saveManager.undoReplaceError", { error: String(e) }));
    } finally {
      setProcessingAction(null);
    }
  };

  const handleToggleLocalLock = async (snapId: string) => {
    try {
      const newLocked = await api.toggleSnapshotLock(gameId, snapId);
      setSnapshots((prev) =>
        prev.map((s) => (s.id === snapId ? { ...s, isLocked: newLocked } : s))
      );
      onNotify(newLocked ? t("saveManager.snapshotLocked") : t("saveManager.snapshotUnlocked"));
    } catch (e) {
      onNotify(t("saveManager.snapshotLockError", { error: String(e) }));
    }
  };

  const handleToggleCloudLock = async (backup: CloudBackupItem) => {
    try {
      const newFileName = await api.toggleCloudBackupLock(
        gameName,
        backup.fileName,
        settings.backupTargetType,
        settings,
        store
      );
      const isNowLocked = newFileName.includes("_LOCKED");
      setCloudBackups((prev) =>
        prev.map((b) =>
          b.fileName === backup.fileName
            ? { ...b, fileName: newFileName, isLocked: isNowLocked }
            : b
        )
      );
      onNotify(isNowLocked ? t("saveManager.cloudBackupLocked") : t("saveManager.cloudBackupUnlocked"));
    } catch (e) {
      onNotify(t("saveManager.cloudLockError", { error: String(e) }));
    }
  };

  const handleDeleteCloudBackup = (backup: CloudBackupItem) => {
    setConfirmingDeleteCloud(backup);
  };

  const executeDeleteCloudBackup = async () => {
    if (!confirmingDeleteCloud) return;
    const backup = confirmingDeleteCloud;
    setConfirmingDeleteCloud(null);
    try {
      await api.deleteCloudBackup(
        gameName,
        backup.fileName,
        settings.backupTargetType,
        settings,
        store
      );
      setCloudBackups((prev) => prev.filter((b) => b.fileName !== backup.fileName));
      onNotify(t("saveManager.cloudBackupDeletedSuccess", { file: backup.fileName }));
    } catch (e) {
      onNotify(t("saveManager.deleteCloudBackupError", { error: String(e) }));
    }
  };

  const handleDelete = (snapId: string, title: string) => {
    setConfirmingDeleteSnap({ id: snapId, title });
  };

  const executeDeleteSnapshot = async () => {
    if (!confirmingDeleteSnap) return;
    const { id, title } = confirmingDeleteSnap;
    setConfirmingDeleteSnap(null);
    try {
      await api.deleteSnapshot(gameId, id);
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
      onNotify(t("saveManager.snapshotDeletedSuccess", { title }));
    } catch (e) {
      onNotify(t("saveManager.deleteSnapshotError", { error: String(e) }));
    }
  };

  const handleExportZip = async (snapId: string, _title?: string) => {
    try {
      const path = await api.exportSnapshot(gameId, snapId);
      onNotify(t("saveManager.clonedToDesktopToast", { dest: path }));
    } catch (e) {
      onNotify(t("saveManager.cloneErrorToast", { error: String(e) }));
    }
  };

  const handleImportSave = async () => {
    try {
      const file = await api.pickFile("ZIP (*.zip)|*.zip");
      if (!file) return;

      const title = prompt(t("saveManager.newSnapshotTitle"), t("common.import"));
      if (title === null) return;

      setProcessingAction("importing");
      const snap = await api.importSnapshot(
        gameId,
        gameName,
        file,
        title || t("common.import"),
        `Imported: ${file}`
      );
      setSnapshots((prev) => [snap, ...prev]);
      onNotify(t("saveManager.snapshotToast", { title: snap.title, result: "✓" }));
    } catch (e) {
      onNotify(t("saveManager.importErrorToast", { error: String(e) }));
    } finally {
      setProcessingAction(null);
    }
  };

  const handleCloneDesktop = async () => {
    if (!savePath) {
      onNotify(t("saveManager.saveFolderNotFoundToast"));
      return;
    }
    try {
      const dest = await api.cloneSaveToDesktop(gameName, savePath);
      onNotify(t("saveManager.clonedToDesktopToast", { dest }));
    } catch (e) {
      onNotify(t("saveManager.cloneErrorToast", { error: String(e) }));
    }
  };

  const handleCloudSync = async (snapId: string, title: string) => {
    setProcessingAction(`cloud_${snapId}`);
    try {
      const res = await api.syncSnapshotToCloud(
        gameId,
        gameName,
        snapId,
        settings.backupTargetType,
        settings,
        store
      );
      onNotify(t("saveManager.snapshotToast", { title, result: res }));
      if (activeTab === "cloud") {
        loadCloudBackups();
      }
    } catch (e) {
      onNotify(t("saveManager.syncErrorToast", { error: String(e) }));
    } finally {
      setProcessingAction(null);
    }
  };

  const handlePickDifferentPath = async () => {
    try {
      const chosen = await api.pickFolder();
      if (chosen) {
        setEffectiveSavePath(chosen);
        update({
          customSavePaths: {
            ...settings.customSavePaths,
            [gameId]: chosen,
          },
        });
        const stats = await api.inspectFolder(chosen);
        setRestoreCheckState((prev) =>
          prev
            ? {
                ...prev,
                folderExists: stats !== null,
                proposedPath: chosen,
                pathDiffers: prev.originalPath
                  ? prev.originalPath.toLowerCase() !== chosen.toLowerCase()
                  : false,
              }
            : null
        );
        onNotify(t("saveManager.newPathChosenToast", { path: chosen }));
      }
    } catch (e) {
      onNotify(t("saveManager.folderPickErrorToast", { error: String(e) }));
    }
  };

  const handleOpenRestoreCloud = async (b: CloudBackupItem) => {
    setRestoringCloudFile(b);
    let pathToCheck = effectiveSavePath || "";

    // 1. Inspect archive metadata directly to see what was saved inside the archive
    let archiveMeta = null;
    try {
      archiveMeta = await api.inspectArchiveMetadata(
        settings.backupTargetType,
        settings,
        gameName,
        b.fileName,
        store,
        gameId
      );
    } catch {
      /* ignore */
    }

    let origPath = archiveMeta?.originalSavePath || cloudManifest?.originalSavePath || null;
    if (!origPath) {
      try {
        const m = await api.getCloudGameManifest(gameName, settings.backupTargetType, settings, store, gameId);
        if (m?.originalSavePath) {
          origPath = m.originalSavePath;
          setCloudManifest(m);
        }
      } catch {
        /* ignore */
      }
    }

    // If current pathToCheck is empty or invalid, auto-suggest the adapted path from the archive
    if (!pathToCheck || pathToCheck.trim().length < 3) {
      if (archiveMeta?.adaptedSavePath) {
        pathToCheck = archiveMeta.adaptedSavePath;
        setEffectiveSavePath(pathToCheck);
      } else if (origPath) {
        pathToCheck = origPath;
        setEffectiveSavePath(pathToCheck);
      }
    }

    let folderExists = false;
    if (pathToCheck.trim().length >= 3) {
      try {
        const stats = await api.inspectFolder(pathToCheck);
        folderExists = stats !== null;
      } catch {
        folderExists = false;
      }
    }

    const pathDiffers = Boolean(origPath && pathToCheck && origPath.toLowerCase() !== pathToCheck.toLowerCase());

    setRestoreCheckState({
      folderExists,
      pathDiffers,
      originalPath: origPath,
      proposedPath: pathToCheck,
    });
  };

  const handleRestoreFromCloud = async () => {
    if (!restoringCloudFile) return;
    const targetDir = effectiveSavePath || restoreCheckState?.proposedPath || "";
    if (!targetDir || targetDir.trim().length < 3) {
      onNotify(t("saveManager.specifySavePathFirstToast"));
      await handlePickDifferentPath();
      return;
    }
    setProcessingAction(`restoring_cloud_${restoringCloudFile.fileName}`);
    notifySyncProgress({
      gameId,
      gameName,
      status: "syncing",
      stage: "downloading",
      cloudTarget: targetLabel,
      fileName: restoringCloudFile.fileName,
      sizeBytes: restoringCloudFile.sizeBytes,
      message: `${t("liveSync.stageDownloading")}: ${restoringCloudFile.fileName}`,
      timestamp: Date.now(),
    });
    try {
      const restored = await api.restoreCloudBackup(
        gameId,
        gameName,
        restoringCloudFile.fileName,
        targetDir,
        settings.backupTargetType,
        settings,
        store
      );
      await loadSnapshots();
      if (restored.safetyBackupId) {
        setUndoBackup({ safetySnapshotId: restored.safetyBackupId, title: restoringCloudFile.fileName });
      }
      update({
        customSavePaths: {
          ...settings.customSavePaths,
          [gameId]: targetDir,
        },
        customGames: (settings.customGames || []).map((cg) =>
          cg.id === gameId ? { ...cg, savePath: targetDir } : cg
        ),
      });
      setEffectiveSavePath(targetDir);
      setRestoringCloudFile(null);
      setRestoreCheckState(null);
      notifySyncProgress({
        gameId,
        gameName,
        status: "success",
        stage: "done",
        cloudTarget: targetLabel,
        fileName: restoringCloudFile.fileName,
        sizeBytes: restoringCloudFile.sizeBytes,
        message: t("saveManager.cloudRestoredSuccessToast", {
          file: restoringCloudFile.fileName,
          target: targetLabel,
        }),
        timestamp: Date.now(),
      });
      onNotify(
        t("saveManager.cloudRestoredSuccessToast", {
          file: restoringCloudFile.fileName,
          target: targetLabel,
        })
      );
    } catch (e) {
      notifySyncProgress({
        gameId,
        gameName,
        status: "error",
        cloudTarget: targetLabel,
        message: String(e),
        timestamp: Date.now(),
      });
      onNotify(t("saveManager.cloudRestoreErrorToast", { error: String(e) }));
    } finally {
      setProcessingAction(null);
    }
  };

  const handleSyncCurrentToCloud = async () => {
    if (!savePath) {
      onNotify(t("saveManager.specifySavePathFirstToast"));
      return;
    }
    setProcessingAction("syncing_current_to_cloud");
    notifySyncProgress({
      gameId,
      gameName,
      status: "syncing",
      stage: "creating",
      cloudTarget: targetLabel,
      message: `${t("liveSync.stageCreating")}: ${gameName}`,
      timestamp: Date.now(),
    });
    try {
      const snap = await api.createSnapshot(
        gameId,
        gameName,
        savePath,
        t("saveManager.uploadCurrentSaves", { target: targetLabel }),
        "Auto safety snapshot",
        store
      );
      setSnapshots((prev) => [snap, ...prev]);
      notifySyncProgress({
        gameId,
        gameName,
        status: "syncing",
        stage: "uploading",
        cloudTarget: targetLabel,
        sizeBytes: snap.totalSizeBytes,
        message: `${t("liveSync.stageUploading")}: ${gameName} -> ${targetLabel}`,
        timestamp: Date.now(),
      });
      const res = await api.syncSnapshotToCloud(
        gameId,
        gameName,
        snap.id,
        settings.backupTargetType,
        settings,
        store
      );
      notifySyncProgress({
        gameId,
        gameName,
        status: "success",
        stage: "done",
        cloudTarget: targetLabel,
        sizeBytes: snap.totalSizeBytes,
        message: res,
        timestamp: Date.now(),
      });
      onNotify(res);
      await loadCloudBackups();
    } catch (e) {
      notifySyncProgress({
        gameId,
        gameName,
        status: "error",
        cloudTarget: targetLabel,
        message: String(e),
        timestamp: Date.now(),
      });
      onNotify(t("saveManager.cloudUploadErrorToast", { error: String(e) }));
    } finally {
      setProcessingAction(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 820,
          maxHeight: "90vh",
          background: "var(--md-sys-color-surface-container-high)",
          borderRadius: 36,
          border: "1.5px solid var(--md-sys-color-outline-variant)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: "24px 32px",
            background: "linear-gradient(135deg, var(--md-sys-color-primary-container) 0%, var(--md-sys-color-surface-container-high) 100%)",
            borderBottom: "1px solid var(--md-sys-color-outline-variant)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0, flex: 1 }}>
            <ExpressiveShape size={52} initialShape="cookie9" fill="var(--md-sys-color-primary)">
              <Icon name="history" size={28} color="var(--md-sys-color-on-primary)" />
            </ExpressiveShape>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <h2
                  title={gameName}
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: "var(--md-sys-color-on-primary-container)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 480,
                  }}
                >
                  {t("saveManager.modalTitle", { game: gameName })}
                </h2>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "3px 10px",
                    borderRadius: 9999,
                    background: "var(--md-sys-color-primary)",
                    color: "var(--md-sys-color-on-primary)",
                    flexShrink: 0,
                  }}
                >
                  {t("saveManager.snapshotsCount", { count: snapshots.length })}
                </span>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--md-sys-color-on-surface-variant)",
                  marginTop: 4,
                  fontFamily: "var(--font-family-mono)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 540,
                }}
                title={effectiveSavePath || ""}
              >
                {effectiveSavePath ? t("saveManager.gameFolder", { path: effectiveSavePath }) : t("saveManager.notSpecified")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="m3-btn"
            style={{
              width: 38,
              height: 38,
              borderRadius: 9999,
              background: "var(--md-sys-color-surface-container)",
              color: "var(--md-sys-color-on-surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--md-sys-color-outline-variant)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher: Local Snapshots vs Cloud Backups */}
        <div
          style={{
            display: "flex",
            padding: "0 32px",
            background: "var(--md-sys-color-surface-container-high)",
            borderBottom: "1px solid var(--md-sys-color-outline-variant)",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("local")}
            style={{
              padding: "14px 20px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "local" ? "3px solid var(--md-sys-color-primary)" : "3px solid transparent",
              color: activeTab === "local" ? "var(--md-sys-color-primary)" : "var(--md-sys-color-on-surface-variant)",
              fontWeight: activeTab === "local" ? 800 : 600,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.2s ease",
            }}
          >
            <Icon name="history" size={18} />
            <span>{t("saveManager.localSnapshotsTab", { count: snapshots.length })}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("cloud");
              loadCloudBackups();
            }}
            style={{
              padding: "14px 20px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "cloud" ? "3px solid var(--md-sys-color-primary)" : "3px solid transparent",
              color: activeTab === "cloud" ? "var(--md-sys-color-primary)" : "var(--md-sys-color-on-surface-variant)",
              fontWeight: activeTab === "cloud" ? 800 : 600,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.2s ease",
            }}
          >
            <Icon name="cloud" size={18} />
            <span>{t("saveManager.cloudCopiesTab", { target: targetLabel, count: cloudLoading ? "..." : cloudBackups.length })}</span>
          </button>
        </div>

        {/* Action Toolbar */}
        <div
          style={{
            padding: "16px 32px",
            background: "var(--md-sys-color-surface-container)",
            borderBottom: "1px solid var(--md-sys-color-outline-variant)",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {activeTab === "local" ? (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button
                  variant="filled"
                  size="md"
                  pill
                  icon="add"
                  disabled={!savePath || processingAction !== null}
                  onClick={() => setIsCreating(true)}
                >
                  {t("saveManager.takeSnapshot")}
                </Button>
                <Button
                  variant="tonal"
                  size="md"
                  pill
                  icon="cloud_upload"
                  disabled={!savePath || processingAction !== null}
                  onClick={handleSyncCurrentToCloud}
                >
                  {processingAction === "syncing_current_to_cloud" ? t("saveManager.uploadingToTarget") : t("saveManager.uploadToTarget", { target: targetLabel })}
                </Button>
                <Button
                  variant="tonal"
                  size="md"
                  pill
                  icon="cloud_download"
                  disabled={processingAction !== null}
                  onClick={handleImportSave}
                >
                  {t("saveManager.importZip")}
                </Button>
              </div>

              <Button
                variant="tonal"
                size="md"
                pill
                icon="content_copy"
                disabled={!savePath}
                onClick={handleCloneDesktop}
              >
                {t("saveManager.cloneToDesktop")}
              </Button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button
                  variant="filled"
                  size="md"
                  pill
                  icon="cloud_upload"
                  disabled={!savePath || processingAction !== null}
                  onClick={handleSyncCurrentToCloud}
                >
                  {processingAction === "syncing_current_to_cloud" ? t("saveManager.uploadingToTarget") : t("saveManager.uploadCurrentSaves", { target: targetLabel })}
                </Button>
                <Button
                  variant="tonal"
                  size="md"
                  pill
                  icon="sync"
                  disabled={cloudLoading}
                  onClick={loadCloudBackups}
                >
                  {cloudLoading ? t("saveManager.refreshing") : t("saveManager.refreshList")}
                </Button>
              </div>

              <div style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="verified_user" size={16} color="var(--status-synced)" />
                <span>{t("saveManager.storageTarget", { target: targetLabel })}</span>
              </div>
            </>
          )}
        </div>

        {/* New Snapshot Drawer (for local tab) */}
        {activeTab === "local" && isCreating && (
          <div
            style={{
              padding: "18px 32px",
              background: "var(--md-sys-color-surface-container-low)",
              borderBottom: "1px solid var(--md-sys-color-outline-variant)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>{t("saveManager.newSnapshotTitle")}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t("saveManager.snapshotNamePlaceholder")}
                style={{
                  flex: 2,
                  padding: "8px 14px",
                  borderRadius: 12,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={t("saveManager.snapshotNotePlaceholder")}
                style={{
                  flex: 1,
                  padding: "8px 14px",
                  borderRadius: 12,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <Button
                variant="filled"
                size="md"
                pill
                icon="check"
                disabled={processingAction === "creating"}
                onClick={handleCreateSnapshot}
              >
                {processingAction === "creating" ? t("saveManager.savingSnapshot") : t("common.save")}
              </Button>
              <Button variant="tonal" size="md" pill onClick={() => setIsCreating(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}

        {/* Content Area: Local tab vs Cloud tab */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Visual Undo Banner */}
          {undoBackup && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 18px",
                borderRadius: 16,
                background: "var(--md-sys-color-tertiary-container)",
                color: "var(--md-sys-color-on-tertiary-container)",
                border: "1.5px solid var(--md-sys-color-tertiary)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: "var(--md-sys-color-tertiary)",
                    color: "var(--md-sys-color-on-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name="history" size={20} color="var(--md-sys-color-on-tertiary)" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>
                    {t("saveManager.undoAlertTitle", { title: undoBackup.title })}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.9, marginTop: 1 }}>
                    {t("saveManager.undoAlertDesc")}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Button
                  variant="filled"
                  size="sm"
                  pill
                  icon="restart_alt"
                  disabled={processingAction === "undoing"}
                  onClick={handleUndo}
                  style={{
                    background: "var(--md-sys-color-on-tertiary-container)",
                    color: "var(--md-sys-color-tertiary-container)",
                    fontWeight: 800,
                  }}
                >
                  {processingAction === "undoing" ? t("saveManager.undoing") : t("saveManager.undoReplace")}
                </Button>
                <button
                  type="button"
                  title={t("saveManager.closeNotice")}
                  onClick={() => setUndoBackup(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--md-sys-color-on-tertiary-container)",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "4px 8px",
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {activeTab === "local" ? (
            loading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--md-sys-color-on-surface-variant)" }}>
                {t("saveManager.loadingSnapshots")}
              </div>
            ) : snapshots.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "48px 24px",
                  color: "var(--md-sys-color-on-surface-variant)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Icon name="history" size={48} color="var(--md-sys-color-outline)" />
                <div style={{ fontSize: 16, fontWeight: 700 }}>{t("saveManager.noSnapshotsYet")}</div>
                <p
                  style={{ fontSize: 13, maxWidth: 440, lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: t("saveManager.noSnapshotsHint", { target: targetLabel }) }}
                />
              </div>
            ) : (
              <>
                {snapshots.length >= 3 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "8px 4px 12px 4px",
                      flexWrap: "wrap",
                      borderBottom: "1px solid var(--md-sys-color-outline-variant)",
                      marginBottom: 8,
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setSnapFilter("all")}
                        className="m3-btn"
                        style={{
                          padding: "6px 14px",
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          border: "none",
                          background: snapFilter === "all" ? "var(--md-sys-color-primary)" : "var(--md-sys-color-surface-container)",
                          color: snapFilter === "all" ? "var(--md-sys-color-on-primary)" : "var(--md-sys-color-on-surface-variant)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {t("saveManager.filterAll")} ({snapshots.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSnapFilter("protected")}
                        className="m3-btn"
                        style={{
                          padding: "6px 14px",
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          border: "none",
                          background: snapFilter === "protected" ? "rgba(245, 158, 11, 0.25)" : "var(--md-sys-color-surface-container)",
                          color: snapFilter === "protected" ? "#F59E0B" : "var(--md-sys-color-on-surface-variant)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        ★ {t("saveManager.filterProtected")} ({snapshots.filter((s) => s.isLocked).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSnapFilter("auto")}
                        className="m3-btn"
                        style={{
                          padding: "6px 14px",
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          border: "none",
                          background: snapFilter === "auto" ? "var(--md-sys-color-primary-container)" : "var(--md-sys-color-surface-container)",
                          color: snapFilter === "auto" ? "var(--md-sys-color-on-primary-container)" : "var(--md-sys-color-on-surface-variant)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {t("saveManager.filterAuto")} ({snapshots.filter((s) => s.source === "autobackup").length})
                      </button>
                    </div>

                    <div style={{ position: "relative", minWidth: 180, flex: "1 1 200px", maxWidth: 280 }}>
                      <input
                        type="text"
                        value={snapSearch}
                        onChange={(e) => setSnapSearch(e.target.value)}
                        placeholder={t("saveManager.searchPlaceholder")}
                        style={{
                          width: "100%",
                          padding: "6px 28px 6px 12px",
                          borderRadius: 9999,
                          background: "var(--md-sys-color-surface-container)",
                          border: "1px solid var(--md-sys-color-outline-variant)",
                          color: "var(--md-sys-color-on-surface)",
                          fontSize: 12,
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      {snapSearch && (
                        <button
                          type="button"
                          onClick={() => setSnapSearch("")}
                          style={{
                            position: "absolute",
                            right: 8,
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "transparent",
                            border: "none",
                            color: "var(--md-sys-color-outline)",
                            cursor: "pointer",
                            fontSize: 12,
                            padding: 0,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {visibleSnapshots.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "36px 16px",
                      color: "var(--md-sys-color-on-surface-variant)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Icon name="search" size={32} color="var(--md-sys-color-outline)" />
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t("saveManager.noSnapshotsFound")}</div>
                  </div>
                ) : (
                  visibleSnapshots.map((snap) => {
                    const isCurrentRestoring = processingAction === `restoring_${snap.id}`;
                    const isCloudSyncing = processingAction === `cloud_${snap.id}`;

                    return (
                      <Card
                        key={snap.id}
                        elevation="low"
                        radius={20}
                        style={{
                          padding: "16px 20px",
                          background: snap.isActive
                            ? "var(--md-sys-color-surface-container-highest)"
                            : "var(--md-sys-color-surface-container-low)",
                          border: snap.isActive
                            ? "2px solid var(--md-sys-color-primary)"
                            : "1px solid var(--md-sys-color-outline-variant)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 16,
                          flexShrink: 0,
                          minHeight: 74,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 14,
                              background: snap.isActive
                                ? "var(--md-sys-color-primary-container)"
                                : "var(--md-sys-color-surface-container)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Icon
                              name={
                                snap.source === "imported"
                                  ? "cloud_download"
                                  : snap.source === "autobackup"
                                  ? "shield"
                                  : "save"
                              }
                              size={22}
                              color={snap.isActive ? "var(--md-sys-color-primary)" : "var(--md-sys-color-on-surface-variant)"}
                            />
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <div
                                style={{
                                  fontSize: 15,
                                  fontWeight: 800,
                                  color: "var(--md-sys-color-on-surface)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: "100%",
                                }}
                                title={snap.title}
                              >
                                {snap.title}
                              </div>
                              {snap.isActive && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    padding: "2px 8px",
                                    borderRadius: 9999,
                                    background: "var(--status-synced-container)",
                                    color: "var(--status-synced)",
                                    textTransform: "uppercase",
                                    flexShrink: 0,
                                  }}
                                >
                                  ✓ {t("common.activeInGame")}
                                </span>
                              )}
                              {snap.isLocked && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    padding: "2px 8px",
                                    borderRadius: 9999,
                                    background: "rgba(245, 158, 11, 0.15)",
                                    color: "#F59E0B",
                                    border: "1px solid rgba(245, 158, 11, 0.3)",
                                    flexShrink: 0,
                                  }}
                                >
                                  ★ {t("common.protected")}
                                </span>
                              )}
                              {snap.source === "imported" && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    padding: "2px 8px",
                                    borderRadius: 9999,
                                    background: "var(--md-sys-color-tertiary-container)",
                                    color: "var(--md-sys-color-on-tertiary-container)",
                                    flexShrink: 0,
                                  }}
                                >
                                  {t("common.import")}
                                </span>
                              )}
                              {snap.source === "autobackup" && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    padding: "2px 8px",
                                    borderRadius: 9999,
                                    background: "var(--md-sys-color-surface-container-highest)",
                                    color: "var(--md-sys-color-on-surface-variant)",
                                    flexShrink: 0,
                                  }}
                                >
                                  {t("common.autoBackup")}
                                </span>
                              )}
                            </div>

                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--md-sys-color-on-surface-variant)",
                                marginTop: 4,
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                flexWrap: "wrap",
                              }}
                            >
                              <span>{formatDate(snap.createdAt)}</span>
                              <span>•</span>
                              <span>{formatBytes(snap.totalSizeBytes)} ({snap.fileCount} {t("common.files")})</span>
                              {snap.note && (
                                <>
                                  <span>•</span>
                                  <span
                                    title={snap.note}
                                    style={{
                                      fontStyle: "italic",
                                      opacity: 0.85,
                                      maxWidth: 240,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      display: "inline-block",
                                      verticalAlign: "bottom",
                                    }}
                                  >
                                    {snap.note}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions for snapshot */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <button
                            type="button"
                            title={snap.isLocked ? t("saveManager.lockTooltipProtected") : t("saveManager.lockTooltipUnprotected")}
                            onClick={() => handleToggleLocalLock(snap.id)}
                            className="m3-btn"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 9999,
                              background: snap.isLocked ? "rgba(245, 158, 11, 0.15)" : "var(--md-sys-color-surface-container)",
                              color: snap.isLocked ? "#F59E0B" : "var(--md-sys-color-outline)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: snap.isLocked ? "1.5px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--md-sys-color-outline-variant)",
                              cursor: "pointer",
                              fontSize: 16,
                              fontWeight: 800,
                            }}
                          >
                            {snap.isLocked ? "★" : "☆"}
                          </button>

                          {!snap.isActive && (
                            <Button
                              variant="filled"
                              size="sm"
                              pill
                              icon="restart_alt"
                              disabled={isCurrentRestoring || !savePath}
                              onClick={() => setRestoringSnap(snap)}
                            >
                              {isCurrentRestoring ? t("saveManager.applying") : t("saveManager.applyInGame")}
                            </Button>
                          )}

                          <button
                            type="button"
                            title={t("saveManager.exportToDesktop")}
                            onClick={() => handleExportZip(snap.id, snap.title)}
                            className="m3-btn"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 9999,
                              background: "var(--md-sys-color-surface-container)",
                              color: "var(--md-sys-color-primary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px solid var(--md-sys-color-outline-variant)",
                              cursor: "pointer",
                            }}
                          >
                            <Icon name="content_copy" size={16} />
                          </button>

                          <button
                            type="button"
                            title={t("saveManager.uploadThisSnapshot", { target: targetLabel })}
                            disabled={isCloudSyncing}
                            onClick={() => handleCloudSync(snap.id, snap.title)}
                            className="m3-btn"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 9999,
                              background: "var(--md-sys-color-surface-container)",
                              color: "var(--md-sys-color-primary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px solid var(--md-sys-color-outline-variant)",
                              cursor: "pointer",
                            }}
                          >
                            <Icon name={isCloudSyncing ? "sync" : "cloud_upload"} size={16} />
                          </button>

                          <button
                            type="button"
                            title={t("saveManager.deleteSnapshot")}
                            onClick={() => handleDelete(snap.id, snap.title)}
                            className="m3-btn"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 9999,
                              background: "var(--md-sys-color-surface-container)",
                              color: "var(--md-sys-color-error)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px solid var(--md-sys-color-outline-variant)",
                              cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </Card>
                    );
                  })
                )}
              </>
            )
          ) : (
            /* Cloud Tab Content */
            cloudLoading ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "var(--md-sys-color-on-surface-variant)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <Icon name="sync" size={36} color="var(--md-sys-color-primary)" />
                <div style={{ fontSize: 15, fontWeight: 700 }}>{t("saveManager.connectingCloud", { target: targetLabel })}</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{t("saveManager.requestingCloudBackups")}</div>
              </div>
            ) : cloudError ? (
              <div
                style={{
                  background: "var(--md-sys-color-surface-container)",
                  borderRadius: 24,
                  padding: "24px 28px",
                  border: "1.5px solid var(--md-sys-color-error)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--md-sys-color-error)", fontWeight: 700 }}>
                  <Icon name="error" size={20} color="var(--md-sys-color-error)" />
                  <span>{t("saveManager.cloudAccessFailed", { target: targetLabel })}</span>
                </div>
                <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", margin: 0 }}>
                  {cloudError}
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <Button variant="tonal" size="sm" pill icon="sync" onClick={loadCloudBackups}>
                    {t("common.retry")}
                  </Button>
                </div>
              </div>
            ) : cloudBackups.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "48px 24px",
                  color: "var(--md-sys-color-on-surface-variant)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Icon name="cloud" size={48} color="var(--md-sys-color-outline)" />
                <div style={{ fontSize: 16, fontWeight: 700 }}>{t("saveManager.noCloudBackupsYet", { target: targetLabel })}</div>
                <p
                  style={{ fontSize: 13, maxWidth: 440, lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: t("saveManager.noCloudBackupsHint", { target: targetLabel }) }}
                />
                <Button
                  variant="filled"
                  size="md"
                  pill
                  icon="cloud_upload"
                  disabled={!savePath || processingAction !== null}
                  onClick={handleSyncCurrentToCloud}
                >
                  {t("saveManager.uploadNow")}
                </Button>
              </div>
            ) : (
              cloudBackups.map((b) => {
                const isRestoringThis = processingAction === `restoring_cloud_${b.fileName}`;
                const info = parseCloudBackupInfo(b.fileName, b.modified, t);
                const isLocked = b.isLocked || info.isLocked;

                return (
                  <Card
                    key={b.fileName}
                    elevation="low"
                    radius={20}
                    style={{
                      padding: "16px 20px",
                      background: "var(--md-sys-color-surface-container-low)",
                      border: "1px solid var(--md-sys-color-outline-variant)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      flexShrink: 0,
                      minHeight: 74,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 14,
                          background: "var(--md-sys-color-primary-container)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon name="cloud" size={22} color="var(--md-sys-color-on-primary-container)" />
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: "var(--md-sys-color-on-surface)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "100%",
                            }}
                            title={info.title}
                          >
                            {info.title}
                          </div>
                          {info.badgeLabel && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: "2px 8px",
                                borderRadius: 9999,
                                background: info.badgeBg,
                                color: info.badgeColor,
                                flexShrink: 0,
                              }}
                            >
                              {info.badgeLabel}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: "2px 8px",
                              borderRadius: 9999,
                              background: "var(--status-synced-container)",
                              color: "var(--status-synced)",
                              textTransform: "uppercase",
                              flexShrink: 0,
                            }}
                          >
                            {targetLabel}
                          </span>
                          {isLocked && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: "2px 8px",
                                borderRadius: 9999,
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#F59E0B",
                                border: "1px solid rgba(245, 158, 11, 0.3)",
                                flexShrink: 0,
                              }}
                            >
                              ★ {t("common.protected")}
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--md-sys-color-on-surface-variant)",
                            marginTop: 4,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{info.fullDateDisplay}</span>
                          <span>•</span>
                          <span style={{ fontWeight: 700 }}>{formatBytes(b.sizeBytes)}</span>
                          <span>•</span>
                          <span
                            title={b.fileName}
                            style={{
                              fontFamily: "var(--font-family-mono)",
                              fontSize: 11,
                              opacity: 0.75,
                              maxWidth: 240,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              display: "inline-block",
                              verticalAlign: "bottom",
                            }}
                          >
                            {b.fileName}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions for cloud backup */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <button
                        type="button"
                        title={b.isLocked ? t("saveManager.cloudLockProtected") : t("saveManager.cloudLockUnprotected")}
                        onClick={() => handleToggleCloudLock(b)}
                        className="m3-btn"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 9999,
                          background: b.isLocked ? "rgba(245, 158, 11, 0.15)" : "var(--md-sys-color-surface-container)",
                          color: b.isLocked ? "#F59E0B" : "var(--md-sys-color-outline)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: b.isLocked ? "1.5px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--md-sys-color-outline-variant)",
                          cursor: "pointer",
                          fontSize: 16,
                          fontWeight: 800,
                        }}
                      >
                        {b.isLocked ? "★" : "☆"}
                      </button>

                      <Button
                        variant="filled"
                        size="sm"
                        pill
                        icon="cloud_download"
                        disabled={isRestoringThis}
                        onClick={() => handleOpenRestoreCloud(b)}
                      >
                        {isRestoringThis ? t("saveManager.downloadingAndApplying") : t("saveManager.restoreToGame")}
                      </Button>

                      <button
                        type="button"
                        title={t("saveManager.deleteCloudBackup")}
                        onClick={() => handleDeleteCloudBackup(b)}
                        className="m3-btn"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 9999,
                          background: "var(--md-sys-color-surface-container)",
                          color: "var(--md-sys-color-error)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid var(--md-sys-color-outline-variant)",
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </Card>
                );
              })
            )
          )}
        </div>

        {/* Footer tip */}
        <div
          style={{
            padding: "14px 32px",
            background: "var(--md-sys-color-surface-container)",
            borderTop: "1px solid var(--md-sys-color-outline-variant)",
            fontSize: 12,
            color: "var(--md-sys-color-on-surface-variant)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span dangerouslySetInnerHTML={{ __html: t("saveManager.dataProtectionTip") }} />
          <Button variant="tonal" size="sm" pill onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>

      {/* Restore Safety Confirmation Modal (Local) */}
      {restoringSnap && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 10000,
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
              borderRadius: 30,
              padding: 28,
              border: "1.5px solid var(--md-sys-color-outline-variant)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ExpressiveShape size={48} initialShape="squircle" fill="var(--md-sys-color-primary)">
                <Icon name="restart_alt" size={26} color="var(--md-sys-color-on-primary)" />
              </ExpressiveShape>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800 }}>{t("saveManager.confirmApplySnapshotTitle")}</h3>
                <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {restoringSnap.title}
                </p>
              </div>
            </div>

            <div
              style={{
                fontSize: 13,
                color: "var(--md-sys-color-on-surface)",
                lineHeight: 1.6,
                background: "var(--md-sys-color-surface-container)",
                padding: "14px 18px",
                borderRadius: 16,
              }}
            >
              <p>
                {t("saveManager.confirmApplySnapshotDesc")}
              </p>
              <div style={{ marginTop: 8, color: "var(--status-synced)", fontSize: 12, fontWeight: 700 }}>
                {t("saveManager.confirmApplySnapshotSafety")}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="tonal" size="md" pill onClick={() => setRestoringSnap(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="filled" size="md" pill icon="check" onClick={handleRestore}>
                {t("saveManager.confirmAndApply")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Safety Confirmation Modal (Cloud) */}
      {restoringCloudFile && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 10000,
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
              borderRadius: 30,
              padding: 28,
              border: "1.5px solid var(--md-sys-color-outline-variant)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ExpressiveShape size={48} initialShape="squircle" fill="var(--md-sys-color-primary)">
                <Icon name="cloud_download" size={26} color="var(--md-sys-color-on-primary)" />
              </ExpressiveShape>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800 }}>{t("saveManager.confirmRestoreCloudTitle")}</h3>
                <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {restoringCloudFile.fileName} ({targetLabel})
                </p>
              </div>
            </div>

            <div
              style={{
                fontSize: 13,
                color: "var(--md-sys-color-on-surface)",
                lineHeight: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* Uninstalled game notice */}
              {!restoreCheckState?.folderExists && (
                <div
                  style={{
                    background: "rgba(234, 179, 8, 0.12)",
                    border: "1px solid rgba(234, 179, 8, 0.35)",
                    borderRadius: 16,
                    padding: "12px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ color: "#EAB308", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="sync_problem" size={18} /> {t("saveManager.gameNotInstalledTitle")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface)" }}>
                    {t("saveManager.gameNotInstalledDesc", { game: gameName })}
                    <div style={{ marginTop: 4, fontFamily: "var(--font-family-mono)", fontSize: 11, background: "rgba(0,0,0,0.25)", padding: "4px 8px", borderRadius: 8, wordBreak: "break-all" }}>
                      {effectiveSavePath || t("saveManager.notSpecified")}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
                    {t("saveManager.gameNotInstalledQuestion")}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Button variant="tonal" size="sm" pill icon="folder_open" onClick={handlePickDifferentPath}>
                      {t("saveManager.customPathButton")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Path mismatch notice */}
              {restoreCheckState?.pathDiffers && restoreCheckState?.folderExists && (
                <div
                  style={{
                    background: "rgba(56, 189, 248, 0.12)",
                    border: "1px solid rgba(56, 189, 248, 0.35)",
                    borderRadius: 16,
                    padding: "12px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ color: "#38BDF8", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="folder_shared" size={18} /> {t("saveManager.pathDiffersTitle")}
                  </div>
                  <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                    <div>
                      <strong style={{ color: "var(--md-sys-color-on-surface-variant)" }}>{t("saveManager.wasInBackup")}</strong>{" "}
                      <code style={{ fontSize: 11, background: "rgba(0,0,0,0.25)", padding: "2px 6px", borderRadius: 6, wordBreak: "break-all" }}>
                        {restoreCheckState.originalPath}
                      </code>
                    </div>
                    <div>
                      <strong style={{ color: "var(--status-synced)" }}>{t("saveManager.onThisPc")}</strong>{" "}
                      <code style={{ fontSize: 11, background: "rgba(0,0,0,0.25)", padding: "2px 6px", borderRadius: 6, wordBreak: "break-all" }}>
                        {effectiveSavePath}
                      </code>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
                    {t("saveManager.pathDiffersDesc")}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Button variant="tonal" size="sm" pill icon="folder_open" onClick={handlePickDifferentPath}>
                      {t("saveManager.provideNewPath")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Standard destination and safety block */}
              <div
                style={{
                  background: "var(--md-sys-color-surface-container)",
                  padding: "12px 16px",
                  borderRadius: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div>
                  <span dangerouslySetInnerHTML={{ __html: t("saveManager.backupWillBeUnpackedTo", { target: targetLabel }) }} />
                  <div style={{ marginTop: 4, fontFamily: "var(--font-family-mono)", fontSize: 11, background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: 8, wordBreak: "break-all" }}>
                    {effectiveSavePath || t("saveManager.notSpecified")}
                  </div>
                </div>
                <div style={{ color: "var(--status-synced)", fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                  {t("saveManager.confirmApplySnapshotSafety")}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <Button variant="tonal" size="md" pill onClick={() => { setRestoringCloudFile(null); setRestoreCheckState(null); }}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="filled"
                size="md"
                pill
                icon="cloud_download"
                disabled={processingAction !== null}
                onClick={handleRestoreFromCloud}
              >
                {restoreCheckState?.folderExists ? t("saveManager.downloadAndApply") : t("saveManager.createFolderAndRestore")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Snapshot Confirmation Modal */}
      {confirmingDeleteSnap && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "var(--md-sys-color-surface-container-high)",
              borderRadius: 28,
              padding: 28,
              border: "1.5px solid var(--md-sys-color-outline-variant)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ExpressiveShape size={48} initialShape="squircle" fill="var(--md-sys-color-error-container)">
                <Icon name="delete" size={26} color="var(--md-sys-color-on-error-container)" />
              </ExpressiveShape>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800 }}>{t("saveManager.confirmDeleteTitle")}</h3>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--md-sys-color-on-surface-variant)",
                    maxWidth: 320,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {confirmingDeleteSnap.title}
                </p>
              </div>
            </div>

            <div
              style={{
                fontSize: 13,
                color: "var(--md-sys-color-on-surface)",
                lineHeight: 1.5,
                background: "var(--md-sys-color-surface-container)",
                padding: "14px 18px",
                borderRadius: 16,
              }}
            >
              {t("saveManager.confirmDeleteSubtitle")}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="tonal" size="md" pill onClick={() => setConfirmingDeleteSnap(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="filled"
                size="md"
                pill
                icon="delete"
                onClick={executeDeleteSnapshot}
                style={{ background: "var(--md-sys-color-error)", color: "var(--md-sys-color-on-error)" }}
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Cloud Backup Confirmation Modal */}
      {confirmingDeleteCloud && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "var(--md-sys-color-surface-container-high)",
              borderRadius: 28,
              padding: 28,
              border: "1.5px solid var(--md-sys-color-outline-variant)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ExpressiveShape size={48} initialShape="squircle" fill="var(--md-sys-color-error-container)">
                <Icon name="delete" size={26} color="var(--md-sys-color-on-error-container)" />
              </ExpressiveShape>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800 }}>{t("saveManager.confirmDeleteCloudTitle")}</h3>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--md-sys-color-on-surface-variant)",
                    maxWidth: 320,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {confirmingDeleteCloud.fileName}
                </p>
              </div>
            </div>

            <div
              style={{
                fontSize: 13,
                color: "var(--md-sys-color-on-surface)",
                lineHeight: 1.5,
                background: "var(--md-sys-color-surface-container)",
                padding: "14px 18px",
                borderRadius: 16,
              }}
            >
              {t("saveManager.confirmDeleteCloudSubtitle", { target: targetLabel })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="tonal" size="md" pill onClick={() => setConfirmingDeleteCloud(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="filled"
                size="md"
                pill
                icon="delete"
                onClick={executeDeleteCloudBackup}
                style={{ background: "var(--md-sys-color-error)", color: "var(--md-sys-color-on-error)" }}
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
