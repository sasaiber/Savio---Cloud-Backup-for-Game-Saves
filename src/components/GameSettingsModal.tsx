import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { ExpressiveShape } from "./ExpressiveShape";
import { api, type GameProcessStatus, type SaveInfo } from "../lib/tauri";
import { useSettings, getGameSyncConfig, type GameSyncConfig } from "../state/settings";
import type { GameItem } from "../pages/Library";
import { useI18n } from "../i18n/I18nProvider";

interface GameSettingsModalProps {
  game: GameItem | null;
  onClose: () => void;
  targetStorageName: string;
  targetStorageLabel: string;
  onNotify: (msg: string) => void;
  onOpenCloudRestore?: (game: GameItem) => void;
  onDeleteCustomGame?: (game: GameItem) => void;
  onSaved?: () => void;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes === 0) return "0 B";
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

export function GameSettingsModal({
  game,
  onClose,
  targetStorageName,
  targetStorageLabel,
  onNotify,
  onOpenCloudRestore,
  onDeleteCustomGame,
  onSaved,
}: GameSettingsModalProps) {
  const { settings, update } = useSettings();
  const { t } = useI18n();

  // Basic game fields
  const [customName, setCustomName] = useState("");
  const [customSavePath, setCustomSavePath] = useState("");
  const [customExe, setCustomExe] = useState("");
  const [customNotes, setCustomNotes] = useState("");

  // Inspect save folder status
  const [inspectInfo, setInspectInfo] = useState<SaveInfo | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  // Sync configuration
  const [config, setConfig] = useState<GameSyncConfig>({
    enabled: true,
    syncOnExit: true,
    syncIntervalMinutes: 0,
    autoCloudUpload: true,
    customExeName: "",
    notifyOnSync: true,
  });

  const [processStatus, setProcessStatus] = useState<GameProcessStatus | null>(null);
  const [isCheckingProcess, setIsCheckingProcess] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [detectedExes, setDetectedExes] = useState<string[]>([]);
  const [intervalValue, setIntervalValue] = useState<number>(30);
  const [intervalUnit, setIntervalUnit] = useState<"minutes" | "hours" | "days">("minutes");
  const [enableInterval, setEnableInterval] = useState<boolean>(false);

  // Initialize once per game
  const initializedGameIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!game) {
      initializedGameIdRef.current = null;
      return;
    }
    if (initializedGameIdRef.current === game.id) return;
    initializedGameIdRef.current = game.id;

    setCustomName(game.name || "");
    setCustomSavePath(game.savePath || "");
    setCustomNotes(game.notes || "");

    const current = getGameSyncConfig(settings, game.id);
    const initialExe =
      current.customExeName ||
      (game.exePath ? game.exePath.replace(/^.*[\\/]/, "") : "");

    setCustomExe(initialExe);
    setConfig({
      ...current,
      customExeName: initialExe,
    });

    if (current.syncIntervalMinutes > 0) {
      setEnableInterval(true);
      if (current.syncIntervalMinutes % 1440 === 0) {
        setIntervalValue(current.syncIntervalMinutes / 1440);
        setIntervalUnit("days");
      } else if (current.syncIntervalMinutes % 60 === 0) {
        setIntervalValue(current.syncIntervalMinutes / 60);
        setIntervalUnit("hours");
      } else {
        setIntervalValue(current.syncIntervalMinutes);
        setIntervalUnit("minutes");
      }
    } else {
      setEnableInterval(false);
      setIntervalValue(30);
      setIntervalUnit("minutes");
    }
  }, [game, settings]);

  // Inspect save path whenever it changes
  useEffect(() => {
    const trimmed = customSavePath.trim();
    if (!trimmed || trimmed.length < 3) {
      setInspectInfo(null);
      setIsInspecting(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsInspecting(true);
      api
        .inspectFolder(trimmed)
        .then((info) => {
          if (!cancelled) {
            setInspectInfo(info);
            setIsInspecting(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setInspectInfo(null);
            setIsInspecting(false);
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customSavePath]);

  // Check live process running state
  const checkProcess = useCallback(async () => {
    if (!game) return;
    setIsCheckingProcess(true);
    try {
      const res = await api.checkRunningGames([
        {
          gameId: game.id,
          gameName: customName || game.name,
          exePath: game.exePath,
          installDir: game.installDir,
          customExeName: customExe || undefined,
        },
      ]);
      setProcessStatus(res[game.id] || { isRunning: false });
    } catch (e) {
      console.warn("Failed to check process:", e);
    } finally {
      setIsCheckingProcess(false);
    }
  }, [game, customName, customExe]);

  // Load detected exes in installDir
  useEffect(() => {
    if (!game?.installDir) return;
    api.getGameExecutables(game.installDir).then((exes) => {
      setDetectedExes(exes);
    });
  }, [game?.installDir]);

  // Poll process state while modal is open
  useEffect(() => {
    if (!game) return;
    checkProcess();
    const interval = setInterval(checkProcess, 3500);
    return () => clearInterval(interval);
  }, [game, checkProcess]);

  if (!game) return null;

  const handlePickFolder = async () => {
    try {
      const picked = await api.pickFolder();
      if (picked) {
        setCustomSavePath(picked);
      }
    } catch (e) {
      onNotify(t("saveManager.folderPickErrorToast", { error: String(e) }));
    }
  };

  const handleOpenFolder = async () => {
    if (!customSavePath) return;
    try {
      await api.openFolder(customSavePath);
    } catch (e) {
      onNotify(`${t("saveManager.saveFolderNotFoundToast")}: ${e}`);
    }
  };

  const handlePickExe = async () => {
    try {
      const file = await api.pickFile(t("customGame.exeFilterName"));
      if (file) {
        const exeName = file.replace(/^.*[\\/]/, "");
        setCustomExe(exeName);
        onNotify(t("saveManager.newPathChosenToast", { path: exeName }));
      }
    } catch (e) {
      onNotify(t("saveManager.folderPickErrorToast", { error: String(e) }));
    }
  };

  const handleUploadToCloudNow = async () => {
    const pathToUse = customSavePath.trim() || game.savePath;
    if (!pathToUse) {
      onNotify(t("saveManager.specifySavePathFirstToast"));
      return;
    }
    setIsSyncingNow(true);
    try {
      const storeToUse = game.isCustom ? "Custom" : game.store;
      onNotify(t("saveManager.uploadingToTarget", { target: targetStorageName }));
      const snap = await api.createSnapshot(
        game.id,
        customName.trim() || game.name,
        pathToUse,
        `Snapshot (${new Date().toLocaleDateString()})`,
        "Settings manual sync",
        storeToUse
      );
      const res = await api.syncSnapshotToCloud(
        game.id,
        customName.trim() || game.name,
        snap.id,
        settings.backupTargetType,
        settings,
        storeToUse
      );
      onNotify(t("saveManager.snapshotToast", { title: game.name, result: res }));
    } catch (e) {
      onNotify(t("saveManager.cloudUploadErrorToast", { error: String(e) }));
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleSave = () => {
    const computedMinutes = enableInterval
      ? intervalUnit === "days"
        ? Math.max(1, intervalValue) * 1440
        : intervalUnit === "hours"
        ? Math.max(1, intervalValue) * 60
        : Math.max(1, intervalValue)
      : 0;

    const newConfig: GameSyncConfig = {
      ...config,
      customExeName: customExe.trim() || undefined,
      syncIntervalMinutes: computedMinutes,
    };

    const newConfigs = {
      ...(settings.gameSyncConfigs || {}),
      [game.id]: newConfig,
    };

    let newEnabled = [...(settings.enabledSyncGameIds || [])];
    if (newConfig.enabled && !newEnabled.includes(game.id)) {
      newEnabled.push(game.id);
    } else if (!newConfig.enabled && newEnabled.includes(game.id)) {
      newEnabled = newEnabled.filter((id) => id !== game.id);
    }

    let nextCustomGames = settings.customGames;
    let nextCustomSavePaths = settings.customSavePaths;

    if (game.isCustom) {
      nextCustomGames = (settings.customGames || []).map((c) => {
        if (c.id === game.id) {
          return {
            ...c,
            name: customName.trim() || c.name,
            savePath: customSavePath.trim(),
            exePath: customExe.trim() ? (c.exePath && c.exePath.includes("\\") ? c.exePath : customExe.trim()) : c.exePath,
            notes: customNotes.trim() || undefined,
          };
        }
        return c;
      });
    } else {
      if (customSavePath.trim() !== (game.savePath || "")) {
        nextCustomSavePaths = {
          ...(settings.customSavePaths || {}),
          [game.id]: customSavePath.trim(),
        };
      }
    }

    update({
      gameSyncConfigs: newConfigs,
      enabledSyncGameIds: newEnabled,
      customGames: nextCustomGames,
      customSavePaths: nextCustomSavePaths,
    });

    onNotify(t("gameSettings.settingsSavedToast", { game: customName.trim() || game.name }));
    onSaved?.();
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(8px)",
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
          maxWidth: 620,
          maxHeight: "90vh",
          background: "var(--md-sys-color-surface-container-high)",
          borderRadius: 28,
          border: "1px solid var(--md-sys-color-outline-variant)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            background: "linear-gradient(135deg, var(--md-sys-color-surface-container) 0%, var(--md-sys-color-surface-container-high) 100%)",
            borderBottom: "1px solid var(--md-sys-color-outline-variant)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
            <ExpressiveShape size={44} initialShape="squircle" fill="var(--md-sys-color-primary)">
              <Icon name="tune" size={24} color="var(--md-sys-color-on-primary)" />
            </ExpressiveShape>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "var(--md-sys-color-on-surface)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  letterSpacing: "-0.3px",
                  margin: 0,
                }}
              >
                {t("gameSettings.modalTitle", { game: game.name })}
              </h2>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 3,
                  fontSize: 12,
                  color: "var(--md-sys-color-on-surface-variant)",
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    padding: "1px 8px",
                    borderRadius: 9999,
                    background: game.isCustom
                      ? "var(--md-sys-color-primary-container)"
                      : "var(--md-sys-color-surface-container-highest)",
                    color: game.isCustom
                      ? "var(--md-sys-color-on-primary-container)"
                      : "var(--md-sys-color-on-surface)",
                  }}
                >
                  {game.isCustom ? `★ ${t("library.tagCustom")}` : game.store}
                </span>

                <span>•</span>

                {processStatus?.isRunning ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--status-synced)",
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--status-synced)" }} />
                    {t("gameSettings.runningStatus", { pid: processStatus.pid ?? "" })}
                  </span>
                ) : (
                  <span style={{ opacity: 0.7 }}>{t("gameSettings.notRunningStatus")}</span>
                )}

                <button
                  type="button"
                  onClick={checkProcess}
                  disabled={isCheckingProcess}
                  title={t("gameSettings.checkProcessStatus")}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--md-sys-color-primary)",
                    cursor: isCheckingProcess ? "default" : "pointer",
                    padding: 0,
                    fontSize: 11,
                    display: "inline-flex",
                    alignItems: "center",
                    opacity: isCheckingProcess ? 0.5 : 1,
                  }}
                >
                  <Icon name="sync" size={13} />
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="m3-btn"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9999,
              background: "var(--md-sys-color-surface-container)",
              color: "var(--md-sys-color-on-surface-variant)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--md-sys-color-outline-variant)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Section 1: Quick Cloud Actions */}
          <div
            style={{
              padding: "14px 18px",
              borderRadius: 18,
              background: "var(--md-sys-color-surface-container-low)",
              border: "1px solid var(--md-sys-color-outline-variant)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
                <Icon name="cloud" size={18} color="var(--md-sys-color-primary)" />
                <span>{t("gameSettings.cloudTarget", { target: targetStorageName })}</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--md-sys-color-on-surface-variant)",
                  maxWidth: 240,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={targetStorageLabel}
              >
                {targetStorageLabel}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Button
                variant="filled"
                size="sm"
                pill
                icon={isSyncingNow ? "sync" : "cloud_upload"}
                disabled={isSyncingNow || (!customSavePath.trim() && !game.savePath)}
                onClick={handleUploadToCloudNow}
                style={{
                  height: 34,
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {isSyncingNow ? t("saveManager.uploadingToTarget", { target: "" }) : t("gameSettings.uploadToCloud")}
              </Button>

              <Button
                variant="tonal"
                size="sm"
                pill
                icon="cloud_download"
                disabled={!customSavePath.trim() && !game.savePath}
                onClick={() => {
                  onClose();
                  if (onOpenCloudRestore) {
                    onOpenCloudRestore(game);
                  }
                }}
                style={{
                  height: 34,
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {t("gameSettings.downloadFromCloud")}
              </Button>
            </div>
          </div>

          {/* Section 2: Files & Paths (Save Path & Executable) */}
          <div
            style={{
              padding: "16px 18px",
              borderRadius: 18,
              background: "var(--md-sys-color-surface-container-low)",
              border: "1px solid var(--md-sys-color-outline-variant)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="folder" size={18} color="var(--md-sys-color-primary)" />
              <span>{t("gameSettings.gameFilesSection")}</span>
            </div>

            {/* Custom Game Name & Notes if custom */}
            {game.isCustom && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 5 }}>
                    {t("gameSettings.gameNameLabel")}
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={t("customGame.gameNamePlaceholder")}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 12px",
                      borderRadius: 12,
                      background: "var(--md-sys-color-surface-container)",
                      border: "1px solid var(--md-sys-color-outline-variant)",
                      color: "var(--md-sys-color-on-surface)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 5 }}>
                    {t("gameSettings.notesLabel")}
                  </label>
                  <input
                    type="text"
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    placeholder={t("gameSettings.notesPlaceholder")}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 12px",
                      borderRadius: 12,
                      background: "var(--md-sys-color-surface-container)",
                      border: "1px solid var(--md-sys-color-outline-variant)",
                      color: "var(--md-sys-color-on-surface)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Save Folder Row */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  {t("gameSettings.saveFolderLabel")}
                </label>
                {inspectInfo ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-synced)" }}>
                    ✓ {inspectInfo.fileCount} {t("common.files")} ({formatBytes(inspectInfo.totalSizeBytes)})
                  </span>
                ) : isInspecting ? (
                  <span style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" }}>
                    {t("customGame.inspectChecking")}
                  </span>
                ) : customSavePath ? (
                  <span style={{ fontSize: 11, color: "var(--md-sys-color-outline)" }}>
                    {t("gameSettings.folderSpecified")}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--md-sys-color-error)" }}>
                    {t("gameSettings.folderNotSpecified")}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={customSavePath}
                  onChange={(e) => setCustomSavePath(e.target.value)}
                  placeholder="C:\Users\...\Saved Games\Game"
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 12,
                    background: "var(--md-sys-color-surface-container)",
                    border: "1px solid var(--md-sys-color-outline-variant)",
                    color: "var(--md-sys-color-on-surface)",
                    fontSize: 12,
                    outline: "none",
                    fontFamily: "var(--font-family-mono)",
                  }}
                />
                <Button variant="tonal" size="sm" pill icon="folder_open" onClick={handlePickFolder} style={{ height: 34, fontSize: 12 }}>
                  {t("common.browse")}
                </Button>
                {customSavePath && (
                  <Button variant="tonal" size="sm" pill icon="folder" onClick={handleOpenFolder} title={t("gameSettings.openInExplorer")} style={{ height: 34, padding: "0 10px" }} />
                )}
              </div>
            </div>

            {/* Executable (.exe) Row */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 5 }}>
                {t("gameSettings.gameExeLabel")}
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={customExe}
                  onChange={(e) => setCustomExe(e.target.value)}
                  placeholder="game.exe"
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 12,
                    background: "var(--md-sys-color-surface-container)",
                    border: "1px solid var(--md-sys-color-outline-variant)",
                    color: "var(--md-sys-color-on-surface)",
                    fontSize: 12,
                    outline: "none",
                    fontFamily: "var(--font-family-mono)",
                  }}
                />
                <Button variant="tonal" size="sm" pill icon="sports_esports" onClick={handlePickExe} style={{ height: 34, fontSize: 12 }}>
                  {t("gameSettings.chooseExe")}
                </Button>
              </div>

              {detectedExes.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" }}>
                    {t("gameSettings.foundInFolder")}
                  </span>
                  {detectedExes.slice(0, 4).map((exe) => (
                    <button
                      key={exe}
                      type="button"
                      onClick={() => setCustomExe(exe)}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 9999,
                        background:
                          customExe?.toLowerCase() === exe.toLowerCase()
                            ? "var(--md-sys-color-primary)"
                            : "var(--md-sys-color-surface-container)",
                        color:
                          customExe?.toLowerCase() === exe.toLowerCase()
                            ? "var(--md-sys-color-on-primary)"
                            : "var(--md-sys-color-on-surface)",
                        border: "1px solid var(--md-sys-color-outline-variant)",
                        cursor: "pointer",
                        fontFamily: "var(--font-family-mono)",
                      }}
                    >
                      {exe}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Automation & Triggers */}
          <div
            style={{
              padding: "16px 18px",
              borderRadius: 18,
              background: "var(--md-sys-color-surface-container-low)",
              border: "1px solid var(--md-sys-color-outline-variant)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="sync" size={18} color="var(--md-sys-color-primary)" />
              <span>{t("gameSettings.automationSection")}</span>
            </div>

            {/* Master Switch */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 14,
                background: config.enabled
                  ? "var(--md-sys-color-primary-container)"
                  : "var(--md-sys-color-surface-container)",
                color: config.enabled
                  ? "var(--md-sys-color-on-primary-container)"
                  : "var(--md-sys-color-on-surface)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{t("gameSettings.autoTrackingTitle")}</div>
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 1 }}>
                  {t("gameSettings.autoTrackingDesc")}
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: "var(--md-sys-color-primary)", cursor: "pointer" }}
              />
            </label>

            {/* Sub-triggers */}
            {config.enabled && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingLeft: 4,
                  marginTop: 2,
                }}
              >
                {/* Trigger: Sync on Exit */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: 12,
                    background: "var(--md-sys-color-surface-container)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon name="sports_esports" size={18} color="var(--md-sys-color-primary)" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{t("gameSettings.syncOnExitTitle")}</div>
                      <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" }}>
                        {t("gameSettings.syncOnExitDesc")}
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.syncOnExit}
                    onChange={(e) => setConfig((prev) => ({ ...prev, syncOnExit: e.target.checked }))}
                    style={{ width: 17, height: 17, accentColor: "var(--md-sys-color-primary)", cursor: "pointer" }}
                  />
                </label>

                {/* Trigger: Schedule Interval */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "var(--md-sys-color-surface-container)",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Icon name="schedule" size={18} color="var(--md-sys-color-secondary)" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{t("gameSettings.scheduledSyncTitle")}</div>
                        <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" }}>
                          {t("gameSettings.scheduledSyncDesc")}
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableInterval}
                      onChange={(e) => setEnableInterval(e.target.checked)}
                      style={{ width: 17, height: 17, accentColor: "var(--md-sys-color-primary)", cursor: "pointer" }}
                    />
                  </label>

                  {enableInterval && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        background: "var(--md-sys-color-surface-container-high)",
                        borderRadius: 10,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{t("gameSettings.everyLabel")}</span>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={intervalValue}
                        onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          width: 50,
                          padding: "4px 6px",
                          borderRadius: 8,
                          background: "var(--md-sys-color-surface-container-highest)",
                          border: "1px solid var(--md-sys-color-outline-variant)",
                          color: "var(--md-sys-color-on-surface)",
                          fontSize: 12,
                          fontWeight: 800,
                          textAlign: "center",
                          outline: "none",
                        }}
                      />
                      <select
                        value={intervalUnit}
                        onChange={(e) => setIntervalUnit(e.target.value as any)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 8,
                          background: "var(--md-sys-color-surface-container-highest)",
                          border: "1px solid var(--md-sys-color-outline-variant)",
                          color: "var(--md-sys-color-on-surface)",
                          fontSize: 12,
                          fontWeight: 700,
                          outline: "none",
                          cursor: "pointer",
                        }}
                      >
                        <option value="minutes">{t("gameSettings.minutesUnit")}</option>
                        <option value="hours">{t("gameSettings.hoursUnit")}</option>
                        <option value="days">{t("gameSettings.daysUnit")}</option>
                      </select>

                      <div style={{ display: "flex", gap: 5, marginLeft: "auto" }}>
                        {[
                          { label: `15${t("common.min")}`, val: 15, unit: "minutes" as const },
                          { label: `30${t("common.min")}`, val: 30, unit: "minutes" as const },
                          { label: `1${t("common.hours")}`, val: 1, unit: "hours" as const },
                          { label: `2${t("common.hours")}`, val: 2, unit: "hours" as const },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setIntervalValue(preset.val);
                              setIntervalUnit(preset.unit);
                            }}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              background:
                                intervalValue === preset.val && intervalUnit === preset.unit
                                  ? "var(--md-sys-color-primary)"
                                  : "var(--md-sys-color-surface-container-highest)",
                              color:
                                intervalValue === preset.val && intervalUnit === preset.unit
                                  ? "var(--md-sys-color-on-primary)"
                                  : "var(--md-sys-color-on-surface)",
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cloud Auto Upload */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: 12,
                    background: "var(--md-sys-color-surface-container)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon name="cloud_upload" size={18} color="var(--md-sys-color-primary)" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {t("gameSettings.autoUploadTitle", { target: targetStorageName })}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" }}>
                        {t("gameSettings.autoUploadDesc")}
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.autoCloudUpload}
                    onChange={(e) => setConfig((prev) => ({ ...prev, autoCloudUpload: e.target.checked }))}
                    style={{ width: 17, height: 17, accentColor: "var(--md-sys-color-primary)", cursor: "pointer" }}
                  />
                </label>

                {/* Notifications */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: 12,
                    background: "var(--md-sys-color-surface-container)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon name="info" size={18} color="var(--md-sys-color-primary)" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{t("gameSettings.notificationsTitle")}</div>
                      <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" }}>
                        {t("gameSettings.notificationsDesc")}
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.notifyOnSync}
                    onChange={(e) => setConfig((prev) => ({ ...prev, notifyOnSync: e.target.checked }))}
                    style={{ width: 17, height: 17, accentColor: "var(--md-sys-color-primary)", cursor: "pointer" }}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Section 4: If custom game, allow deleting */}
          {game.isCustom && onDeleteCustomGame && (
            <div style={{ display: "flex", justifyContent: "flex-start", padding: "0 4px" }}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDeleteCustomGame(game);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--md-sys-color-error)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderRadius: 8,
                }}
              >
                <Icon name="delete" size={16} />
                <span>{t("gameSettings.deleteGameFromLibrary")}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            background: "var(--md-sys-color-surface-container)",
            borderTop: "1px solid var(--md-sys-color-outline-variant)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <Button variant="tonal" size="sm" pill onClick={onClose} style={{ height: 34, fontSize: 13 }}>
            {t("common.cancel")}
          </Button>

          <Button variant="filled" size="sm" pill icon="check" onClick={handleSave} style={{ height: 34, fontSize: 13, fontWeight: 700 }}>
            {t("gameSettings.saveSettingsButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}
