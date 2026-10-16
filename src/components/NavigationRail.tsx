import { memo } from "react";
import { Icon, type IconName } from "./Icon";
import { useI18n } from "../i18n/I18nProvider";
import { useSettings } from "../state/settings";

export type TabId = "library" | "clouds" | "settings";

interface NavItemConfig {
  id: TabId;
  labelKey: string;
  icon: IconName;
  colorRole: "primary" | "tertiary" | "secondary";
  badge?: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: "library",
    labelKey: "nav.library",
    icon: "sports_esports",
    colorRole: "primary",
  },
  {
    id: "clouds",
    labelKey: "nav.clouds",
    icon: "cloud",
    colorRole: "tertiary",
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    icon: "settings",
    colorRole: "secondary",
  },
];

interface NavigationRailProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export const NavigationRail = memo(function NavigationRail({
  activeTab,
  onTabChange,
}: NavigationRailProps) {
  const { t } = useI18n();
  const { system } = useSettings();

  return (
    <aside
      aria-label={t("nav.label")}
      style={{
        width: 110,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 0 16px",
        background: "var(--md-sys-color-surface-container-low)",
        border: "1px solid var(--md-sys-color-outline-variant)",
        borderRadius: 28,
        boxShadow: "0 4px 20px var(--md-sys-color-shadow)",
        flexShrink: 0,
        zIndex: 10,
        boxSizing: "border-box",
      }}
    >
      {/* Brand logo: Expressive Squircle with Dual Gradient Mix (Primary + Tertiary) */}
      <div style={{ marginBottom: 28 }}>
        <button
          type="button"
          onClick={() => onTabChange("library")}
          className="m3-btn"
          title="Savio"
          style={{
            width: 52,
            height: 52,
            borderRadius: 18,
            background: "linear-gradient(135deg, var(--md-sys-color-primary) 0%, var(--md-sys-color-tertiary) 100%)",
            color: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 16px var(--md-sys-color-shadow)",
            cursor: "pointer",
          }}
        >
          <Icon name="bolt" size={28} />
        </button>
      </div>

      {/* Nav items with rich 3-color palette mix */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", padding: "0 8px", boxSizing: "border-box" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const containerColor = `var(--md-sys-color-${item.colorRole}-container)`;
          const onContainerColor = `var(--md-sys-color-on-${item.colorRole}-container)`;
          const accentColor = `var(--md-sys-color-${item.colorRole})`;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className="m3-btn"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                padding: "4px 0",
                gap: 6,
                cursor: "pointer",
                background: "transparent",
                border: "none",
                outline: "none",
              }}
            >
              {/* Active Pill wrapping Icon cleanly (canonical M3 indicator) */}
              <div
                style={{
                  width: 56,
                  height: 32,
                  borderRadius: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isActive ? containerColor : "transparent",
                  border: isActive ? `1.5px solid ${accentColor}` : "1.5px solid transparent",
                  boxShadow: isActive ? "0 2px 8px var(--md-sys-color-shadow)" : "none",
                  transition: "all 180ms cubic-bezier(0.2, 0, 0, 1)",
                }}
              >
                <Icon
                  name={item.icon}
                  size={22}
                  color={isActive ? onContainerColor : "var(--md-sys-color-on-surface-variant)"}
                />
              </div>

              {/* Label - completely free from pill overlap */}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isActive ? 800 : 500,
                  color: isActive ? "var(--md-sys-color-on-surface)" : "var(--md-sys-color-on-surface-variant)",
                  letterSpacing: "0.1px",
                  lineHeight: 1.2,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  padding: "0 2px",
                  transition: "color 150ms ease",
                }}
              >
                {t(item.labelKey)}
              </span>

              {/* Multi-color accent dot when inactive */}
              {!isActive && (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 9999,
                    background: accentColor,
                    opacity: 0.6,
                    marginTop: -3,
                  }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Multi-Color Palette Indicator & Portable badge */}
      <div
        title={system.portable ? t("settings.modePortable") : "Savio v0.1.0"}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        {/* 3-Color Mini Swatches Mix */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--md-sys-color-primary)" }} title="Primary" />
          <div style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--md-sys-color-secondary)" }} title="Secondary" />
          <div style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--md-sys-color-tertiary)" }} title="Tertiary" />
        </div>

        <div
          style={{
            padding: "4px 10px",
            borderRadius: 9999,
            background: "var(--md-sys-color-secondary-container)",
            color: "var(--md-sys-color-on-secondary-container)",
            border: "1px solid var(--md-sys-color-outline-variant)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.6px",
            textTransform: "uppercase",
          }}
        >
          {system.portable ? "PORT" : "SAVIO"}
        </div>
      </div>
    </aside>
  );
});

