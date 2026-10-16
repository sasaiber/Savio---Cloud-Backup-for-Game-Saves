import { useState, useEffect, memo } from "react";
import { listen } from "@tauri-apps/api/event";
import { Icon } from "./Icon";
import { useI18n } from "../i18n/I18nProvider";
import type { SyncProgressPayload } from "../lib/tauri";

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes === 0) return "";
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

interface ActiveNotification extends SyncProgressPayload {
  id: string;
}

export function notifySyncProgress(payload: SyncProgressPayload) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("savio:sync-progress", { detail: payload }));
  }
}

export const LiveSyncNotifier = memo(function LiveSyncNotifier() {
  const { t } = useI18n();
  const [currentNotification, setCurrentNotification] = useState<ActiveNotification | null>(null);
  const [history, setHistory] = useState<ActiveNotification[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let timer: any = null;

    const handlePayload = (payload: SyncProgressPayload) => {
      const notif: ActiveNotification = {
        ...payload,
        id: `${payload.gameId}_${Date.now()}_${Math.random()}`,
      };

      setCurrentNotification(notif);
      setHistory((prev) => [notif, ...prev.filter((p) => p.gameId !== notif.gameId || p.status !== notif.status).slice(0, 9)]);

      if (timer) clearTimeout(timer);

      // Auto-dismiss after timeout if completed or skipped
      if (payload.status === "success") {
        timer = setTimeout(() => {
          setCurrentNotification(null);
        }, 5500);
      } else if (payload.status === "skipped") {
        timer = setTimeout(() => {
          setCurrentNotification(null);
        }, 4000);
      } else if (payload.status === "error") {
        timer = setTimeout(() => {
          setCurrentNotification(null);
        }, 8000);
      }
    };

    const unlistenPromise = listen<SyncProgressPayload>("savio://sync-progress", (event) => {
      handlePayload(event.payload);
    });

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<SyncProgressPayload>;
      if (customEvent.detail) {
        handlePayload(customEvent.detail);
      }
    };

    window.addEventListener("savio:sync-progress", handleCustomEvent);

    return () => {
      if (timer) clearTimeout(timer);
      unlistenPromise.then((u) => u());
      window.removeEventListener("savio:sync-progress", handleCustomEvent);
    };
  }, []);

  if (!currentNotification && !showHistory) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        maxWidth: 420,
        pointerEvents: "auto",
        fontFamily: "inherit",
      }}
    >
      {/* History Drawer Modal/Popup */}
      {showHistory && (
        <div
          style={{
            width: 380,
            maxHeight: 280,
            overflowY: "auto",
            background: "var(--md-sys-color-surface-container-high)",
            borderRadius: 20,
            border: "1px solid var(--md-sys-color-outline-variant)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
              {t("liveSync.historyTitle")}
            </span>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--md-sys-color-on-surface-variant)",
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>
          {history.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
              {t("liveSync.noEventsYet")}
            </div>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                style={{
                  fontSize: 12,
                  padding: "8px 10px",
                  borderRadius: 12,
                  background: "var(--md-sys-color-surface-container)",
                  borderLeft: `3px solid ${
                    h.status === "success"
                      ? "var(--status-synced)"
                      : h.status === "error"
                      ? "var(--md-sys-color-error)"
                      : h.status === "skipped"
                      ? "#38BDF8"
                      : "var(--md-sys-color-primary)"
                  }`,
                }}
              >
                <div style={{ fontWeight: 700 }}>{h.gameName}</div>
                <div style={{ color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>{h.message}</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Main LIVE Notification Banner */}
      {currentNotification && (
        <div
          style={{
            width: "100%",
            background: "var(--md-sys-color-surface-container-high)",
            borderRadius: 22,
            border: `1.5px solid ${
              currentNotification.status === "syncing"
                ? "var(--md-sys-color-primary)"
                : currentNotification.status === "success"
                ? "var(--status-synced)"
                : currentNotification.status === "error"
                ? "var(--md-sys-color-error)"
                : "var(--md-sys-color-outline-variant)"
            }`,
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            backdropFilter: "blur(12px)",
            animation: "fadeIn 0.25s ease-out",
          }}
        >
          {/* Header Row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {currentNotification.status === "syncing" ? (
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 14,
                    border: "2.5px solid var(--md-sys-color-primary)",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              ) : currentNotification.status === "success" ? (
                <span style={{ color: "var(--status-synced)", fontSize: 16 }}>✓</span>
              ) : currentNotification.status === "skipped" ? (
                <Icon name="check_circle" size={16} color="#38BDF8" />
              ) : (
                <Icon name="sync_problem" size={16} color="var(--md-sys-color-error)" />
              )}

              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--md-sys-color-on-surface)" }}>
                {currentNotification.status === "syncing"
                  ? t("liveSync.syncLive")
                  : currentNotification.status === "success"
                  ? t("liveSync.synced")
                  : currentNotification.status === "skipped"
                  ? t("liveSync.savesUpToDate")
                  : t("liveSync.syncError")}
              </span>

              {currentNotification.cloudTarget && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: 9999,
                    background: "var(--status-synced-container)",
                    color: "var(--status-synced)",
                    textTransform: "uppercase",
                  }}
                >
                  {currentNotification.cloudTarget}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                title={t("liveSync.historyTitle")}
                onClick={() => setShowHistory((prev) => !prev)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--md-sys-color-on-surface-variant)",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Icon name="history" size={16} />
              </button>
              <button
                type="button"
                title={t("liveSync.hide")}
                onClick={() => setCurrentNotification(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--md-sys-color-on-surface-variant)",
                  fontSize: 16,
                  padding: 2,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Details */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
            {currentNotification.gameName}
          </div>

          <div
            style={{
              fontSize: 12,
              color: "var(--md-sys-color-on-surface-variant)",
              lineHeight: 1.4,
              wordBreak: "break-word",
            }}
          >
            {currentNotification.message}
            {currentNotification.sizeBytes ? ` (${formatBytes(currentNotification.sizeBytes)})` : ""}
          </div>

          {/* Progress Bar Line */}
          {currentNotification.status === "syncing" && (
            <div
              style={{
                height: 3,
                width: "100%",
                background: "var(--md-sys-color-outline-variant)",
                borderRadius: 9999,
                overflow: "hidden",
                marginTop: 2,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "50%",
                  background: "var(--md-sys-color-primary)",
                  borderRadius: 9999,
                  animation: "liveProgressPulse 1.2s ease-in-out infinite alternate",
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
});
