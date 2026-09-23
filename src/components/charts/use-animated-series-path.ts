"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LINE_LOADING_PULSE_EASE } from "./line-loading-timing";
import {
  computeSeriesPathPoints,
  interpolateSeriesPathPoints,
  type SeriesPathPoint,
  seriesPathFromPoints,
  seriesPathTransitionSignature,
} from "./series-path-utils";

// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

export interface UseAnimatedSeriesPathOptions {
  renderData: Record<string, unknown>[];
  xAccessor: (datum: Record<string, unknown>) => Date;
  xScale: (value: Date) => number | undefined;
  yScale: (value: number) => number | undefined;
  dataKey: string;
  curve: CurveFactory;
  chartPhase: string;
  durationMs: number;
  innerWidth: number;
  enabled: boolean;
}

export function useAnimatedSeriesPath({
  renderData,
  xAccessor,
  xScale,
  yScale,
  dataKey,
  curve,
  chartPhase,
  durationMs,
  innerWidth,
  enabled,
}: UseAnimatedSeriesPathOptions) {
  const reducedMotion = useReducedMotion();
  const [animatedPoints, setAnimatedPoints] = useState<
    SeriesPathPoint[] | null
  >(null);
  const displayedPointsRef = useRef<SeriesPathPoint[] | null>(null);
  const animatingRef = useRef(false);

  const xScaleDomain = useMemo(() => {
    const scaleWithDomain = xScale as { domain?: () => [Date, Date] };
    return scaleWithDomain.domain?.() ?? [new Date(0), new Date(0)];
  }, [xScale]);

  const transitionSignature = useMemo(
    () =>
      seriesPathTransitionSignature({
        renderData,
        xAccessor,
        dataKey,
        innerWidth,
        xDomainMin: xScaleDomain[0]?.getTime?.() ?? 0,
        xDomainMax: xScaleDomain[1]?.getTime?.() ?? 0,
      }),
    [renderData, xAccessor, dataKey, innerWidth, xScaleDomain]
  );

  const targetPoints = useMemo(
    () =>
      computeSeriesPathPoints(renderData, xAccessor, xScale, yScale, dataKey),
    [renderData, xAccessor, xScale, yScale, dataKey]
  );

  const prevTransitionSignatureRef = useRef(transitionSignature);

  // Latest geometry for the running tween. The y-domain tweens alongside a data
  // change, so scales change every frame; reading them through refs keeps the
  // morph running instead of restarting (and stalling) it on each frame.
  const geometryRef = useRef({ renderData, xAccessor, xScale, yScale, dataKey });
  geometryRef.current = { renderData, xAccessor, xScale, yScale, dataKey };
  const targetPointsRef = useRef(targetPoints);
  targetPointsRef.current = targetPoints;

  useEffect(() => {
    if (!animatingRef.current) {
      displayedPointsRef.current = targetPoints;
    }
  }, [targetPoints]);

  const shouldAnimate =
    enabled &&
    !reducedMotion &&
    chartPhase === "ready" &&
    durationMs > 0 &&
    renderData.length > 0;

  useEffect(() => {
    if (!shouldAnimate) {
      animatingRef.current = false;
      setAnimatedPoints(null);
      displayedPointsRef.current = targetPointsRef.current;
      prevTransitionSignatureRef.current = transitionSignature;
      return;
    }

    if (prevTransitionSignatureRef.current === transitionSignature) {
      return;
    }
    prevTransitionSignatureRef.current = transitionSignature;

    const fromPoints = displayedPointsRef.current ?? targetPointsRef.current;
    if (fromPoints.length === 0) {
      displayedPointsRef.current = targetPointsRef.current;
      setAnimatedPoints(null);
      return;
    }

    animatingRef.current = true;
    const fromSnapshot = fromPoints;

    const control = animate(0, 1, {
      duration: durationMs / 1000,
      ease: [...LINE_LOADING_PULSE_EASE],
      onUpdate: (progress) => {
        const g = geometryRef.current;
        const currentTarget = computeSeriesPathPoints(
          g.renderData,
          g.xAccessor,
          g.xScale,
          g.yScale,
          g.dataKey
        );
        const next = interpolateSeriesPathPoints(
          fromSnapshot,
          currentTarget,
          progress
        );
        displayedPointsRef.current = next;
        setAnimatedPoints(next);
      },
      onComplete: () => {
        animatingRef.current = false;
        displayedPointsRef.current = targetPointsRef.current;
        setAnimatedPoints(null);
      },
    });

    return () => {
      control.stop();
      animatingRef.current = false;
    };
  }, [transitionSignature, shouldAnimate, durationMs]);

  const activePoints = animatedPoints ?? targetPoints;
  const pathD = useMemo(
    () => seriesPathFromPoints(activePoints, curve),
    [activePoints, curve]
  );

  return {
    pathD,
    isPathAnimating: animatedPoints != null,
  };
}
