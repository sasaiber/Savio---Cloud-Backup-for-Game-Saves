import { memo } from "react";

export interface SavioLogoProps {
  size?: number;
  color?: string;
  fillOpacity?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Savio official Cloud Gamepad vector logo (Option 2).
 * Minimalist hybrid of a game controller and sync cloud.
 */
export const SavioLogo = memo(function SavioLogo({
  size = 28,
  color = "currentColor",
  fillOpacity = 0.18,
  className,
  style,
}: SavioLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
    >
      {/* Outer cloud-gamepad silhouette */}
      <path
        d="M 32 36 C 24 36, 18 42, 18 50 C 18 64, 25 82, 33 82 C 38 82, 42 74, 46 70 C 48 68, 52 68, 54 70 C 58 74, 62 82, 67 82 C 75 82, 82 64, 82 50 C 82 42, 76 36, 68 36 C 67 36, 65 37, 64 38 C 61 27, 51 20, 39 24 C 34 26, 31 30, 32 36 Z"
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={7}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* D-pad cross on left */}
      <path
        d="M 32 46 L 32 58 M 26 52 L 38 52"
        stroke={color}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      {/* Action buttons on right */}
      <circle cx={68} cy={48} r={3.2} fill={color} />
      <circle cx={62} cy={54} r={3.2} fill={color} />
      {/* Central upward cloud sync arrow */}
      <path
        d="M 50 36 L 50 52 M 45 42 L 50 36 L 55 42"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
