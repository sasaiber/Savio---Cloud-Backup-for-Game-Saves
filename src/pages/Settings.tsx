import { useState, useEffect } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { useSettings, type ColorStyle } from "../state/settings";
import { LANGUAGES, type Language } from "../i18n/languages";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { api } from "../lib/tauri";

export function Settings() {
  const { t } = useI18n();
  const { settings, update, factoryResetApp, accentColor, system } = useSettings();

  const [showResetModal, setShowResetModal] = useState(false);
  const [wipeSnapshots, setWipeSnapshots] = useState(true);
  const [wipeCache, setWipeCache] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  const [autostartStatus, setAutostartStatus] = useState<{ enabled: boolean; minimized: boolean }>({
    enabled: settings.autostartEnabled ?? false,
    minimized: settings.autostartMinimized ?? true,
  });

  useEffect(() => {
    api.getAutostartStatus().then((res) => {
      setAutostartStatus(res);
      update({ autostartEnabled: res.enabled, autostartMinimized: res.minimized });
    }).catch((e) => console.warn("Failed to get autostart status:", e));
  }, []);

  const handleToggleAutostart = async () => {
    const nextEnabled = !autostartStatus.enabled;
    try {
      await api.setAutostart(nextEnabled, autostartStatus.minimized);
      setAutostartStatus((prev) => ({ ...prev, enabled: nextEnabled }));
      update({ autostartEnabled: nextEnabled });
    } catch (e) {
      alert(t("settings.failedAutostart", { error: String(e) }));
    }
  };

  const handleToggleMinimized = async () => {
    const nextMinimized = !autostartStatus.minimized;
    try {
      if (autostartStatus.enabled) {
        await api.setAutostart(true, nextMinimized);
      }
      setAutostartStatus((prev) => ({ ...prev, minimized: nextMinimized }));
      update({ autostartMinimized: nextMinimized });
    } catch (e) {
      alert(t("settings.failedLaunchMode", { error: String(e) }));
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
      }}
    >
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.5px" }}>
          {t("settings.title")}
        </h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 760, paddingBottom: 40 }}>
        {/* Language Section */}
        <Card elevation="low" radius={28}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <Icon name="translate" size={24} color="var(--md-sys-color-primary)" />
            <div style={{ fontSize: 18, fontWeight: 800 }}>{t("settings.language")}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {LANGUAGES.map((lang) => {
              const selected = settings.language === lang.code;
              return (
                <Button
                  key={lang.code}
                  variant={selected ? "filled" : "outlined"}
                  icon={selected ? "check" : undefined}
                  onClick={() => update({ language: lang.code as Language })}
                >
                  {lang.nativeName}
                </Button>
              );
            })}
          </div>
        </Card>

        {/* Appearance Section */}
        <Card elevation="low" radius={28}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <Icon name="palette" size={24} color="var(--md-sys-color-primary)" />
            <div style={{ fontSize: 18, fontWeight: 800 }}>{t("settings.appearance")}</div>
          </div>

          {/* Theme Mode */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--md-sys-color-primary)" }}>
              {t("settings.theme")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {/* System Option */}
              <button
                type="button"
                onClick={() => update({ theme: "system" })}
                className="m3-btn"
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: 16,
                  borderRadius: 20,
                  cursor: "pointer",
                  border:
                    settings.theme === "system"
                      ? "2.5px solid var(--md-sys-color-primary)"
                      : "1.5px solid var(--md-sys-color-outline-variant)",
                  background: "var(--md-sys-color-surface-container)",
                  boxShadow: settings.theme === "system" ? "0 4px 16px var(--md-sys-color-shadow)" : "none",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: 52,
                    borderRadius: 12,
                    background: "linear-gradient(135deg, #FFFFFF 50%, #0B0F14 50%)",
                    border: "1px solid rgba(128,128,128,0.3)",
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(0,0,0,0.65)",
                      color: "#FFFFFF",
                      borderRadius: 9999,
                      padding: 6,
                      display: "flex",
                    }}
                  >
                    <Icon name="brightness_auto" size={20} />
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.themeSystem")}
                </div>
                <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                  Windows 11
                </div>
              </button>

              {/* Light Option (Pure White #FFFFFF) */}
              <button
                type="button"
                onClick={() => update({ theme: "light" })}
                className="m3-btn"
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: 16,
                  borderRadius: 20,
                  cursor: "pointer",
                  border:
                    settings.theme === "light"
                      ? "2.5px solid var(--md-sys-color-primary)"
                      : "1.5px solid var(--md-sys-color-outline-variant)",
                  background: "var(--md-sys-color-surface-container)",
                  boxShadow: settings.theme === "light" ? "0 4px 16px var(--md-sys-color-shadow)" : "none",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: 52,
                    borderRadius: 12,
                    background: "#FFFFFF",
                    border: "1px solid #CBD5E1",
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                  }}
                >
                  <Icon name="light_mode" size={26} color="#F59E0B" />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.themeLight")}
                </div>
                <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                  {t("common.whiteTheme")}
                </div>
              </button>

              {/* Dark Option (Deep Obsidian #0B0F14) */}
              <button
                type="button"
                onClick={() => update({ theme: "dark" })}
                className="m3-btn"
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: 16,
                  borderRadius: 20,
                  cursor: "pointer",
                  border:
                    settings.theme === "dark"
                      ? "2.5px solid var(--md-sys-color-primary)"
                      : "1.5px solid var(--md-sys-color-outline-variant)",
                  background: "var(--md-sys-color-surface-container)",
                  boxShadow: settings.theme === "dark" ? "0 4px 16px var(--md-sys-color-shadow)" : "none",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: 52,
                    borderRadius: 12,
                    background: "#0B0F14",
                    border: "1px solid #334155",
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                  }}
                >
                  <Icon name="dark_mode" size={26} color="#60A5FA" />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.themeDark")}
                </div>
                <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                  {t("common.darkTheme")}
                </div>
              </button>
            </div>
          </div>

          {/* Color Source */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--md-sys-color-on-surface-variant)" }}>
              {t("settings.colorSource")}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <Button
                variant={settings.colorSource === "windows" ? "filled" : "outlined"}
                icon="contrast"
                onClick={() => update({ colorSource: "windows" })}
                style={{ flex: 1 }}
              >
                {t("settings.colorWindows")} {accentColor ? `(${accentColor})` : ""}
              </Button>
              <Button
                variant={settings.colorSource === "custom" ? "filled" : "outlined"}
                icon="palette"
                onClick={() => update({ colorSource: "custom" })}
                style={{ flex: 1 }}
              >
                {t("settings.colorCustom")}
              </Button>
            </div>
            {settings.colorSource === "windows" && (
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginTop: 8 }}>
                {t("settings.colorWindowsHint")}
              </div>
            )}
            {settings.colorSource === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <input
                  type="color"
                  value={settings.customColor}
                  onChange={(e) => update({ customColor: e.target.value })}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-family-mono)" }}>
                  {settings.customColor}
                </span>
              </div>
            )}
          </div>

          {/* Color Style */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--md-sys-color-on-surface-variant)" }}>
              {t("settings.colorStyle")}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {(
                [
                  { id: "tonal", labelKey: "settings.styleTonal" },
                  { id: "vibrant", labelKey: "settings.styleVibrant" },
                  { id: "expressive", labelKey: "settings.styleExpressive" },
                ] as const
              ).map((s) => {
                const selected = settings.colorStyle === s.id;
                return (
                  <Button
                    key={s.id}
                    variant={selected ? "filled" : "outlined"}
                    onClick={() => update({ colorStyle: s.id as ColorStyle })}
                    style={{ flex: 1 }}
                  >
                    {t(s.labelKey)}
                  </Button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Windows Autostart & Tray Section */}
        <Card elevation="low" radius={28}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <Icon name="bolt" size={24} color="var(--md-sys-color-primary)" />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t("settings.autostartTitle")}</div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                {t("settings.autostartDesc")}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Run with Windows Toggle */}
            <div
              onClick={handleToggleAutostart}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: 16,
                background: "var(--md-sys-color-surface-container)",
                cursor: "pointer",
                border: "1px solid var(--md-sys-color-outline-variant)",
                userSelect: "none",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginRight: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.autostartLabel")}
                </div>
                <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.4 }}>
                  {t("settings.autostartHint")}
                </div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 13,
                  background: autostartStatus.enabled
                    ? "var(--md-sys-color-primary)"
                    : "var(--md-sys-color-surface-container-highest)",
                  position: "relative",
                  transition: "background 0.2s ease",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: autostartStatus.enabled
                      ? "var(--md-sys-color-on-primary)"
                      : "var(--md-sys-color-outline)",
                    position: "absolute",
                    top: 3,
                    left: autostartStatus.enabled ? 21 : 3,
                    transition: "left 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
              </div>
            </div>

            {/* Run Minimized into Tray Toggle (visible when autostart enabled) */}
            <div
              onClick={handleToggleMinimized}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: 16,
                background: "var(--md-sys-color-surface-container)",
                cursor: "pointer",
                border: "1px solid var(--md-sys-color-outline-variant)",
                userSelect: "none",
                opacity: autostartStatus.enabled ? 1 : 0.6,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginRight: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.autostartMinimizedLabel")}
                </div>
                <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.4 }}>
                  {t("settings.autostartMinimizedHint")}
                </div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 13,
                  background: autostartStatus.minimized
                    ? "var(--md-sys-color-primary)"
                    : "var(--md-sys-color-surface-container-highest)",
                  position: "relative",
                  transition: "background 0.2s ease",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: autostartStatus.minimized
                      ? "var(--md-sys-color-on-primary)"
                      : "var(--md-sys-color-outline)",
                    position: "absolute",
                    top: 3,
                    left: autostartStatus.minimized ? 21 : 3,
                    transition: "left 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Save Rotation & Smart Sync Section */}
        <Card elevation="low" radius={28}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <Icon name="history" size={24} color="var(--md-sys-color-primary)" />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t("settings.retentionTitle")}</div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                {t("settings.retentionDesc")}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Sync Before Launch (P1) */}
            <div
              onClick={() => update({ syncBeforeLaunch: !settings.syncBeforeLaunch })}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: 16,
                background: "var(--md-sys-color-surface-container)",
                cursor: "pointer",
                border: "1px solid var(--md-sys-color-outline-variant)",
                userSelect: "none",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginRight: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.syncBeforeLaunchTitle")}
                </div>
                <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.4 }}>
                  {t("settings.syncBeforeLaunchDesc")}
                </div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 13,
                  background: settings.syncBeforeLaunch
                    ? "var(--md-sys-color-primary)"
                    : "var(--md-sys-color-surface-container-highest)",
                  position: "relative",
                  transition: "background 0.2s ease",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: settings.syncBeforeLaunch
                      ? "var(--md-sys-color-on-primary)"
                      : "var(--md-sys-color-outline)",
                    position: "absolute",
                    top: 3,
                    left: settings.syncBeforeLaunch ? 21 : 3,
                    transition: "left 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
              </div>
            </div>

            {/* Corruption Guard (P1) */}
            <div
              onClick={() => update({ corruptionGuardEnabled: !settings.corruptionGuardEnabled })}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: 16,
                background: "var(--md-sys-color-surface-container)",
                cursor: "pointer",
                border: "1px solid var(--md-sys-color-outline-variant)",
                userSelect: "none",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginRight: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.corruptionGuardTitle")}
                </div>
                <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.4 }}>
                  {t("settings.corruptionGuardDesc")}
                </div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 13,
                  background: settings.corruptionGuardEnabled
                    ? "var(--md-sys-color-primary)"
                    : "var(--md-sys-color-surface-container-highest)",
                  position: "relative",
                  transition: "background 0.2s ease",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: settings.corruptionGuardEnabled
                      ? "var(--md-sys-color-on-primary)"
                      : "var(--md-sys-color-outline)",
                    position: "absolute",
                    top: 3,
                    left: settings.corruptionGuardEnabled ? 21 : 3,
                    transition: "left 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
              </div>
            </div>
            {/* Skip Unchanged Saves (Steam Cloud style) */}
            <div
              onClick={() => update({ skipUnchangedSaves: !settings.skipUnchangedSaves })}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: 16,
                background: "var(--md-sys-color-surface-container)",
                cursor: "pointer",
                border: "1px solid var(--md-sys-color-outline-variant)",
                userSelect: "none",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginRight: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.skipUnchangedTitle")}
                </div>
                <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.4 }}>
                  {t("settings.skipUnchangedDesc")}
                </div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 13,
                  background: settings.skipUnchangedSaves
                    ? "var(--md-sys-color-primary)"
                    : "var(--md-sys-color-surface-container-highest)",
                  position: "relative",
                  transition: "background 0.2s ease",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: settings.skipUnchangedSaves
                      ? "var(--md-sys-color-on-primary)"
                      : "var(--md-sys-color-outline)",
                    position: "absolute",
                    top: 3,
                    left: settings.skipUnchangedSaves ? 21 : 3,
                    transition: "left 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
              </div>
            </div>

            {/* Cloud Retention Limit */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.cloudRetentionLimit")}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--md-sys-color-primary)" }}>
                  {settings.cloudRetentionLimit === 0 ? t("settings.unlimited") : t("settings.copiesCount", { count: settings.cloudRetentionLimit })}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginBottom: 10, lineHeight: 1.4 }}>
                {t("settings.cloudRetentionDesc")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {[
                  { value: 3, label: "3" },
                  { value: 5, label: `5 ${t("settings.rec")}` },
                  { value: 10, label: "10" },
                  { value: 20, label: "20" },
                  { value: 0, label: t("settings.all") },
                ].map((opt) => {
                  const selected = (settings.cloudRetentionLimit ?? 5) === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      variant={selected ? "filled" : "outlined"}
                      size="sm"
                      onClick={() => update({ cloudRetentionLimit: opt.value })}
                      style={{ fontSize: 12, padding: "0 8px" }}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Local Retention Limit */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.localRetentionLimit")}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--md-sys-color-primary)" }}>
                  {settings.localRetentionLimit === 0 ? t("settings.unlimited") : t("settings.snapshotsCount", { count: settings.localRetentionLimit })}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginBottom: 10, lineHeight: 1.4 }}>
                {t("settings.localRetentionDesc")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {[
                  { value: 5, label: "5" },
                  { value: 10, label: `10 ${t("settings.rec")}` },
                  { value: 25, label: "25" },
                  { value: 50, label: "50" },
                  { value: 0, label: t("settings.all") },
                ].map((opt) => {
                  const selected = (settings.localRetentionLimit ?? 10) === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      variant={selected ? "filled" : "outlined"}
                      size="sm"
                      onClick={() => update({ localRetentionLimit: opt.value })}
                      style={{ fontSize: 12, padding: "0 8px" }}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* Covers & Metadata Section */}
        <Card elevation="low" radius={28}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <Icon name="palette" size={24} color="var(--md-sys-color-primary)" />
            <div style={{ fontSize: 18, fontWeight: 800 }}>{t("settings.coversSectionTitle")}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.5 }}>
              {t("settings.coversSectionDesc")}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", display: "block", marginBottom: 6 }}>
                {t("settings.steamGridDbKeyLabel")}
              </label>
              <input
                type="text"
                value={settings.steamGridDbApiKey || ""}
                onChange={(e) => update({ steamGridDbApiKey: e.target.value })}
                placeholder="SGDB API Key (e.g. 5f8a...)"
                style={{
                  width: "100%",
                  padding: "8px 14px",
                  borderRadius: 12,
                  background: "var(--md-sys-color-surface-container)",
                  border: "1px solid var(--md-sys-color-outline-variant)",
                  color: "var(--md-sys-color-on-surface)",
                  fontSize: 13,
                  fontFamily: "var(--font-family-mono)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)", marginTop: 4, opacity: 0.8 }}>
                {t("settings.steamGridDbKeyHint")}
              </div>
            </div>
          </div>
        </Card>

        {/* Data & Storage Section */}
        <Card elevation="low" radius={28}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <Icon name="hard_drive" size={24} color="var(--md-sys-color-primary)" />
            <div style={{ fontSize: 18, fontWeight: 800 }}>{t("settings.about")}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "var(--md-sys-color-on-surface-variant)" }}>
                {t("settings.version")}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{system.version} (Stage 1)</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "var(--md-sys-color-on-surface-variant)" }}>
                {t("settings.mode")}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  background: system.portable
                    ? "var(--md-sys-color-tertiary-container)"
                    : "var(--md-sys-color-secondary-container)",
                  color: system.portable
                    ? "var(--md-sys-color-on-tertiary-container)"
                    : "var(--md-sys-color-on-secondary-container)",
                }}
              >
                {system.portable ? t("settings.modePortable") : t("settings.modeInstalled")}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 14, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {t("settings.dataFolder")}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--font-family-mono)",
                    color: "var(--md-sys-color-on-surface)",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    marginTop: 2,
                  }}
                  title={system.dataDir}
                >
                  {system.dataDir}
                </div>
              </div>
              <Button
                variant="outlined"
                size="sm"
                icon="folder_open"
                onClick={() => api.openDataFolder().catch(() => alert(system.dataDir))}
              >
                {t("settings.openFolder")}
              </Button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "var(--md-sys-color-on-surface-variant)" }}>
                {t("settings.license")}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.licenseText")}</span>
            </div>
          </div>

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--md-sys-color-outline-variant)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.showWelcome")}
                </div>
                <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {t("settings.resetWelcomeHint")}
                </div>
              </div>
              <Button
                variant="outlined"
                icon="restart_alt"
                onClick={() => update({ onboardingDone: false })}
              >
                {t("settings.resetWelcomeButton")}
              </Button>
            </div>
          </div>
        </Card>

        {/* Danger Zone: Factory Reset */}
        <Card
          elevation="low"
          radius={24}
          style={{
            padding: 24,
            border: "1.5px solid var(--md-sys-color-error-container)",
            background: "var(--md-sys-color-surface-container-low)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: "var(--md-sys-color-error-container)",
                  color: "var(--md-sys-color-error)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="delete" size={24} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--md-sys-color-on-surface)" }}>
                  {t("settings.dangerZoneTitle")}
                </div>
                <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                  {t("settings.dangerZoneDesc")}
                </div>
              </div>
            </div>

            <Button
              variant="filled"
              icon="delete"
              style={{
                background: "var(--md-sys-color-error)",
                color: "var(--md-sys-color-on-error)",
              }}
              onClick={() => setShowResetModal(true)}
            >
              {t("settings.resetAppButton")}
            </Button>
          </div>
        </Card>

        {/* Factory Reset Confirmation Modal */}
        {showResetModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
            onClick={() => !isResetting && setShowResetModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 520,
                background: "var(--md-sys-color-surface-container-high)",
                borderRadius: 28,
                border: "1.5px solid var(--md-sys-color-error)",
                boxShadow: "0 24px 48px rgba(0, 0, 0, 0.5)",
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
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    background: "var(--md-sys-color-error-container)",
                    color: "var(--md-sys-color-error)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name="error" size={28} />
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--md-sys-color-on-surface)" }}>
                    {t("settings.confirmResetTitle")}
                  </h2>
                  <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", marginTop: 4, lineHeight: 1.4 }}>
                    {t("settings.confirmResetDesc")}
                  </p>
                </div>
              </div>

              {/* Options */}
              <div
                style={{
                  background: "var(--md-sys-color-surface-container)",
                  borderRadius: 16,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: isResetting ? "not-allowed" : "pointer",
                    fontSize: 14,
                    color: "var(--md-sys-color-on-surface)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={wipeSnapshots}
                    disabled={isResetting}
                    onChange={(e) => setWipeSnapshots(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "var(--md-sys-color-error)", cursor: "pointer" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{t("settings.wipeSnapshotsLabel")}</div>
                    <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
                      {t("settings.wipeSnapshotsHint")} {system.dataDir}\snapshots
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: isResetting ? "not-allowed" : "pointer",
                    fontSize: 14,
                    color: "var(--md-sys-color-on-surface)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={wipeCache}
                    disabled={isResetting}
                    onChange={(e) => setWipeCache(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "var(--md-sys-color-error)", cursor: "pointer" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{t("settings.wipeCacheLabel")}</div>
                    <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
                      {t("settings.wipeCacheHint")}
                    </div>
                  </div>
                </label>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "var(--md-sys-color-error)",
                  background: "var(--md-sys-color-error-container)",
                  padding: "10px 14px",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="error" size={16} />
                <span>{t("settings.resetWarningText")}</span>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
                <Button
                  variant="outlined"
                  disabled={isResetting}
                  onClick={() => setShowResetModal(false)}
                >
                  {t("common.cancel")}
                </Button>

                <Button
                  variant="filled"
                  icon={isResetting ? "sync" : "delete"}
                  disabled={isResetting}
                  style={{
                    background: "var(--md-sys-color-error)",
                    color: "var(--md-sys-color-on-error)",
                  }}
                  onClick={async () => {
                    setIsResetting(true);
                    try {
                      await factoryResetApp(wipeSnapshots, wipeCache);
                    } catch (e) {
                      alert(t("settings.resetError", { error: String(e) }));
                      setIsResetting(false);
                    }
                  }}
                >
                  {isResetting ? t("settings.resettingProgress") : t("settings.confirmResetButton")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
