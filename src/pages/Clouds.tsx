import { memo, useState, useEffect } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Icon, type IconName } from "../components/Icon";
import { ExpressiveShape } from "../components/ExpressiveShape";
import { useSettings, type BackupTargetType } from "../state/settings";
import { useI18n } from "../i18n/I18nProvider";
import { api } from "../lib/tauri";

interface CloudTargetConfig {
  id: BackupTargetType;
  title: string;
  badge: string;
  description: string;
  icon: IconName;
  accent: string;
  shape: "squircle" | "cookie9" | "sunny";
}

export const Clouds = memo(function Clouds() {
  const { settings, update } = useSettings();
  const { t } = useI18n();

  const STORAGE_OPTIONS: CloudTargetConfig[] = [
    {
      id: "gdrive",
      title: "Google Drive",
      badge: t("clouds.cardGdriveBadge"),
      description: t("clouds.cardGdriveDesc"),
      icon: "cloud",
      accent: "#34A853",
      shape: "sunny",
    },
    {
      id: "mega",
      title: "MEGA Cloud",
      badge: t("clouds.cardMegaBadge"),
      description: t("clouds.cardMegaDesc"),
      icon: "shield",
      accent: "#D9272E",
      shape: "cookie9",
    },
    {
      id: "local",
      title: t("clouds.cardLocalTitle"),
      badge: t("clouds.cardLocalBadge"),
      description: t("clouds.cardLocalDesc"),
      icon: "hard_drive",
      accent: "#10B981",
      shape: "cookie9",
    },
    {
      id: "asus",
      title: "ASUS Router SMB",
      badge: t("clouds.cardAsusBadge"),
      description: t("clouds.cardAsusDesc"),
      icon: "router",
      accent: "#0284C7",
      shape: "squircle",
    },
    {
      id: "nas",
      title: "NAS / SMB",
      badge: t("clouds.cardNasBadge"),
      description: t("clouds.cardNasDesc"),
      icon: "dns",
      accent: "#8B5CF6",
      shape: "squircle",
    },
  ];

  const [testingTarget, setTestingTarget] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { accessible: boolean; writable: boolean; message: string } | null>>({});

  // Google Drive OAuth state
  const [showAsusPassword, setShowAsusPassword] = useState(false);
  const [showAsusGuide, setShowAsusGuide] = useState(false);
  const [isDiscoveringShares, setIsDiscoveringShares] = useState(false);
  const [discoveredShares, setDiscoveredShares] = useState<string[]>([]);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveError, setGdriveError] = useState<string | null>(null);

  // MEGA credentials state
  const isMegaFullyConnected = Boolean(settings.megaAuth?.connected && settings.megaAuth?.obscuredPass);
  const [megaEmailInput, setMegaEmailInput] = useState(settings.megaAuth?.email || "");
  const [megaPassInput, setMegaPassInput] = useState("");
  const [megaLoading, setMegaLoading] = useState(false);
  const [megaError, setMegaError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.megaAuth?.email && !megaEmailInput) {
      setMegaEmailInput(settings.megaAuth.email);
    }
  }, [settings.megaAuth?.email]);

  // Collapsible local folder options
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({});

  const toggleAdvanced = (id: string) => {
    setShowAdvanced((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const handleLoginGDrive = async () => {
    setGdriveLoading(true);
    setGdriveError(null);
    try {
      const res = await api.gdriveLoginOAuth();
      if (res.status === "success" && res.accessToken) {
        update({
          gdriveAuth: {
            connected: true,
            email: res.email || "Google",
            accessToken: res.accessToken,
            refreshToken: res.refreshToken,
          },
          backupTargetType: "gdrive",
        });
      }
    } catch (e) {
      setGdriveError(String(e));
    } finally {
      setGdriveLoading(false);
    }
  };

  const handleLogoutGDrive = () => {
    update({
      gdriveAuth: { connected: false },
    });
  };

  // 3. MEGA Login
  const handleLoginMega = async () => {
    if (!megaEmailInput.trim()) {
      setMegaError(t("clouds.enterMegaEmailError"));
      return;
    }
    setMegaLoading(true);
    setMegaError(null);
    try {
      const res = await api.testMegaLogin(megaEmailInput.trim(), megaPassInput.trim());
      update({
        megaAuth: {
          connected: true,
          email: res.email || megaEmailInput.trim(),
          obscuredPass: res.obscuredPass,
        },
        backupTargetType: "mega",
      });
      setTestResults((prev) => ({
        ...prev,
        mega: { accessible: true, writable: true, message: res.message || t("clouds.megaConnectedSuccess") },
      }));
    } catch (e) {
      setMegaError(String(e));
    } finally {
      setMegaLoading(false);
    }
  };

  const handleLogoutMega = () => {
    update({
      megaAuth: { connected: false },
    });
  };

  const handleTest = async (targetId: string, path: string) => {
    setTestingTarget(targetId);
    try {
      if (targetId === "gdrive" && settings.gdriveAuth?.connected) {
        setTestResults((prev) => ({
          ...prev,
          gdrive: {
            accessible: true,
            writable: true,
            message: t("clouds.gdriveConnectedMsg", { email: settings.gdriveAuth?.email || "" }),
          },
        }));
      } else if (targetId === "mega" && isMegaFullyConnected) {
        if (settings.megaAuth.obscuredPass) {
          const res = await api.testMegaLogin(settings.megaAuth.email || "", `obscured:${settings.megaAuth.obscuredPass}`);
          setTestResults((prev) => ({
            ...prev,
            mega: { accessible: true, writable: true, message: res.message },
          }));
        } else {
          setTestResults((prev) => ({
            ...prev,
            mega: { accessible: true, writable: true, message: t("clouds.megaConnectedMsg", { email: settings.megaAuth?.email || "" }) },
          }));
        }
      } else {
        if (!path.trim()) {
          setTestResults((prev) => ({
            ...prev,
            [targetId]: { accessible: false, writable: false, message: t("clouds.noPathOrAuthMsg") },
          }));
          return;
        }
        const res = await api.testStorageTarget(
          path,
          targetId === "asus" || targetId === "nas" ? settings.asusUsername : undefined,
          targetId === "asus" || targetId === "nas" ? settings.asusPassword : undefined
        );
        setTestResults((prev) => ({ ...prev, [targetId]: res }));
      }
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [targetId]: { accessible: false, writable: false, message: String(e) },
      }));
    } finally {
      setTestingTarget(null);
    }
  };

  const handleDiscoverShares = async () => {
    setIsDiscoveringShares(true);
    try {
      const ip = settings.asusRouterIp || "192.168.50.1";
      const shares = await api.discoverRouterShares(
        ip,
        settings.asusUsername || undefined,
        settings.asusPassword || undefined
      );
      setDiscoveredShares(shares);
      if (shares.length > 0) {
        // If current share is not among discovered or is default placeholder, select the first discovered one
        if (!shares.includes(settings.asusShareName)) {
          update({ asusShareName: shares[0] });
        }
        setTestResults((prev) => ({
          ...prev,
          asus: {
            accessible: true,
            writable: true,
            message: `На роутере ${ip} найдены папки: ${shares.join(", ")}`,
          },
        }));
      }
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        asus: {
          accessible: false,
          writable: false,
          message: String(e),
        },
      }));
    } finally {
      setIsDiscoveringShares(false);
    }
  };

  const handlePickLocalFolder = async () => {
    try {
      const picked = await api.pickFolder();
      if (picked) {
        update({ localBackupPath: picked });
      }
    } catch (e) {
      console.warn("Folder picker failed:", e);
    }
  };

  const handlePickGDriveFolder = async () => {
    try {
      const picked = await api.pickFolder();
      if (picked) {
        update({ gdrivePath: picked });
      }
    } catch (e) {
      console.warn("Google Drive picker failed:", e);
    }
  };

  const handlePickMegaFolder = async () => {
    try {
      const picked = await api.pickFolder();
      if (picked) {
        update({ megaPath: picked });
      }
    } catch (e) {
      console.warn("MEGA picker failed:", e);
    }
  };

  const getActiveTargetPathText = () => {
    switch (settings.backupTargetType) {
      case "gdrive":
        if (settings.gdriveAuth?.connected) {
          return `${t("clouds.googleDrive.name")}: ${settings.gdriveAuth.email || t("status.synced")}`;
        }
        return settings.gdrivePath || "G:\\My Drive\\SavioSaves";
      case "mega":
        if (isMegaFullyConnected) {
          return `${t("clouds.mega.name")}: ${settings.megaAuth.email || t("status.synced")}`;
        }
        return settings.megaPath || "MEGAsync\\SavioSaves";
      case "asus":
        return `\\\\${settings.asusRouterIp}\\${settings.asusShareName}`;
      case "local":
        return settings.localBackupPath;
      case "nas":
        return settings.nasPath;
      default:
        return t("clouds.notSelected");
    }
  };

  return (
    <div
      style={{
        flex: 1,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "24px 32px",
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      {/* Page Header */}
      <div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.5px",
            color: "var(--md-sys-color-on-surface)",
          }}
        >
          {t("clouds.headerTitle")}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--md-sys-color-on-surface-variant)",
            marginTop: 4,
          }}
        >
          {t("clouds.headerSubtitle")}
        </p>
      </div>

      {/* Current Active Target Banner */}
      <div
        style={{
          borderRadius: 24,
          padding: "18px 24px",
          background: "var(--md-sys-color-primary-container)",
          color: "var(--md-sys-color-on-primary-container)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "var(--md-sys-color-primary)",
              color: "var(--md-sys-color-on-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="cloud" size={24} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.85 }}>
              {t("clouds.activeTargetLabel")}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>
              {STORAGE_OPTIONS.find((s) => s.id === settings.backupTargetType)?.title || t("clouds.notSelected")}
            </div>
            <div
              style={{
                fontSize: 12,
                opacity: 0.9,
                fontFamily: "var(--font-family-mono)",
                marginTop: 2,
              }}
            >
              {getActiveTargetPathText()}
            </div>
          </div>
        </div>

        <span
          style={{
            padding: "6px 14px",
            borderRadius: 9999,
            fontSize: 12,
            fontWeight: 800,
            background: "var(--status-synced-container)",
            color: "var(--status-synced)",
          }}
        >
          {t("clouds.selectedBadge")}
        </span>
      </div>

      {/* Grid of Available Targets */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
          gap: 20,
          alignItems: "start",
        }}
      >
        {STORAGE_OPTIONS.map((target) => {
          const isActive = settings.backupTargetType === target.id;
          const isTesting = testingTarget === target.id;
          const result = testResults[target.id];

          return (
            <Card
              key={target.id}
              elevation={isActive ? "high" : "low"}
              radius={24}
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                border: isActive
                  ? "2px solid var(--md-sys-color-primary)"
                  : "1px solid var(--md-sys-color-outline-variant)",
                background: isActive
                  ? "var(--md-sys-color-surface-container-high)"
                  : "var(--md-sys-color-surface-container-low)",
              }}
            >
              {/* Card Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <ExpressiveShape
                    initialShape={target.shape}
                    size={46}
                    fill={target.accent}
                  >
                    <Icon name={target.icon} size={24} color="#FFFFFF" />
                  </ExpressiveShape>

                  <div>
                    <h3
                      style={{
                        fontSize: 17,
                        fontWeight: 800,
                        color: "var(--md-sys-color-on-surface)",
                        letterSpacing: "-0.2px",
                      }}
                    >
                      {target.title}
                    </h3>
                    <div style={{ fontSize: 11, fontWeight: 700, color: target.accent }}>
                      {target.badge}
                    </div>
                  </div>
                </div>

                {isActive && (
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 800,
                      background: "var(--md-sys-color-primary-container)",
                      color: "var(--md-sys-color-on-primary-container)",
                    }}
                  >
                    {t("clouds.primaryBadge")}
                  </span>
                )}
              </div>

              {/* Description */}
              <p
                style={{
                  fontSize: 13,
                  color: "var(--md-sys-color-on-surface-variant)",
                  lineHeight: 1.5,
                  minHeight: 38,
                }}
              >
                {target.description}
              </p>

              {/* Configuration Inputs & Direct Login */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                
                {/* 1. GOOGLE DRIVE OAUTH */}
                {target.id === "gdrive" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {settings.gdriveAuth?.connected ? (
                      <div
                        style={{
                          padding: "14px 16px",
                          borderRadius: 16,
                          background: "var(--status-synced-container)",
                          border: "1px solid var(--status-synced)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Icon name="check_circle" size={20} color="var(--status-synced)" />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--status-synced)" }}>
                              {t("clouds.googleConnected")}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                              {settings.gdriveAuth.email}
                            </div>
                          </div>
                        </div>
                        <Button variant="tonal" size="sm" pill onClick={handleLogoutGDrive}>
                          {t("clouds.logout")}
                        </Button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <Button
                          variant="filled"
                          size="md"
                          pill
                          icon="arrow_forward"
                          disabled={gdriveLoading}
                          onClick={handleLoginGDrive}
                          style={{ background: "#34A853", color: "#FFFFFF" }}
                        >
                          {gdriveLoading ? t("clouds.googleLoggingIn") : t("clouds.googleLogin")}
                        </Button>
                        {gdriveLoading && (
                          <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#34A853", animation: "pulse 1.5s infinite" }} />
                            {t("clouds.googleBrowserPrompt")}
                          </div>
                        )}
                        {gdriveError && (
                          <div style={{ fontSize: 12, color: "var(--md-sys-color-error)", padding: "4px 8px" }}>
                            {gdriveError}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Advanced toggle for local folder */}
                    <div style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => toggleAdvanced("gdrive")}
                        style={{
                          background: "none",
                          border: "none",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--md-sys-color-on-surface-variant)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: 0,
                        }}
                      >
                        <span style={{ fontSize: 9 }}>{showAdvanced["gdrive"] ? "▲" : "▼"}</span>
                        {t("clouds.folderOnDisk")}
                      </button>
                      {showAdvanced["gdrive"] && (
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            value={settings.gdrivePath}
                            onChange={(e) => update({ gdrivePath: e.target.value })}
                            placeholder="G:\My Drive\SavioSaves"
                            style={{
                              flex: 1,
                              padding: "8px 14px",
                              borderRadius: 12,
                              background: "var(--md-sys-color-surface-container)",
                              border: "1px solid var(--md-sys-color-outline-variant)",
                              color: "var(--md-sys-color-on-surface)",
                              fontSize: 13,
                              fontFamily: "var(--font-family-mono)",
                              outline: "none",
                            }}
                          />
                          <Button variant="tonal" size="sm" pill icon="folder_open" onClick={handlePickGDriveFolder}>
                            {t("common.browse")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. MEGA CREDENTIALS */}
                {target.id === "mega" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {isMegaFullyConnected ? (
                      <div
                        style={{
                          padding: "14px 16px",
                          borderRadius: 16,
                          background: "var(--status-synced-container)",
                          border: "1px solid var(--status-synced)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Icon name="check_circle" size={20} color="var(--status-synced)" />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--status-synced)" }}>
                              {t("clouds.megaConnected")}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>
                              {settings.megaAuth.email}
                            </div>
                          </div>
                        </div>
                        <Button variant="tonal" size="sm" pill onClick={handleLogoutMega}>
                          {t("clouds.logout")}
                        </Button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {settings.megaAuth?.email && !settings.megaAuth?.obscuredPass && (
                          <div
                            style={{
                              padding: "10px 14px",
                              borderRadius: 12,
                              background: "var(--md-sys-color-surface-container-high)",
                              border: "1px solid var(--md-sys-color-primary)",
                              fontSize: 12,
                              color: "var(--md-sys-color-on-surface)",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <Icon name="shield" size={18} color="var(--md-sys-color-primary)" />
                            <span>
                              {t("clouds.megaPasswordNeedFor")} <strong>{settings.megaAuth.email}</strong>:
                            </span>
                          </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", display: "block", marginBottom: 4 }}>
                              {t("clouds.megaEmailPrompt")}
                            </label>
                            <input
                              type="email"
                              value={megaEmailInput}
                              onChange={(e) => setMegaEmailInput(e.target.value)}
                              placeholder="user@domain.com"
                              style={{
                                width: "100%",
                                padding: "8px 14px",
                                borderRadius: 12,
                                background: "var(--md-sys-color-surface-container)",
                                border: "1px solid var(--md-sys-color-outline-variant)",
                                color: "var(--md-sys-color-on-surface)",
                                fontSize: 13,
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", display: "block", marginBottom: 4 }}>
                              {t("clouds.megaPasswordPrompt")}
                            </label>
                            <input
                              type="password"
                              value={megaPassInput}
                              onChange={(e) => setMegaPassInput(e.target.value)}
                              placeholder="••••••••••••"
                              style={{
                                width: "100%",
                                padding: "8px 14px",
                                borderRadius: 12,
                                background: "var(--md-sys-color-surface-container)",
                                border: "1px solid var(--md-sys-color-outline-variant)",
                                color: "var(--md-sys-color-on-surface)",
                                fontSize: 13,
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>
                        </div>

                        <Button
                          variant="filled"
                          size="md"
                          pill
                          icon="shield"
                          disabled={megaLoading || !megaEmailInput.trim()}
                          onClick={handleLoginMega}
                          style={{ background: "#D9272E", color: "#FFFFFF" }}
                        >
                          {megaLoading ? t("clouds.megaChecking") : t("clouds.megaLogin")}
                        </Button>

                        {megaError && (
                          <div style={{ fontSize: 12, color: "var(--md-sys-color-error)", padding: "4px 8px" }}>
                            {megaError}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Advanced toggle for local folder */}
                    <div style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => toggleAdvanced("mega")}
                        style={{
                          background: "none",
                          border: "none",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--md-sys-color-on-surface-variant)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: 0,
                        }}
                      >
                        <span style={{ fontSize: 9 }}>{showAdvanced["mega"] ? "▲" : "▼"}</span>
                        {t("clouds.folderOnDisk")}
                      </button>
                      {showAdvanced["mega"] && (
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            value={settings.megaPath}
                            onChange={(e) => update({ megaPath: e.target.value })}
                            placeholder={t("clouds.folderOnDiskPlaceholder")}
                            style={{
                              flex: 1,
                              padding: "8px 14px",
                              borderRadius: 12,
                              background: "var(--md-sys-color-surface-container)",
                              border: "1px solid var(--md-sys-color-outline-variant)",
                              color: "var(--md-sys-color-on-surface)",
                              fontSize: 13,
                              fontFamily: "var(--font-family-mono)",
                              outline: "none",
                            }}
                          />
                          <Button variant="tonal" size="sm" pill icon="folder_open" onClick={handlePickMegaFolder}>
                            {t("common.browse")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. LOCAL DRIVE */}
                {target.id === "local" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", display: "block", marginBottom: 4 }}>
                      {t("clouds.localFolderPrompt")}
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        value={settings.localBackupPath}
                        onChange={(e) => update({ localBackupPath: e.target.value })}
                        placeholder="D:\SavioBackups"
                        style={{
                          flex: 1,
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
                      <Button variant="tonal" size="sm" pill icon="folder_open" onClick={handlePickLocalFolder}>
                        {t("common.browse")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* 5. ASUS ROUTER */}
                {target.id === "asus" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Collapsible Helper guide */}
                    <div
                      style={{
                        borderRadius: 12,
                        background: "rgba(2, 132, 199, 0.08)",
                        border: "1px solid rgba(2, 132, 199, 0.25)",
                        fontSize: 12,
                        color: "var(--md-sys-color-on-surface)",
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setShowAsusGuide((p) => !p)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--md-sys-color-on-surface)",
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#38BDF8" }}>
                          <Icon name="verified_user" size={16} color="#38BDF8" />
                          <span>{t("clouds.asusGuideTitle")}</span>
                        </div>
                        <span style={{ fontSize: 10, color: "var(--md-sys-color-on-surface-variant)" }}>
                          {showAsusGuide ? "▲ Скрыть" : "▼ Инструкция"}
                        </span>
                      </button>
                      {showAsusGuide && (
                        <div style={{ padding: "0 12px 10px", opacity: 0.9, lineHeight: 1.5, fontSize: 11 }}>
                          {t("clouds.asusGuideDesc")}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", display: "block", marginBottom: 4 }}>
                          {t("clouds.asusIpPrompt")}
                        </label>
                        <input
                          type="text"
                          value={settings.asusRouterIp}
                          onChange={(e) => update({ asusRouterIp: e.target.value })}
                          placeholder="192.168.50.1"
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
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", display: "block", marginBottom: 4 }}>
                          {t("clouds.asusSharePrompt")}
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            type="text"
                            value={settings.asusShareName}
                            onChange={(e) => update({ asusShareName: e.target.value })}
                            placeholder="SAVES"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: "8px 12px",
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
                          <Button
                            variant="tonal"
                            size="sm"
                            pill
                            icon="search"
                            disabled={isDiscoveringShares}
                            onClick={handleDiscoverShares}
                            title="Опросить роутер и найти имена доступных общих папок"
                          >
                            {isDiscoveringShares ? "..." : "Найти"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Discovered shares or quick suggestion chip */}
                    {discoveredShares.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: -4 }}>
                        <span style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" }}>Найдено на роутере:</span>
                        {discoveredShares.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => update({ asusShareName: s })}
                            style={{
                              background: settings.asusShareName === s ? "var(--md-sys-color-primary-container)" : "var(--md-sys-color-surface-container-high)",
                              color: settings.asusShareName === s ? "var(--md-sys-color-primary)" : "var(--md-sys-color-on-surface)",
                              border: "1px solid var(--md-sys-color-outline-variant)",
                              borderRadius: 8,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            📁 {s}
                          </button>
                        ))}
                      </div>
                    )}
                    {settings.asusShareName !== "SAVES" && settings.asusRouterIp === "192.168.50.1" && (
                      <button
                        type="button"
                        onClick={() => update({ asusShareName: "SAVES" })}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--md-sys-color-primary)",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          padding: 0,
                          textAlign: "left",
                          marginTop: -4,
                        }}
                      >
                        💡 Использовать папку «SAVES» с роутера (рекомендовано)
                      </button>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", display: "block", marginBottom: 4 }}>
                          {t("clouds.asusUsernameLabel")} <span style={{ opacity: 0.6, fontWeight: 500 }}>({t("clouds.asusRequiredHint")})</span>
                        </label>
                        <input
                          type="text"
                          value={settings.asusUsername || ""}
                          onChange={(e) => update({ asusUsername: e.target.value })}
                          placeholder="admin"
                          style={{
                            width: "100%",
                            padding: "8px 14px",
                            borderRadius: 12,
                            background: "var(--md-sys-color-surface-container)",
                            border: "1px solid var(--md-sys-color-outline-variant)",
                            color: "var(--md-sys-color-on-surface)",
                            fontSize: 13,
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", display: "block", marginBottom: 4 }}>
                          {t("clouds.asusPasswordLabel")}
                        </label>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showAsusPassword ? "text" : "password"}
                            value={settings.asusPassword || ""}
                            onChange={(e) => update({ asusPassword: e.target.value })}
                            placeholder="••••••••"
                            style={{
                              width: "100%",
                              padding: "8px 36px 8px 14px",
                              borderRadius: 12,
                              background: "var(--md-sys-color-surface-container)",
                              border: "1px solid var(--md-sys-color-outline-variant)",
                              color: "var(--md-sys-color-on-surface)",
                              fontSize: 13,
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowAsusPassword((p) => !p)}
                            style={{
                              position: "absolute",
                              right: 8,
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "transparent",
                              border: "none",
                              color: "var(--md-sys-color-on-surface-variant)",
                              cursor: "pointer",
                              padding: 4,
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <Icon name={showAsusPassword ? "visibility" : "visibility_off"} size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. NAS SMB */}
                {target.id === "nas" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)", display: "block", marginBottom: 4 }}>
                      {t("clouds.nasPathPrompt")}
                    </label>
                    <input
                      type="text"
                      value={settings.nasPath}
                      onChange={(e) => update({ nasPath: e.target.value })}
                      placeholder="\\NAS\SaveVault"
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
                  </div>
                )}

                {/* Inline Test Feedback */}
                {result && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 14px",
                      borderRadius: 12,
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: result.accessible ? "var(--status-synced-container)" : "var(--md-sys-color-error-container)",
                      color: result.accessible ? "var(--status-synced)" : "var(--md-sys-color-on-error-container)",
                    }}
                  >
                    <Icon name={result.accessible ? "check_circle" : "error"} size={16} />
                    <span>{result.message}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10 }}>
                <Button
                  variant="tonal"
                  size="sm"
                  pill
                  icon="radar"
                  disabled={isTesting}
                  onClick={() => {
                    const testPath =
                      target.id === "gdrive"
                        ? settings.gdrivePath
                        : target.id === "mega"
                        ? settings.megaPath || "C:\\Users\\roslo\\MEGAsync\\SavioSaves"
                        : target.id === "asus"
                        ? `\\\\${settings.asusRouterIp}\\${settings.asusShareName}`
                        : target.id === "local"
                        ? settings.localBackupPath
                        : settings.nasPath;
                    handleTest(target.id, testPath);
                  }}
                >
                  {isTesting ? t("clouds.testingAccess") : t("clouds.testAccess")}
                </Button>

                {!isActive && (
                  <Button
                    variant="filled"
                    size="sm"
                    pill
                    icon="check"
                    onClick={() => update({ backupTargetType: target.id })}
                  >
                    {t("clouds.makePrimary")}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
});
