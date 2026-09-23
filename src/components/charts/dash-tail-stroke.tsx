"use client";

import { useId } from "react";

export interface DashTailStrokeProps {
  /** SVG path `d` for the full series (single curved path). */
  pathD: string | null;
  /** Total length of `pathD` in user units. */
  pathLength: number;
  /** Path length at which the dashed tail begins. */
  dashStartLength: number;
  /** X coordinate (chart inner space) where the tail clip begins. */
  dashStartX: number;
  innerWidth: number;
  innerHeight: number;
  /** Stroke paint — solid color or gradient url. */
  stroke: string;
  strokeWidth: number;
  dashArray: string;
}

export function DashTailStroke({
  pathD,
  pathLength,
  dashStartLength,
  dashStartX,
  innerWidth,
  innerHeight,
  stroke,
  strokeWidth,
  dashArray,
}: DashTailStrokeProps) {
  const clipPathId = useId().replace(/:/g, "");
  const headClipId = `${clipPathId}-head`;

  if (!pathD || pathLength <= 0 || dashStartLength >= pathLength) {
    return null;
  }

  const pad = strokeWidth * 2;
  const tailWidth = Math.max(0, innerWidth - dashStartX + pad);

  return (
    <>
      <defs>
        <clipPath id={clipPathId}>
          <rect
            height={innerHeight + pad}
            width={tailWidth}
            x={dashStartX - strokeWidth}
            y={-strokeWidth}
          />
        </clipPath>
        {/* Clip the head by x rather than by path length so unevenly spaced
            data (e.g. irregular sessions followed by weekly forecasts) splits
            exactly at the dash start. */}
        <clipPath id={headClipId}>
          <rect
            height={innerHeight + pad * 2}
            width={Math.max(0, dashStartX + pad)}
            x={-pad}
            y={-pad}
          />
        </clipPath>
      </defs>
      {/* Solid head — same curved path, gradient/fade preserved */}
      <path
        clipPath={`url(#${headClipId})`}
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
      {/* Dashed tail — clipped to x ≥ dashStartX so dashes follow the curve */}
      <path
        clipPath={`url(#${clipPathId})`}
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </>
  );
}
