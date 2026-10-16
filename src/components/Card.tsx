import { memo, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { springs } from "../theme/motion";

export type CardElevation = "lowest" | "low" | "default" | "high" | "highest";

interface CardProps extends HTMLMotionProps<"div"> {
  elevation?: CardElevation;
  interactive?: boolean;
  children: ReactNode;
  radius?: number | string;
}

export const Card = memo(function Card({
  elevation = "low",
  interactive = false,
  children,
  radius = 28, // M3 Expressive 28px
  style,
  ...props
}: CardProps) {
  const getBackground = () => {
    switch (elevation) {
      case "lowest":
        return "var(--md-sys-color-surface-container-lowest)";
      case "default":
        return "var(--md-sys-color-surface-container)";
      case "high":
        return "var(--md-sys-color-surface-container-high)";
      case "highest":
        return "var(--md-sys-color-surface-container-highest)";
      case "low":
      default:
        return "var(--md-sys-color-surface-container-low)";
    }
  };

  return (
    <motion.div
      {...props}
      whileHover={
        interactive
          ? {
              y: -4,
              scale: 1.01,
              boxShadow: "0 12px 32px -4px rgba(0, 0, 0, 0.25)",
            }
          : undefined
      }
      whileTap={
        interactive
          ? {
              y: -1,
              scale: 0.99,
            }
          : undefined
      }
      transition={springs.spatial}
      style={{
        borderRadius: radius,
        background: getBackground(),
        color: "var(--md-sys-color-on-surface)",
        padding: 24,
        position: "relative",
        overflow: "hidden",
        border: "1px solid var(--md-sys-color-outline-variant, rgba(255,255,255,0.06))",
        cursor: interactive ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
});
