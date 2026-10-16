import { memo, useMemo, useState } from "react";
import { motion } from "motion/react";
import { shapeRadii, blendRadii, pathFromRadii, type ShapeName } from "../theme/shapes";
import { springs } from "../theme/motion";

interface ExpressiveShapeProps {
  initialShape?: ShapeName;
  hoverShape?: ShapeName;
  size?: number;
  fill?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ExpressiveShape = memo(function ExpressiveShape({
  initialShape = "squircle",
  hoverShape = "cookie12",
  size = 72,
  fill = "var(--md-sys-color-primary-container)",
  className,
  children,
}: ExpressiveShapeProps) {
  const [hovered, setHovered] = useState(false);

  const initialRadii = useMemo(() => shapeRadii(initialShape), [initialShape]);
  const targetRadii = useMemo(() => shapeRadii(hoverShape), [hoverShape]);

  // Compute SVG paths for initial and target shape
  const dInitial = useMemo(() => pathFromRadii(initialRadii, size), [initialRadii, size]);
  const dTarget = useMemo(() => pathFromRadii(targetRadii, size), [targetRadii, size]);
  const dMid = useMemo(
    () => pathFromRadii(blendRadii(initialRadii, targetRadii, 0.5), size),
    [initialRadii, targetRadii, size]
  );

  return (
    <motion.div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.94 }}
      transition={springs.fastSpatial}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <motion.path
          d={hovered ? dTarget : dInitial}
          animate={{ d: hovered ? [dInitial, dMid, dTarget] : [dTarget, dMid, dInitial] }}
          transition={springs.spatial}
          fill={fill}
        />
      </svg>
      {children && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </div>
      )}
    </motion.div>
  );
});
