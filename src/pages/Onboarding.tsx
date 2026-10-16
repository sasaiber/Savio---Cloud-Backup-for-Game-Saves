import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useI18n } from "../i18n/I18nProvider";
import { useSettings, getStorageStatus } from "../state/settings";
import { LANGUAGES, type Language } from "../i18n/languages";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Icon, type IconName } from "../components/Icon";
import { SavioLogo } from "../components/SavioLogo";
import { ExpressiveShape } from "../components/ExpressiveShape";
import { springs } from "../theme/motion";
import { api } from "../lib/tauri";

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const { t } = useI18n();
  const { settings, update, accentColor, system } = useSettings();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isConnectingGdrive, setIsConnectingGdrive] = useState(false);

  const storageStatus = getStorageStatus(settings);
  const isConfigured = storageStatus.configured;

  const handleNext = () => {
    if (step < 4) {
      setStep((s) => (s + 1) as 2 | 3 | 4);
    } else {
      update({ onboardingDone: true });
      onFinish();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((s) => (s - 1) as 1 | 2 | 3);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--md-sys-color-background)",
        padding: 32,
      }}
    >
      <Card
        elevation="high"
        radius={36}
        style={{
          width: "100%",
          maxWidth: 680,
          minHeight: 520,
          display: "flex",
          flexDirection: "column",
          padding: 40,
          background: "var(--md-sys-color-surface-container)",
        }}
      >
        {/* Header: Step counter & Expressive morphing badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <ExpressiveShape size={48} initialShape="squircle" hoverShape="cookie9">
              <SavioLogo size={26} color="var(--md-sys-color-on-primary-container)" />
            </ExpressiveShape>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" }}>Savio</div>
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
                {t("onboarding.step", { current: step, total: 4 })}
              </div>
            </div>
          </div>

          {/* Step indicator pills */}
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4].map((s) => (
              <motion.div
                key={s}
                animate={{
                  width: s === step ? 32 : 10,
                  background:
                    s === step
                      ? "var(--md-sys-color-primary)"
                      : s < step
                      ? "var(--md-sys-color-primary-container)"
                      : "var(--md-sys-color-surface-container-highest)",
                }}
                transition={springs.fastSpatial}
                style={{
                  height: 10,
                  borderRadius: 9999,
                }}
              />
            ))}
          </div>
        </div>

        {/* Content with animated slide/fade transition */}
        <div style={{ flex: 1, position: "relative" }}>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={springs.spatial}
                style={{ display: "flex", flexDirection: "column", gap: 20 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 22,
                      background: "linear-gradient(135deg, var(--md-sys-color-primary) 0%, var(--md-sys-color-tertiary) 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 10px 24px -4px var(--md-sys-color-shadow)",
                      flexShrink: 0,
                    }}
                  >
                    <SavioLogo size={46} color="#FFFFFF" fillOpacity={0.22} />
                  </div>
                  <div>
                    <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.5px" }}>
                      {t("onboarding.welcomeTitle")}
                    </h1>
                    <p style={{ fontSize: 15, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.4, margin: 0 }}>
                      {t("onboarding.welcomeText")}
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--md-sys-color-primary)" }}>
                    {t("onboarding.chooseLanguage")}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {LANGUAGES.map((lang) => {
                      const selected = settings.language === lang.code;
                      const isSystem = system.systemLocale.toLowerCase().startsWith(lang.code);
                      return (
                        <motion.button
                          key={lang.code}
                          onClick={() => update({ language: lang.code as Language })}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          transition={springs.fastSpatial}
                          style={{
                            padding: "16px 20px",
                            borderRadius: 20,
                            border: selected
                              ? "2px solid var(--md-sys-color-primary)"
                              : "1px solid var(--md-sys-color-outline-variant)",
                            background: selected
                              ? "var(--md-sys-color-primary-container)"
                              : "var(--md-sys-color-surface-container-low)",
                            color: selected
                              ? "var(--md-sys-color-on-primary-container)"
                              : "var(--md-sys-color-on-surface)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>{lang.nativeName}</div>
                            {isSystem && (
                              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                                {t("onboarding.detected")}
                              </div>
                            )}
                          </div>
                          {selected && (
                            <div
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 9999,
                                background: "var(--md-sys-color-primary)",
                                color: "var(--md-sys-color-on-primary)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Icon name="check" size={16} />
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={springs.spatial}
                style={{ display: "flex", flexDirection: "column", gap: 24 }}
              >
                <div>
                  <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.5px" }}>
                    {t("onboarding.lookTitle")}
                  </h1>
                  <p style={{ fontSize: 15, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.5 }}>
                    {t("onboarding.lookText")}
                  </p>
                </div>

                {/* Theme Selector: System / Light / Dark */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--md-sys-color-primary)" }}>
                    {t("settings.theme")}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
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
                        padding: 14,
                        borderRadius: 18,
                        cursor: "pointer",
                        border:
                          settings.theme === "system"
                            ? "2.5px solid var(--md-sys-color-primary)"
                            : "1.5px solid var(--md-sys-color-outline-variant)",
                        background: "var(--md-sys-color-surface-container-low)",
                        boxShadow: settings.theme === "system" ? "0 4px 16px var(--md-sys-color-shadow)" : "none",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: 48,
                          borderRadius: 10,
                          background: "linear-gradient(135deg, #FFFFFF 50%, #0B0F14 50%)",
                          border: "1px solid rgba(128,128,128,0.3)",
                          marginBottom: 8,
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
                            padding: 5,
                            display: "flex",
                          }}
                        >
                          <Icon name="brightness_auto" size={18} />
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
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
                        padding: 14,
                        borderRadius: 18,
                        cursor: "pointer",
                        border:
                          settings.theme === "light"
                            ? "2.5px solid var(--md-sys-color-primary)"
                            : "1.5px solid var(--md-sys-color-outline-variant)",
                        background: "var(--md-sys-color-surface-container-low)",
                        boxShadow: settings.theme === "light" ? "0 4px 16px var(--md-sys-color-shadow)" : "none",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: 48,
                          borderRadius: 10,
                          background: "#FFFFFF",
                          border: "1px solid #CBD5E1",
                          marginBottom: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                        }}
                      >
                        <Icon name="light_mode" size={22} color="#F59E0B" />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
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
                        padding: 14,
                        borderRadius: 18,
                        cursor: "pointer",
                        border:
                          settings.theme === "dark"
                            ? "2.5px solid var(--md-sys-color-primary)"
                            : "1.5px solid var(--md-sys-color-outline-variant)",
                        background: "var(--md-sys-color-surface-container-low)",
                        boxShadow: settings.theme === "dark" ? "0 4px 16px var(--md-sys-color-shadow)" : "none",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: 48,
                          borderRadius: 10,
                          background: "#0B0F14",
                          border: "1px solid #334155",
                          marginBottom: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                        }}
                      >
                        <Icon name="dark_mode" size={22} color="#60A5FA" />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                        {t("settings.themeDark")}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
                        {t("common.darkTheme")}
                      </div>
                    </button>
                  </div>
                </div>

                {/* Color Source Selector */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--md-sys-color-primary)" }}>
                    {t("settings.colorSource")}
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <motion.button
                      onClick={() => update({ colorSource: "windows" })}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={springs.fastSpatial}
                      style={{
                        flex: 1,
                        padding: 16,
                        borderRadius: 20,
                        border:
                          settings.colorSource === "windows"
                            ? "2px solid var(--md-sys-color-primary)"
                            : "1px solid var(--md-sys-color-outline-variant)",
                        background:
                          settings.colorSource === "windows"
                            ? "var(--md-sys-color-primary-container)"
                            : "var(--md-sys-color-surface-container-low)",
                        color:
                          settings.colorSource === "windows"
                            ? "var(--md-sys-color-on-primary-container)"
                            : "var(--md-sys-color-on-surface)",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9999,
                          background: accentColor || "#1B6B5F",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                        }}
                      />
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{t("settings.colorWindows")}</div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>{accentColor || "#1B6B5F"}</div>
                      </div>
                    </motion.button>

                    <motion.button
                      onClick={() => update({ colorSource: "custom" })}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={springs.fastSpatial}
                      style={{
                        flex: 1,
                        padding: 16,
                        borderRadius: 20,
                        border:
                          settings.colorSource === "custom"
                            ? "2px solid var(--md-sys-color-primary)"
                            : "1px solid var(--md-sys-color-outline-variant)",
                        background:
                          settings.colorSource === "custom"
                            ? "var(--md-sys-color-primary-container)"
                            : "var(--md-sys-color-surface-container-low)",
                        color:
                          settings.colorSource === "custom"
                            ? "var(--md-sys-color-on-primary-container)"
                            : "var(--md-sys-color-on-surface)",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="color"
                        value={settings.customColor}
                        onChange={(e) => update({ colorSource: "custom", customColor: e.target.value })}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9999,
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          background: "transparent",
                        }}
                      />
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{t("settings.colorCustom")}</div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>{settings.customColor}</div>
                      </div>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={springs.spatial}
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.5px" }}>
                    {t("onboarding.storageTitle")}
                  </h1>
                  <p style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.4 }}>
                    {t("onboarding.storageSubtitle")}
                  </p>
                </div>

                {/* Storage Status Pill */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 9999,
                      background: isConfigured ? "var(--status-synced-container)" : "var(--md-sys-color-error-container)",
                      color: isConfigured ? "var(--status-synced)" : "var(--md-sys-color-error)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Icon name={isConfigured ? "check_circle" : "sync_problem"} size={14} />
                    {isConfigured ? t("onboarding.storageReady") : t("onboarding.storageNotConfiguredYet")}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
                    {storageStatus.title} {storageStatus.detail ? `• ${storageStatus.detail}` : ""}
                  </span>
                </div>

                {/* Storage Options Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {/* 1. Google Drive */}
                  <div
                    onClick={() => update({ backupTargetType: "gdrive" })}
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      border: settings.backupTargetType === "gdrive" ? "2px solid #34A853" : "1px solid var(--md-sys-color-outline-variant)",
                      background: settings.backupTargetType === "gdrive" ? "var(--md-sys-color-surface-container-low)" : "var(--md-sys-color-surface-container-lowest)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(52, 168, 83, 0.15)", color: "#34A853", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="cloud" size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>Google Drive</div>
                        </div>
                      </div>
                      {settings.backupTargetType === "gdrive" && <Icon name="check_circle" size={16} color="#34A853" />}
                    </div>

                    {settings.gdriveAuth?.connected ? (
                      <div style={{ fontSize: 11, color: "var(--status-synced)", fontWeight: 700 }}>
                        {t("onboarding.gdriveConnected", { email: settings.gdriveAuth.email || "OK" })}
                      </div>
                    ) : (
                      <Button
                        variant="filled"
                        size="sm"
                        pill
                        icon="cloud"
                        disabled={isConnectingGdrive}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setIsConnectingGdrive(true);
                          try {
                            const res = await api.gdriveLoginOAuth();
                            if (res.status === "success") {
                              update({
                                backupTargetType: "gdrive",
                                gdriveAuth: {
                                  connected: true,
                                  email: res.email,
                                  accessToken: res.accessToken,
                                  refreshToken: res.refreshToken,
                                },
                              });
                            }
                          } catch (err) {
                            console.warn(err);
                          } finally {
                            setIsConnectingGdrive(false);
                          }
                        }}
                      >
                        {isConnectingGdrive ? "Вход..." : t("onboarding.connectGdrive")}
                      </Button>
                    )}
                  </div>

                  {/* 2. Local Folder / USB */}
                  <div
                    onClick={() => update({ backupTargetType: "local" })}
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      border: settings.backupTargetType === "local" ? "2px solid #10B981" : "1px solid var(--md-sys-color-outline-variant)",
                      background: settings.backupTargetType === "local" ? "var(--md-sys-color-surface-container-low)" : "var(--md-sys-color-surface-container-lowest)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(16, 185, 129, 0.15)", color: "#10B981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="hard_drive" size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{t("clouds.cardLocalTitle")}</div>
                        </div>
                      </div>
                      {settings.backupTargetType === "local" && <Icon name="check_circle" size={16} color="#10B981" />}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.85 }} title={settings.localBackupPath}>
                        {settings.localBackupPath || "D:\\SavioBackups"}
                      </div>
                      <button
                        type="button"
                        className="m3-btn"
                        title={t("onboarding.pickLocalFolder")}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const p = await api.pickFolder();
                          if (p) {
                            update({ backupTargetType: "local", localBackupPath: p });
                          }
                        }}
                        style={{
                          padding: "3px 6px",
                          borderRadius: 6,
                          border: "1px solid var(--md-sys-color-outline-variant)",
                          background: "var(--md-sys-color-surface-container)",
                          cursor: "pointer",
                          fontSize: 11,
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <Icon name="folder_open" size={13} />
                      </button>
                    </div>
                  </div>

                  {/* 3. MEGA Cloud */}
                  <div
                    onClick={() => update({ backupTargetType: "mega" })}
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      border: settings.backupTargetType === "mega" ? "2px solid #D9272E" : "1px solid var(--md-sys-color-outline-variant)",
                      background: settings.backupTargetType === "mega" ? "var(--md-sys-color-surface-container-low)" : "var(--md-sys-color-surface-container-lowest)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(217, 39, 46, 0.15)", color: "#D9272E", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="shield" size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>MEGA Cloud</div>
                        </div>
                      </div>
                      {settings.backupTargetType === "mega" && <Icon name="check_circle" size={16} color="#D9272E" />}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>
                      {settings.megaAuth?.connected ? `✓ ${settings.megaAuth.email}` : "20 ГБ шифрованного облака"}
                    </div>
                  </div>

                  {/* 4. ASUS Router / NAS */}
                  <div
                    onClick={() => update({ backupTargetType: "asus" })}
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      border: (settings.backupTargetType === "asus" || settings.backupTargetType === "nas") ? "2px solid #0284C7" : "1px solid var(--md-sys-color-outline-variant)",
                      background: (settings.backupTargetType === "asus" || settings.backupTargetType === "nas") ? "var(--md-sys-color-surface-container-low)" : "var(--md-sys-color-surface-container-lowest)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(2, 132, 199, 0.15)", color: "#0284C7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="router" size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>Роутер ASUS / NAS</div>
                        </div>
                      </div>
                      {(settings.backupTargetType === "asus" || settings.backupTargetType === "nas") && <Icon name="check_circle" size={16} color="#0284C7" />}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>
                      {settings.asusRouterIp ? `\\\\${settings.asusRouterIp}\\${settings.asusShareName}` : "Сетевой SMB диск"}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", textAlign: "center", marginTop: 2 }}>
                  {t("onboarding.skipForNow")}
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={springs.spatial}
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                <div>
                  <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.5px" }}>
                    {t("onboarding.featuresTitle")}
                  </h1>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(
                    [
                      {
                        icon: "radar",
                        titleKey: "onboarding.featureScanTitle",
                        textKey: "onboarding.featureScanText",
                      },
                      {
                        icon: "router",
                        titleKey: "onboarding.featureCloudTitle",
                        textKey: "onboarding.featureCloudText",
                      },
                      {
                        icon: "verified_user",
                        titleKey: "onboarding.featureSafeTitle",
                        textKey: "onboarding.featureSafeText",
                      },
                    ] as const
                  ).map((f) => (
                    <div
                      key={f.icon}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 16,
                        padding: 16,
                        borderRadius: 20,
                        background: "var(--md-sys-color-surface-container-low)",
                      }}
                    >
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
                          flexShrink: 0,
                        }}
                      >
                        <Icon name={f.icon as IconName} size={24} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{t(f.titleKey)}</div>
                        <div style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", lineHeight: 1.4 }}>
                          {t(f.textKey)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Navigation Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32 }}>
          {step > 1 ? (
            <Button variant="text" icon="arrow_back" onClick={handleBack}>
              {t("onboarding.back")}
            </Button>
          ) : (
            <div />
          )}

          <Button
            variant="filled"
            size="lg"
            iconTrailing={step === 4 ? "bolt" : "arrow_forward"}
            onClick={handleNext}
          >
            {step === 4 ? t("onboarding.start") : t("onboarding.next")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
