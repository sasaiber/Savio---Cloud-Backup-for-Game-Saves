import { useState, useEffect, memo } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { api, type DetectedGame } from "../lib/tauri";
import type { CustomGameDef } from "../state/settings";
import { useI18n } from "../i18n/I18nProvider";

export interface ExistingGameRef {
  name: string;
  installDir?: string | null;
  exePath?: string | null;
}

interface ScanPcGamesModalProps {
  onClose: () => void;
  onImportGames: (games: CustomGameDef[]) => void;
  existingGames?: ExistingGameRef[];
  existingGameNames?: string[];
}

export const ScanPcGamesModal = memo(function ScanPcGamesModal({
  onClose,
  onImportGames,
  existingGames,
  existingGameNames,
}: ScanPcGamesModalProps) {
  const { t } = useI18n();

  const [availableDrives, setAvailableDrives] = useState<string[]>([]);
  const [selectedDrives, setSelectedDrives] = useState<Set<string>>(new Set());
  const [customFolders, setCustomFolders] = useState<string[]>([]);

  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [foundGames, setFoundGames] = useState<DetectedGame[]>([]);
  const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
  const [coversMap, setCoversMap] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getAvailableDrives().then((drives) => {
      setAvailableDrives(drives);
      setSelectedDrives(new Set(drives));
    });
  }, []);

  const toggleDrive = (drive: string) => {
    setSelectedDrives((prev) => {
      const next = new Set(prev);
      if (next.has(drive)) {
        next.delete(drive);
      } else {
        next.add(drive);
      }
      return next;
    });
  };

  const handleAddCustomFolder = async () => {
    try {
      const folder = await api.pickFolder();
      if (folder && !customFolders.includes(folder)) {
        setCustomFolders((prev) => [...prev, folder]);
      }
    } catch (e) {
      console.warn("Folder picker failed:", e);
    }
  };

  const handleRemoveCustomFolder = (folder: string) => {
    setCustomFolders((prev) => prev.filter((f) => f !== folder));
  };

  const handleStartScan = async () => {
    setIsScanning(true);
    setHasScanned(false);
    try {
      const drivesList = Array.from(selectedDrives);
      const results = await api.scanPcGames(drivesList, customFolders);

      // Thorough duplicate prevention: match by normalized name, installDir, and exePath
      const normClean = (s: string) =>
        s.toLowerCase()
         .replace(/[\[\(].*?[\]\)]/g, "")
         .replace(/complete edition|remastered|definitive edition|game of the year|goty|enhanced edition|directors cut/gi, "")
         .replace(/[^a-z0-9а-я]/gi, "");

      const normPath = (p?: string | null) =>
        p ? p.toLowerCase().replace(/\\/g, "/").replace(/^\/\/\?\/|\/$/g, "") : "";

      const existingNamesList = [
        ...(existingGameNames || []),
        ...(existingGames || []).map((g) => g.name),
      ];

      const existingNormalizedNames = new Set(
        existingNamesList.map(normClean).filter(Boolean)
      );
      const existingDirs = new Set(
        (existingGames || []).map((g) => normPath(g.installDir)).filter(Boolean)
      );
      const existingExes = new Set(
        (existingGames || []).map((g) => normPath(g.exePath)).filter(Boolean)
      );

      const filtered = results.filter((g) => {
        const gNorm = normClean(g.name);
        if (gNorm && existingNormalizedNames.has(gNorm)) return false;

        const gDir = normPath(g.installDir);
        if (gDir && existingDirs.has(gDir)) return false;

        const gExe = normPath(g.exePath);
        if (gExe && existingExes.has(gExe)) return false;

        return true;
      });

      setFoundGames(filtered);
      // Select all found games by default
      setSelectedGameIds(new Set(filtered.map((g) => g.id)));
      setHasScanned(true);

      // Asynchronously fetch high-res covers in background
      filtered.forEach(async (g) => {
        try {
          const cover = await api.findGameCover(g.name);
          if (cover) {
            setCoversMap((prev) => ({ ...prev, [g.id]: cover }));
          }
        } catch {
          /* ignore */
        }
      });
    } catch (e) {
      console.error("Scan failed:", e);
    } finally {
      setIsScanning(false);
    }
  };

  const toggleGameSelect = (id: string) => {
    setSelectedGameIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedGameIds(new Set(foundGames.map((g) => g.id)));
  };

  const deselectAll = () => {
    setSelectedGameIds(new Set());
  };

  const handleImport = () => {
    const toImport: CustomGameDef[] = foundGames
      .filter((g) => selectedGameIds.has(g.id))
      .map((g, idx) => ({
        id: `custom_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        name: g.name,
        savePath: g.saveInfo?.primaryPath || "",
        exePath: g.exePath || undefined,
        coverUrl: coversMap[g.id] || g.coverUrl || undefined,
        notes: g.installDir ? `Installed: ${g.installDir}` : undefined,
        createdAt: Date.now(),
      }));

    onImportGames(toImport);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(10px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--md-sys-color-surface)",
          border: "1px solid var(--md-sys-color-outline-variant)",
          borderRadius: 28,
          width: "100%",
          maxWidth: 780,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 28px",
            borderBottom: "1px solid var(--md-sys-color-outline-variant)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: "var(--md-sys-color-primary-container)",
                color: "var(--md-sys-color-on-primary-container)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="search" size={24} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t("library.scanPcTitle")}</div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                {t("library.scanPcSubtitle")}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--md-sys-color-on-surface-variant)",
              cursor: "pointer",
              padding: 8,
              borderRadius: "50%",
              display: "flex",
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: "24px 28px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            flex: 1,
          }}
        >
          {!hasScanned && !isScanning && (
            <>
              {/* Drive Selection Section */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 10 }}>
                  {t("library.scanDrivesLabel")}
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {availableDrives.map((drive) => {
                    const isSelected = selectedDrives.has(drive);
                    return (
                      <div
                        key={drive}
                        onClick={() => toggleDrive(drive)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 16px",
                          borderRadius: 16,
                          background: isSelected
                            ? "var(--md-sys-color-primary-container)"
                            : "var(--md-sys-color-surface-container)",
                          border: `1.5px solid ${
                            isSelected
                              ? "var(--md-sys-color-primary)"
                              : "var(--md-sys-color-outline-variant)"
                          }`,
                          color: isSelected
                            ? "var(--md-sys-color-on-primary-container)"
                            : "var(--md-sys-color-on-surface)",
                          cursor: "pointer",
                          userSelect: "none",
                          fontWeight: 700,
                          fontSize: 13,
                          transition: "all 0.15s ease",
                        }}
                      >
                        <Icon name={isSelected ? "check_circle" : "hard_drive"} size={18} />
                        <span>{t("library.driveName", { drive })}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Folders Section */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <label style={{ fontSize: 13, fontWeight: 700 }}>
                    {t("library.scanCustomFoldersLabel")}
                  </label>
                  <Button
                    variant="tonal"
                    size="sm"
                    pill
                    icon="folder_open"
                    onClick={handleAddCustomFolder}
                  >
                    {t("library.addScanFolderButton")}
                  </Button>
                </div>

                {customFolders.length === 0 ? (
                  <div
                    style={{
                      padding: "16px 20px",
                      borderRadius: 16,
                      background: "var(--md-sys-color-surface-container)",
                      border: "1px dashed var(--md-sys-color-outline-variant)",
                      fontSize: 12,
                      color: "var(--md-sys-color-on-surface-variant)",
                      lineHeight: 1.5,
                    }}
                  >
                    {t("library.scanFoldersHint")}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {customFolders.map((f) => (
                      <div
                        key={f}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 14px",
                          borderRadius: 12,
                          background: "var(--md-sys-color-surface-container)",
                          border: "1px solid var(--md-sys-color-outline-variant)",
                          fontSize: 12,
                          fontFamily: "var(--font-family-mono)",
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomFolder(f)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--md-sys-color-error)",
                            cursor: "pointer",
                            padding: 4,
                          }}
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scan explanation */}
              <div
                style={{
                  padding: "14px 18px",
                  borderRadius: 16,
                  background: "var(--md-sys-color-surface-container-high)",
                  fontSize: 12,
                  color: "var(--md-sys-color-on-surface-variant)",
                  lineHeight: 1.5,
                }}
              >
                💡 {t("library.scanDescriptionTip")}
              </div>
            </>
          )}

          {isScanning && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 0",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  border: "4px solid var(--md-sys-color-surface-container-highest)",
                  borderTopColor: "var(--md-sys-color-primary)",
                  animation: "spin 1s linear infinite",
                }}
              />
              <div style={{ fontSize: 16, fontWeight: 700 }}>{t("library.scanningPcProgress")}</div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
                {t("library.scanningPcHint")}
              </div>
            </div>
          )}

          {hasScanned && !isScanning && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: 4,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {t("library.foundGamesCount", { count: foundGames.length })}
                </div>
                {foundGames.length > 0 && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={selectAll}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--md-sys-color-primary)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {t("library.selectAll")}
                    </button>
                    <span style={{ opacity: 0.4 }}>•</span>
                    <button
                      type="button"
                      onClick={deselectAll}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--md-sys-color-on-surface-variant)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {t("library.deselectAll")}
                    </button>
                  </div>
                )}
              </div>

              {foundGames.length === 0 ? (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    color: "var(--md-sys-color-on-surface-variant)",
                    fontSize: 13,
                  }}
                >
                  <Icon name="info" size={36} color="var(--md-sys-color-outline)" />
                  <div style={{ marginTop: 12, fontWeight: 700 }}>{t("library.noNewGamesFoundTitle")}</div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>{t("library.noNewGamesFoundDesc")}</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420 }}>
                  {foundGames.map((game) => {
                    const isChecked = selectedGameIds.has(game.id);
                    const cover = coversMap[game.id] || game.coverUrl;
                    const hasSaves = Boolean(game.saveInfo?.primaryPath);

                    return (
                      <div
                        key={game.id}
                        onClick={() => toggleGameSelect(game.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          padding: "12px 16px",
                          borderRadius: 16,
                          background: isChecked
                            ? "var(--md-sys-color-surface-container-high)"
                            : "var(--md-sys-color-surface-container)",
                          border: `1.5px solid ${
                            isChecked
                              ? "var(--md-sys-color-primary)"
                              : "var(--md-sys-color-outline-variant)"
                          }`,
                          cursor: "pointer",
                          userSelect: "none",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {/* Checkbox icon */}
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: `2px solid ${
                              isChecked
                                ? "var(--md-sys-color-primary)"
                                : "var(--md-sys-color-outline)"
                            }`,
                            background: isChecked
                              ? "var(--md-sys-color-primary)"
                              : "transparent",
                            color: "var(--md-sys-color-on-primary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {isChecked && <Icon name="check" size={16} />}
                        </div>

                        {/* Game poster thumbnail */}
                        <div
                          style={{
                            width: 44,
                            height: 60,
                            borderRadius: 8,
                            overflow: "hidden",
                            background: "var(--md-sys-color-surface-container-highest)",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {cover ? (
                            <img
                              src={cover}
                              alt={game.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <Icon name="sports_esports" size={22} color="var(--md-sys-color-outline)" />
                          )}
                        </div>

                        {/* Game details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {game.name}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--md-sys-color-on-surface-variant)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              marginTop: 2,
                            }}
                          >
                            {game.exePath || game.installDir}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                            {hasSaves ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "var(--status-synced)",
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                ✓ {t("library.savesDetectedLabel")}
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "var(--md-sys-color-outline)",
                                }}
                              >
                                {t("library.savesPendingLabel")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "16px 28px",
            borderTop: "1px solid var(--md-sys-color-outline-variant)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--md-sys-color-surface-container-lowest)",
          }}
        >
          <Button variant="outlined" size="md" pill onClick={onClose}>
            {t("common.cancel")}
          </Button>

          {!hasScanned ? (
            <Button
              variant="filled"
              size="md"
              pill
              icon="search"
              disabled={selectedDrives.size === 0 && customFolders.length === 0}
              onClick={handleStartScan}
            >
              {t("library.startScanButton")}
            </Button>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="tonal" size="md" pill onClick={() => setHasScanned(false)}>
                {t("library.reconfigureScan")}
              </Button>
              <Button
                variant="filled"
                size="md"
                pill
                icon="add"
                disabled={selectedGameIds.size === 0}
                onClick={handleImport}
              >
                {t("library.addSelectedGamesButton", { count: selectedGameIds.size })}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
