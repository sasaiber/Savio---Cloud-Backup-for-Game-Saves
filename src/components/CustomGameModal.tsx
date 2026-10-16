import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { ExpressiveShape } from "./ExpressiveShape";
import { api, type SaveInfo } from "../lib/tauri";
import { useSettings, type CustomGameDef } from "../state/settings";
import { useI18n } from "../i18n/I18nProvider";

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

interface AddCustomGameModalProps {
  onClose: () => void;
  onSave: (game: CustomGameDef) => void;
  onNotify: (msg: string) => void;
}

export function AddCustomGameModal({ onClose, onSave, onNotify }: AddCustomGameModalProps) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const [name, setName] = useState("");
  const [savePath, setSavePath] = useState("");
  const [exePath, setExePath] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [isSearchingCover, setIsSearchingCover] = useState(false);

  const [inspectInfo, setInspectInfo] = useState<SaveInfo | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePickLocalCover = async () => {
    try {
      const file = await api.pickFile("Images (*.jpg;*.png;*.webp;*.jpeg)\0*.jpg;*.png;*.webp;*.jpeg\0All Files (*.*)\0*.*\0\0");
      if (file) {
        setCoverUrl(convertFileSrc(file));
      }
    } catch (e) {
      onNotify(String(e));
    }
  };

  const handleFindCover = async () => {
    if (!name.trim()) return;
    setIsSearchingCover(true);
    try {
      const cover = await api.findGameCover(name.trim(), settings.steamGridDbApiKey);
      if (cover) {
        setCoverUrl(cover);
      }
    } finally {
      setIsSearchingCover(false);
    }
  };

  // Automatically search cover when name changes if coverUrl is empty
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2 || coverUrl.trim().length > 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const cover = await api.findGameCover(trimmed);
        if (!cancelled && cover && !coverUrl) {
          setCoverUrl(cover);
        }
      } catch {
        /* ignore */
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name]);

  // When savePath changes, automatically inspect it with debounce
  useEffect(() => {
    const trimmed = savePath.trim();
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
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [savePath]);

  const handlePickFolder = async () => {
    try {
      const picked = await api.pickFolder();
      if (picked) {
        setSavePath(picked);
        // If name is still empty, derive a suggestion from the folder name
        if (!name.trim()) {
          const parts = picked.split(/[\\/]/).filter(Boolean);
          if (parts.length > 0) {
            const lastPart = parts[parts.length - 1];
            if (lastPart.toLowerCase() !== "saves" && lastPart.toLowerCase() !== "savegames") {
              setName(lastPart);
            } else if (parts.length > 1) {
              setName(parts[parts.length - 2]);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Folder picker failed:", e);
    }
  };

  const handlePickExe = async () => {
    try {
      const picked = await api.pickFile(t("customGame.exeFilterName"));
      if (picked) {
        setExePath(picked);
        // If name is still empty, derive name from exe without extension
        if (!name.trim()) {
          const fileName = picked.split(/[\\/]/).pop() || "";
          const baseName = fileName.replace(/\.exe$/i, "");
          if (baseName) {
            setName(baseName);
          }
        }
      }
    } catch (e) {
      console.warn("Exe picker failed:", e);
    }
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setErrorMsg(t("customGame.titleRequiredError"));
      return;
    }
    if (!savePath.trim()) {
      setErrorMsg(t("customGame.savePathRequiredError"));
      return;
    }

    const newGame: CustomGameDef = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      savePath: savePath.trim(),
      exePath: exePath.trim() || undefined,
      coverUrl: coverUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
    };

    onSave(newGame);
    onNotify(t("customGame.gameAddedToast", { game: newGame.name }));
    onClose();
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
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 580,
          maxHeight: "92vh",
          overflowY: "auto",
          background: "var(--md-sys-color-surface-container-high)",
          borderRadius: 32,
          padding: 32,
          border: "1.5px solid var(--md-sys-color-outline-variant)",
          boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ExpressiveShape size={52} initialShape="cookie9" fill="var(--md-sys-color-primary)">
              <Icon name="sports_esports" size={28} color="var(--md-sys-color-on-primary)" />
            </ExpressiveShape>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px" }}>{t("customGame.addTitle")}</h2>
              <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                {t("customGame.addSubtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="m3-btn"
            style={{
              width: 36,
              height: 36,
              borderRadius: 9999,
              background: "var(--md-sys-color-surface-container)",
              color: "var(--md-sys-color-on-surface-variant)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              background: "var(--md-sys-color-error-container)",
              color: "var(--md-sys-color-on-error-container)",
              padding: "10px 16px",
              borderRadius: 14,
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Icon name="error" size={18} color="var(--md-sys-color-error)" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 1. Game Name */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>
              {t("customGame.gameNameLabel")} <span style={{ color: "var(--md-sys-color-error)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={t("customGame.gameNamePlaceholder")}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 18px",
                borderRadius: 16,
                background: "var(--md-sys-color-surface-container)",
                border: "1.5px solid var(--md-sys-color-outline-variant)",
                color: "var(--md-sys-color-on-surface)",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          {/* 2. Save Path */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>
              {t("customGame.saveFolderLabel")} <span style={{ color: "var(--md-sys-color-error)" }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={savePath}
                onChange={(e) => {
                  setSavePath(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="C:\Users\...\Saved Games\MyGame"
                style={{
                  flex: 1,
                  boxSizing: "border-box",
                  padding: "12px 16px",
                  borderRadius: 16,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1.5px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  fontFamily: "var(--font-family-mono)",
                  outline: "none",
                }}
              />
              <Button variant="tonal" size="md" pill icon="folder_open" onClick={handlePickFolder}>
                {t("common.browse")}
              </Button>
            </div>

            {/* Folder inspection feedback */}
            {savePath.trim() && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 14px",
                  borderRadius: 12,
                  background: inspectInfo && inspectInfo.fileCount > 0
                    ? "var(--md-sys-color-primary-container)"
                    : "var(--md-sys-color-surface-container)",
                  color: inspectInfo && inspectInfo.fileCount > 0
                    ? "var(--md-sys-color-on-primary-container)"
                    : "var(--md-sys-color-on-surface-variant)",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon
                  name={inspectInfo && inspectInfo.fileCount > 0 ? "check_circle" : "info"}
                  size={16}
                  color={inspectInfo && inspectInfo.fileCount > 0 ? "var(--md-sys-color-primary)" : "var(--md-sys-color-outline)"}
                />
                {isInspecting ? (
                  <span>{t("customGame.inspectChecking")}</span>
                ) : inspectInfo && inspectInfo.fileCount > 0 ? (
                  <span>
                    {t("customGame.filesCountLabel", { count: inspectInfo.fileCount, size: formatBytes(inspectInfo.totalSizeBytes) })}
                    {inspectInfo.lastModified && (
                      <> • {t("customGame.lastModifiedPrefix", { date: new Date(inspectInfo.lastModified * 1000).toLocaleDateString() })}</>
                    )}
                  </span>
                ) : (
                  <span>{t("customGame.folderEmptyOrNotExists")}</span>
                )}
              </div>
            )}
          </div>

          {/* 3. Executable Path (Optional) */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>
              {t("customGame.gameExeLabel")} <span style={{ opacity: 0.6, fontWeight: 500 }}>({t("common.optional")})</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={exePath}
                onChange={(e) => setExePath(e.target.value)}
                placeholder="D:\Games\MyGame\game.exe"
                style={{
                  flex: 1,
                  boxSizing: "border-box",
                  padding: "12px 16px",
                  borderRadius: 16,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1.5px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  fontFamily: "var(--font-family-mono)",
                  outline: "none",
                }}
              />
              <Button variant="tonal" size="md" pill icon="sports_esports" onClick={handlePickExe}>
                {t("customGame.chooseExe")}
              </Button>
            </div>
            <p style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)", marginTop: 4 }}>
              {t("customGame.gameExeHint")}
            </p>
          </div>

          {/* 4. Notes & Tag */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>
                {t("customGame.tagLabel")} <span style={{ opacity: 0.6, fontWeight: 500 }}>({t("common.optional")})</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("customGame.tagPlaceholder")}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 16px",
                  borderRadius: 14,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1.5px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  {t("customGame.coverUrlLabel")} <span style={{ opacity: 0.6, fontWeight: 500 }}>({t("common.optional")})</span>
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={handlePickLocalCover}
                    style={{
                      background: "var(--md-sys-color-surface-container-high)",
                      border: "1px solid var(--md-sys-color-outline-variant)",
                      color: "var(--md-sys-color-on-surface)",
                      borderRadius: 8,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Icon name="folder" size={14} />
                    {t("customGame.pickLocalCover")}
                  </button>
                  <button
                    type="button"
                    onClick={handleFindCover}
                    disabled={isSearchingCover || !name.trim()}
                    style={{
                      background: "var(--md-sys-color-surface-container-high)",
                      border: "1px solid var(--md-sys-color-outline-variant)",
                      color: "var(--md-sys-color-primary)",
                      borderRadius: 8,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Icon name="search" size={14} />
                    {isSearchingCover ? t("customGame.searchingCover") : t("customGame.findCoverButton")}
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder={t("customGame.coverUrlPlaceholder")}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 16px",
                  borderRadius: 14,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1.5px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
          <Button variant="tonal" size="md" pill onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="filled" size="md" pill icon="add" onClick={handleCreate}>
            {t("customGame.addGameButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface EditCustomGameModalProps {
  game: CustomGameDef;
  onClose: () => void;
  onSave: (updated: CustomGameDef) => void;
  onNotify: (msg: string) => void;
}

export function EditCustomGameModal({ game, onClose, onSave, onNotify }: EditCustomGameModalProps) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const [name, setName] = useState(game.name);
  const [savePath, setSavePath] = useState(game.savePath);
  const [exePath, setExePath] = useState(game.exePath || "");
  const [coverUrl, setCoverUrl] = useState(game.coverUrl || "");
  const [notes, setNotes] = useState(game.notes || "");
  const [isSearchingCover, setIsSearchingCover] = useState(false);

  const [inspectInfo, setInspectInfo] = useState<SaveInfo | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePickLocalCover = async () => {
    try {
      const file = await api.pickFile("Images (*.jpg;*.png;*.webp;*.jpeg)\0*.jpg;*.png;*.webp;*.jpeg\0All Files (*.*)\0*.*\0\0");
      if (file) {
        setCoverUrl(convertFileSrc(file));
      }
    } catch (e) {
      onNotify(String(e));
    }
  };

  const handleFindCover = async () => {
    if (!name.trim()) return;
    setIsSearchingCover(true);
    try {
      const cover = await api.findGameCover(name.trim(), settings.steamGridDbApiKey);
      if (cover) {
        setCoverUrl(cover);
      }
    } finally {
      setIsSearchingCover(false);
    }
  };

  // When savePath changes, automatically inspect it with debounce
  useEffect(() => {
    const trimmed = savePath.trim();
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
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [savePath]);

  const handlePickFolder = async () => {
    try {
      const picked = await api.pickFolder();
      if (picked) {
        setSavePath(picked);
      }
    } catch (e) {
      console.warn("Folder picker failed:", e);
    }
  };

  const handlePickExe = async () => {
    try {
      const picked = await api.pickFile(t("customGame.exeFilterName"));
      if (picked) {
        setExePath(picked);
      }
    } catch (e) {
      console.warn("Exe picker failed:", e);
    }
  };

  const handleUpdate = () => {
    if (!name.trim()) {
      setErrorMsg(t("customGame.titleRequiredError"));
      return;
    }
    if (!savePath.trim()) {
      setErrorMsg(t("customGame.savePathRequiredError"));
      return;
    }

    const updated: CustomGameDef = {
      ...game,
      name: name.trim(),
      savePath: savePath.trim(),
      exePath: exePath.trim() || undefined,
      coverUrl: coverUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    onSave(updated);
    onNotify(t("customGame.gameUpdatedToast", { game: updated.name }));
    onClose();
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
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 580,
          maxHeight: "92vh",
          overflowY: "auto",
          background: "var(--md-sys-color-surface-container-high)",
          borderRadius: 32,
          padding: 32,
          border: "1.5px solid var(--md-sys-color-outline-variant)",
          boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ExpressiveShape size={52} initialShape="squircle" fill="var(--md-sys-color-primary)">
              <Icon name="tune" size={28} color="var(--md-sys-color-on-primary)" />
            </ExpressiveShape>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>{t("customGame.editTitle")}</h2>
              <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                {game.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="m3-btn"
            style={{
              width: 36,
              height: 36,
              borderRadius: 9999,
              background: "var(--md-sys-color-surface-container)",
              color: "var(--md-sys-color-on-surface-variant)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              background: "var(--md-sys-color-error-container)",
              color: "var(--md-sys-color-on-error-container)",
              padding: "10px 16px",
              borderRadius: 14,
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Icon name="error" size={18} color="var(--md-sys-color-error)" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>
              {t("customGame.gameNameLabel")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 18px",
                borderRadius: 16,
                background: "var(--md-sys-color-surface-container)",
                border: "1.5px solid var(--md-sys-color-outline-variant)",
                color: "var(--md-sys-color-on-surface)",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>
              {t("customGame.saveFolderLabel")}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={savePath}
                onChange={(e) => setSavePath(e.target.value)}
                style={{
                  flex: 1,
                  boxSizing: "border-box",
                  padding: "12px 16px",
                  borderRadius: 16,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1.5px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  fontFamily: "var(--font-family-mono)",
                  outline: "none",
                }}
              />
              <Button variant="tonal" size="md" pill icon="folder_open" onClick={handlePickFolder}>
                {t("common.browse")}
              </Button>
            </div>

            {savePath.trim() && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 14px",
                  borderRadius: 12,
                  background: inspectInfo && inspectInfo.fileCount > 0
                    ? "var(--md-sys-color-primary-container)"
                    : "var(--md-sys-color-surface-container)",
                  color: inspectInfo && inspectInfo.fileCount > 0
                    ? "var(--md-sys-color-on-primary-container)"
                    : "var(--md-sys-color-on-surface-variant)",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon
                  name={inspectInfo && inspectInfo.fileCount > 0 ? "check_circle" : "info"}
                  size={16}
                  color={inspectInfo && inspectInfo.fileCount > 0 ? "var(--md-sys-color-primary)" : "var(--md-sys-color-outline)"}
                />
                {isInspecting ? (
                  <span>{t("customGame.inspectChecking")}</span>
                ) : inspectInfo && inspectInfo.fileCount > 0 ? (
                  <span>
                    {t("customGame.filesCountLabel", { count: inspectInfo.fileCount, size: formatBytes(inspectInfo.totalSizeBytes) })}
                  </span>
                ) : (
                  <span>{t("customGame.folderEmptyStatus")}</span>
                )}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>
              {t("customGame.gameExeLabel")}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={exePath}
                onChange={(e) => setExePath(e.target.value)}
                placeholder="—"
                style={{
                  flex: 1,
                  boxSizing: "border-box",
                  padding: "12px 16px",
                  borderRadius: 16,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1.5px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  fontFamily: "var(--font-family-mono)",
                  outline: "none",
                }}
              />
              <Button variant="tonal" size="md" pill icon="sports_esports" onClick={handlePickExe}>
                {t("customGame.chooseExe")}
              </Button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>
                {t("customGame.tagLabel")}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("customGame.tagPlaceholder")}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 16px",
                  borderRadius: 14,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1.5px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  {t("customGame.coverUrlLabel")}
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={handlePickLocalCover}
                    style={{
                      background: "var(--md-sys-color-surface-container-high)",
                      border: "1px solid var(--md-sys-color-outline-variant)",
                      color: "var(--md-sys-color-on-surface)",
                      borderRadius: 8,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Icon name="folder" size={14} />
                    {t("customGame.pickLocalCover")}
                  </button>
                  <button
                    type="button"
                    onClick={handleFindCover}
                    disabled={isSearchingCover || !name.trim()}
                    style={{
                      background: "var(--md-sys-color-surface-container-high)",
                      border: "1px solid var(--md-sys-color-outline-variant)",
                      color: "var(--md-sys-color-primary)",
                      borderRadius: 8,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Icon name="search" size={14} />
                    {isSearchingCover ? t("customGame.searchingCover") : t("customGame.findCoverButton")}
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 16px",
                  borderRadius: 14,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1.5px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
          <Button variant="tonal" size="md" pill onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="filled" size="md" pill icon="save" onClick={handleUpdate}>
            {t("customGame.saveChangesButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DeleteCustomGameModalProps {
  game: { id: string; name: string; savePath?: string | null };
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteCustomGameModal({ game, onClose, onConfirm }: DeleteCustomGameModalProps) {
  const { t } = useI18n();
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
          boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ExpressiveShape size={52} initialShape="sunny" fill="var(--md-sys-color-error)">
            <Icon name="delete" size={28} color="var(--md-sys-color-on-error)" />
          </ExpressiveShape>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800 }}>{t("customGame.deleteGameTitle")}</h3>
            <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)" }}>
              {game.name}
            </p>
          </div>
        </div>

        <div
          style={{
            background: "var(--md-sys-color-surface-container)",
            borderRadius: 18,
            padding: "16px 20px",
            fontSize: 13,
            lineHeight: 1.6,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ color: "var(--status-synced)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="verified_user" size={18} color="var(--status-synced)" />
            <span>{t("customGame.deleteGameSafety")}</span>
          </div>
          <p style={{ color: "var(--md-sys-color-on-surface-variant)", margin: 0 }}>
            {t("customGame.deleteGameDesc", { path: game.savePath || "disk" })}
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <Button variant="tonal" size="md" pill onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="filled"
            size="md"
            pill
            icon="delete"
            onClick={onConfirm}
            style={{
              background: "var(--md-sys-color-error)",
              color: "var(--md-sys-color-on-error)",
            }}
          >
            {t("customGame.deleteFromSavio")}
          </Button>
        </div>
      </div>
    </div>
  );
}
