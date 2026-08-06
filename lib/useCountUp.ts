"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

/** Cause -> effect must be FELT (DEMO_SPEC.md §1.6.1): numbers count, never snap. */
export function useCountUp(value: number, durationMs = 450) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: setDisplay,
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, durationMs]);

  return display;
}
