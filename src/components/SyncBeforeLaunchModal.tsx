import { memo } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { useI18n } from "../i18n/I18nProvider";
import type { CloudBackupItem } from "../lib/tauri";

export interface GameLaunchItem {
  id: string;
  name: string;
  store?: string;
  savePath?: string | null;
  exePath?: string;
  coverUrl?: string | null;
  isCustom?: boolean;
}

interface SyncBeforeLaunchModalProps {
  game: GameLaunchItem;
  cloudBackup: CloudBackupItem;
  localLastModified: number;
  localSizeBytes: number;
  targetStorageName: string;
  onDownloadAndLaunch: () => void;
  onKeepLocalAndLaunch: () => void;
  onCancel: () => void;
  isRestoring?: boolean;
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

function formatRelativeDiff(secDiff: number, t: (k: string) => string): string {
  if (secDiff < 60) return `${Math.round(secDiff)} ${t("common.sec")}`;
  if (secDiff < 3600) return `${Math.round(secDiff / 60)} ${t("common.min")}`;
  if (secDiff < 86400) return `${(secDiff / 3600).toFixed(1)} ${t("common.hours")}`;
  return `${Math.round(secDiff / 86400)} ${t("common.days")}`;
}

export const SyncBeforeLaunchModal = memo(function SyncBeforeLaunchModal({
  game,
  cloudBackup,
  localLastModified,
  localSizeBytes,
  targetStorageName,
  onDownloadAndLaunch,
  onKeepLocalAndLaunch,
  onCancel,
  isRestoring = false,
}: SyncBeforeLaunchModalProps) {
  const { t, lang } = useI18n();
  const cloudSec = cloudBackup.modified || 0;
  const localSec = Math.floor(localLastModified / 1000);
  const diffSec = Math.max(0, cloudSec - localSec);

  const cloudDateStr = cloudSec > 0
    ? new Date(cloudSec * 1000).toLocaleString(lang, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const localDateStr = localLastModified > 0
    ? new Date(localLastModified).toLocaleString(lang, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 580,
          background: "var(--md-sys-color-surface-container-high)",
          borderRadius: 28,
          border: "1px solid var(--md-sys-color-outline-variant)",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.4)",
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              background: "var(--md-sys-color-primary-container)",
              color: "var(--md-sys-color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="sync_problem" size={24} color="var(--md-sys-color-primary)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "var(--md-sys-color-primary)",
                  color: "var(--md-sys-color-on-primary)",
                  letterSpacing: "0.5px",
                }}
              >
                Sync Before Launch
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)" }}>
                {game.name}
              </span>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--md-sys-color-on-surface)" }}>
              {t("syncBeforeLaunch.newerSaveDetected")}
            </h2>
          </div>
        </div>

        {/* Description Banner */}
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 16,
            background: "var(--md-sys-color-surface-container-highest)",
            fontSize: 13,
            color: "var(--md-sys-color-on-surface)",
            lineHeight: 1.5,
          }}
        >
          {t("syncBeforeLaunch.newerSaveDesc")}
        </div>

        {/* Comparison Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Cloud Version (Newer) */}
          <div
            style={{
              padding: "16px",
              borderRadius: 20,
              background: "var(--status-synced-container)",
              border: "2px solid var(--status-synced)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "var(--status-synced)" }}>
                <Icon name="cloud" size={16} color="var(--status-synced)" />
                <span>{t("syncBeforeLaunch.cloudStorage", { target: targetStorageName })}</span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  background: "var(--status-synced)",
                  color: "#FFFFFF",
                  padding: "2px 6px",
                  borderRadius: 6,
                }}
              >
                {t("syncBeforeLaunch.newerBadge", { diff: formatRelativeDiff(diffSec, t) })}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--md-sys-color-on-surface)" }}>
                {cloudDateStr}
              </div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                {t("syncBeforeLaunch.archiveSize", { size: formatBytes(cloudBackup.sizeBytes) })}
              </div>
            </div>
          </div>

          {/* Local Version (Older) */}
          <div
            style={{
              padding: "16px",
              borderRadius: 20,
              background: "var(--md-sys-color-surface-container)",
              border: "1px solid var(--md-sys-color-outline-variant)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)" }}>
                <Icon name="hard_drive" size={16} />
                <span>{t("syncBeforeLaunch.thisComputer")}</span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: "var(--md-sys-color-surface-container-highest)",
                  color: "var(--md-sys-color-outline)",
                  padding: "2px 6px",
                  borderRadius: 6,
                }}
              >
                {t("syncBeforeLaunch.localBadge")}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                {localDateStr}
              </div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                {t("syncBeforeLaunch.diskSize", { size: formatBytes(localSizeBytes) })}
              </div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          <Button
            variant="filled"
            size="md"
            pill
            icon="cloud_download"
            disabled={isRestoring}
            onClick={onDownloadAndLaunch}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {isRestoring ? t("syncBeforeLaunch.downloadingSave") : t("syncBeforeLaunch.downloadAndLaunch")}
          </Button>

          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="tonal"
              size="md"
              pill
              icon="play_arrow"
              disabled={isRestoring}
              onClick={onKeepLocalAndLaunch}
              style={{ flex: 1, justifyContent: "center" }}
            >
              {t("syncBeforeLaunch.keepLocalAndLaunch")}
            </Button>
            <Button
              variant="outlined"
              size="md"
              pill
              disabled={isRestoring}
              onClick={onCancel}
              style={{ justifyContent: "center" }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
