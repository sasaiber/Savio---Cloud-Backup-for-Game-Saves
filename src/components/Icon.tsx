import { memo, type CSSProperties } from "react";
import iconData from "../theme/iconData.json";

export type IconName = keyof typeof iconData;

interface IconProps {
  name: IconName;
  size?: number | string;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export const Icon = memo(function Icon({
  name,
  size = 22,
  color = "currentColor",
  className,
  style,
}: IconProps) {
  const path = (iconData as Record<string, string>)[name];

  if (!path) {
    return <span style={{ display: "inline-block", width: size, height: size }} />;
  }

  return (
    <svg
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill={color}
      className={className}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
});
