"use client";

import { memo, useId, useMemo } from "react";
import { resolveDashStartX, resolveDashTailBounds } from "./path-stroke-utils";

interface Section {
  x1: number;
  x2: number;
  kind: "solid" | "gap" | "tail";
}

interface SeriesGapStrokeProps {
  /** `[from, to]` data-index pairs whose stretch is drawn dotted (no data there). */
  gapSegments: [number, number][];
  gapDashArray: string;
  dashFromIndex?: number;
  dashArray: string;
  data: Record<string, unknown>[];
  pathD: string | null;
  innerWidth: number;
  innerHeight: number;
  stroke: string;
  strokeWidth: number;
  xScale: (value: Date | number) => number | undefined;
  xAccessor: (datum: Record<string, unknown>) => Date | number;
}

/**
 * Draws the series path in x-clipped sections: solid where there is data,
 * dotted across gaps, and dashed from `dashFromIndex` on (projection tail).
 * Clipping by x keeps every section on the same smooth curve.
 */
function SeriesGapStrokeImpl({
  gapSegments,
  gapDashArray,
  dashFromIndex,
  dashArray,
  data,
  pathD,
  innerWidth,
  innerHeight,
  stroke,
  strokeWidth,
  xScale,
  xAccessor,
}: SeriesGapStrokeProps) {
  const clipId = useId().replace(/:/g, "");
  const pad = strokeWidth * 2;

  const sections = useMemo(() => {
    const xAt = (index: number) => xScale(xAccessor(data[index])) ?? 0;
    const end = resolveDashTailBounds(dashFromIndex, data.length)
      ? resolveDashStartX(data, dashFromIndex as number, xScale, xAccessor)
      : innerWidth + pad;
    const out: Section[] = [];
    let cursor = -pad;
    for (const [from, to] of gapSegments) {
      if (!data[from] || !data[to]) continue;
      const x1 = xAt(from);
      const x2 = Math.min(xAt(to), end);
      if (x1 >= end || x2 <= x1) continue;
      if (x1 > cursor) out.push({ x1: cursor, x2: x1, kind: "solid" });
      out.push({ x1, x2, kind: "gap" });
      cursor = x2;
    }
    if (end > cursor) out.push({ x1: cursor, x2: end, kind: "solid" });
    if (end < innerWidth + pad)
      out.push({ x1: end, x2: innerWidth + pad, kind: "tail" });
    return out;
  }, [gapSegments, dashFromIndex, data, xScale, xAccessor, innerWidth, pad]);

  if (!pathD) return null;

  return (
    <>
      <defs>
        {sections.map((s, i) => (
          <clipPath id={`${clipId}-${i}`} key={`${s.x1}-${s.kind}`}>
            <rect
              height={innerHeight + pad * 2}
              width={Math.max(0, s.x2 - s.x1)}
              x={s.x1}
              y={-pad}
            />
          </clipPath>
        ))}
      </defs>
      {sections.map((s, i) => (
        <path
          clipPath={`url(#${clipId}-${i})`}
          d={pathD}
          fill="none"
          key={`${s.x1}-${s.kind}`}
          stroke={stroke}
          strokeDasharray={
            s.kind === "gap"
              ? gapDashArray
              : s.kind === "tail"
                ? dashArray
                : undefined
          }
          strokeLinecap="round"
          strokeOpacity={s.kind === "gap" ? 0.6 : undefined}
          strokeWidth={strokeWidth}
        />
      ))}
    </>
  );
}

export const SeriesGapStroke = memo(SeriesGapStrokeImpl);
