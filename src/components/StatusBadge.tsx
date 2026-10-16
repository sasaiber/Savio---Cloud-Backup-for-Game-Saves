import { memo } from "react";
import { Icon, type IconName } from "./Icon";
import { useI18n } from "../i18n/I18nProvider";
import type { StatusKind } from "../theme/color";

interface StatusBadgeProps {
  status: StatusKind;
  size?: "sm" | "md";
  showLabel?: boolean;
}

const STATUS_ICONS: Record<StatusKind, IconName> = {
  synced: "check_circle",
  playing: "sports_esports",
  localNewer: "cloud_upload",
  cloudNewer: "cloud_download",
  conflict: "sync_problem",
  error: "error",
};

export const StatusBadge = memo(function StatusBadge({
  status,
  size = "md",
  showLabel = true,
}: StatusBadgeProps) {
  const { t } = useI18n();

  const iconName = STATUS_ICONS[status];
  const label = t(`status.${status}`);

  const isSmall = size === "sm";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: isSmall ? "3px 8px" : "4px 12px",
        borderRadius: 9999, // Pill shape
        background: `var(--status-${status.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}-container)`,
        color: `var(--status-${status.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}-on-container)`,
        fontSize: isSmall ? 11 : 12,
        fontWeight: 600,
        letterSpacing: "0.2px",
        userSelect: "none",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <Icon
        name={iconName}
        size={isSmall ? 14 : 16}
        color={`var(--status-${status.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())})`}
      />
      {showLabel && <span>{label}</span>}
    </span>
  );
});
