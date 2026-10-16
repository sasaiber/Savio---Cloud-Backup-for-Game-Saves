import { memo, type ReactNode, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconTrailing?: IconName;
  children?: ReactNode;
  pill?: boolean;
}

export const Button = memo(function Button({
  variant = "filled",
  size = "md",
  icon,
  iconTrailing,
  children,
  disabled,
  style,
  className = "",
  pill = false,
  ...props
}: ButtonProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case "tonal":
        return {
          background: "var(--md-sys-color-secondary-container)",
          color: "var(--md-sys-color-on-secondary-container)",
          border: "none",
        };
      case "outlined":
        return {
          background: "transparent",
          color: "var(--md-sys-color-primary)",
          border: "1px solid var(--md-sys-color-outline)",
        };
      case "text":
        return {
          background: "transparent",
          color: "var(--md-sys-color-primary)",
          border: "none",
        };
      case "filled":
      default:
        return {
          background: "var(--md-sys-color-primary)",
          color: "var(--md-sys-color-on-primary)",
          border: "none",
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case "sm":
        return {
          height: 36,
          padding: children ? "0 14px" : "0 8px",
          fontSize: 13,
          gap: 6,
          iconSize: 18,
          radius: pill ? 9999 : 14,
        };
      case "lg":
        return {
          height: 52,
          padding: children ? "0 28px" : "0 16px",
          fontSize: 16,
          gap: 12,
          iconSize: 24,
          radius: pill ? 9999 : 20,
        };
      case "md":
      default:
        return {
          height: 44,
          padding: children ? "0 22px" : "0 12px",
          fontSize: 14,
          gap: 8,
          iconSize: 20,
          radius: pill ? 9999 : 16,
        };
    }
  };

  const sz = getSizeStyles();
  const vs = getVariantStyles();

  return (
    <button
      type="button"
      {...props}
      disabled={disabled}
      className={`m3-btn ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        letterSpacing: "0.2px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        userSelect: "none",
        borderRadius: sz.radius,
        height: sz.height,
        padding: sz.padding,
        fontSize: sz.fontSize,
        gap: sz.gap,
        transformOrigin: "center center",
        boxSizing: "border-box",
        ...vs,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={sz.iconSize} />}
      {children && <span>{children}</span>}
      {iconTrailing && <Icon name={iconTrailing} size={sz.iconSize} />}
    </button>
  );
});

