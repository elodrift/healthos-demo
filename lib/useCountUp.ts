"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/**
 * Cause -> effect must be FELT (DEMO_SPEC.md §1.6.1): numbers count, never snap.
 *
 * Unless the reader has asked for reduced motion — then the value lands
 * immediately. The old and new numbers are still shown side by side on the
 * revision card, so the story survives without the tween.
 */
export function useCountUp(value: number, durationMs = 450) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      prev.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(prev.current, value, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: setDisplay,
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, durationMs, reduceMotion]);

  return display;
}
