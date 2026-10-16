import { memo, useEffect, useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { SavioLogo } from "./SavioLogo";
import { useI18n } from "../i18n/I18nProvider";
import { useSettings, type UpdateCheckInterval } from "../state/settings";
import { checkForAppUpdates, openReleasePage, type UpdateInfo, APP_VERSION } from "../lib/updater";

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  cachedUpdateInfo?: UpdateInfo | null;
  onUpdateInfoChanged?: (info: UpdateInfo | null) => void;
}

export const UpdateModal = memo(function UpdateModal({
  isOpen,
  onClose,
  cachedUpdateInfo,
  onUpdateInfoChanged,
}: UpdateModalProps) {
  const { t } = useI18n();
  const { settings, update } = useSettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<UpdateInfo | null>(cachedUpdateInfo || null);

  const performCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await checkForAppUpdates(APP_VERSION);
      setInfo(res);
      onUpdateInfoChanged?.(res);
      update({ lastUpdateCheckTime: Date.now() });
    } catch (err: any) {
      setError(err?.message || "Failed to check for updates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !info && !loading) {
      performCheck();
    }
  }, [isOpen]);

  useEffect(() => {
    if (cachedUpdateInfo) {
      setInfo(cachedUpdateInfo);
    }
  }, [cachedUpdateInfo]);

  if (!isOpen) return null;

  const intervals: { id: UpdateCheckInterval; labelKey: string }[] = [
    { id: "manual", labelKey: "updater.intervalManual" },
    { id: "3days", labelKey: "updater.interval3Days" },
    { id: "weekly", labelKey: "updater.intervalWeekly" },
  ];

  const formatLastChecked = (timestamp: number) => {
    if (!timestamp) return t("updater.neverChecked");
    try {
      return new Date(timestamp).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return t("updater.neverChecked");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="m3-dialog-surface"
        style={{
          width: "100%",
          maxWidth: 580,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 28,
          background: "var(--md-sys-color-surface-container-high)",
          border: "1px solid var(--md-sys-color-outline-variant)",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--md-sys-color-outline-variant)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: "linear-gradient(135deg, var(--md-sys-color-primary) 0%, var(--md-sys-color-tertiary) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px var(--md-sys-color-shadow)",
                flexShrink: 0,
              }}
            >
              <SavioLogo size={28} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.2px" }}>
                {t("updater.title")}
              </div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
                {t("updater.subtitle")}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="m3-icon-btn"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--md-sys-color-surface-container-highest)",
              color: "var(--md-sys-color-on-surface-variant)",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Body content */}
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {/* Version Overview Card */}
          <div
            style={{
              padding: "16px 18px",
              borderRadius: 20,
              background: "var(--md-sys-color-surface-container)",
              border: "1px solid var(--md-sys-color-outline-variant)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", fontWeight: 600 }}>
                {t("updater.currentVersion")}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--md-sys-color-primary)", marginTop: 2 }}>
                v{APP_VERSION}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", fontWeight: 600 }}>
                {t("updater.latestVersion")}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--md-sys-color-on-surface)", marginTop: 2 }}>
                {info ? `v${info.latestVersion}` : "..."}
              </div>
            </div>
          </div>

          {/* Status Message / State */}
          {loading ? (
            <div
              style={{
                padding: "24px 20px",
                borderRadius: 20,
                background: "var(--md-sys-color-surface-container-lowest)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                border: "1px solid var(--md-sys-color-outline-variant)",
              }}
            >
              <div className="m3-spinner" style={{ width: 28, height: 28, border: "3px solid var(--md-sys-color-primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--md-sys-color-on-surface-variant)" }}>
                {t("updater.checking")}
              </div>
            </div>
          ) : error ? (
            <div
              style={{
                padding: "16px 18px",
                borderRadius: 20,
                background: "var(--md-sys-color-error-container)",
                color: "var(--md-sys-color-on-error-container)",
                border: "1px solid var(--md-sys-color-outline-variant)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Icon name="error" size={24} />
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
                {t("updater.errorChecking", { error })}
              </div>
              <Button variant="tonal" size="sm" onClick={performCheck}>
                {t("common.retry")}
              </Button>
            </div>
          ) : info && info.hasUpdate ? (
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 20,
                background: "linear-gradient(135deg, rgba(229, 57, 53, 0.12) 0%, rgba(255, 138, 101, 0.12) 100%)",
                border: "1.5px solid var(--md-sys-color-primary)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 9999,
                      background: "var(--md-sys-color-primary)",
                      color: "var(--md-sys-color-on-primary)",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {t("updater.badgeUpdate")}
                  </span>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--md-sys-color-on-surface)" }}>
                    {t("updater.updateAvailable", { version: `v${info.latestVersion}` })}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.4 }}>
                {t("updater.updateAvailableDesc")}
              </div>

              {/* Release Notes Preview */}
              {info.releaseNotes && (
                <div
                  style={{
                    maxHeight: 140,
                    overflowY: "auto",
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: "var(--md-sys-color-surface-container-lowest)",
                    border: "1px solid var(--md-sys-color-outline-variant)",
                    fontSize: 12,
                    color: "var(--md-sys-color-on-surface)",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--md-sys-color-primary)" }}>
                    {t("updater.releaseNotes")}
                  </div>
                  {info.releaseNotes}
                </div>
              )}

              {/* Direct Download Actions */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                {info.zipDownloadUrl && (
                  <Button
                    variant="filled"
                    size="sm"
                    icon="cloud_download"
                    onClick={() => openReleasePage(info.zipDownloadUrl!)}
                  >
                    {t("updater.downloadZip")}
                  </Button>
                )}
                {info.exeDownloadUrl && (
                  <Button
                    variant="tonal"
                    size="sm"
                    icon="cloud_download"
                    onClick={() => openReleasePage(info.exeDownloadUrl!)}
                  >
                    {t("updater.downloadExe")}
                  </Button>
                )}
                <Button
                  variant="outlined"
                  size="sm"
                  icon="folder_open"
                  onClick={() => openReleasePage(info.htmlUrl)}
                >
                  {t("updater.viewOnGithub")}
                </Button>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 20,
                background: "var(--md-sys-color-surface-container)",
                border: "1px solid var(--md-sys-color-outline-variant)",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  background: "rgba(52, 199, 89, 0.15)",
                  color: "#34C759",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="check_circle" size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("updater.upToDate")}
                </div>
                <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                  {t("updater.upToDateDesc")}
                </div>
              </div>
              <Button
                variant="outlined"
                size="sm"
                icon="folder_open"
                onClick={() => openReleasePage(info?.htmlUrl || `https://github.com/sasaiber/Savio---Cloud-Backup-for-Game-Saves/releases`)}
              >
                {t("updater.viewOnGithub")}
              </Button>
            </div>
          )}

          {/* Auto-check Interval Configuration */}
          <div
            style={{
              padding: "16px 18px",
              borderRadius: 20,
              background: "var(--md-sys-color-surface-container)",
              border: "1px solid var(--md-sys-color-outline-variant)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                {t("updater.autoCheckTitle")}
              </div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                {t("updater.autoCheckDesc")}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {intervals.map((int) => {
                const isSelected = settings.updateCheckInterval === int.id;
                return (
                  <button
                    key={int.id}
                    type="button"
                    onClick={() => update({ updateCheckInterval: int.id })}
                    className="m3-btn"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: isSelected
                        ? "1.5px solid var(--md-sys-color-primary)"
                        : "1px solid var(--md-sys-color-outline-variant)",
                      background: isSelected
                        ? "var(--md-sys-color-primary-container)"
                        : "var(--md-sys-color-surface-container-high)",
                      color: isSelected
                        ? "var(--md-sys-color-on-primary-container)"
                        : "var(--md-sys-color-on-surface-variant)",
                      fontWeight: isSelected ? 800 : 500,
                      fontSize: 12,
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {t(int.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--md-sys-color-outline-variant)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--md-sys-color-surface-container)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" }}>
            {t("updater.lastChecked", { time: formatLastChecked(settings.lastUpdateCheckTime) })}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Button
              variant="tonal"
              size="sm"
              icon="sync"
              disabled={loading}
              onClick={performCheck}
            >
              {loading ? t("updater.checking") : t("updater.checkNow")}
            </Button>
            <Button variant="filled" size="sm" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
