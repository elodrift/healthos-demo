"use client";

import { motion } from "framer-motion";

export function WeightTrend({ series }: { series: number[] }) {
  const w = 320;
  const h = 96;
  const min = Math.min(...series) - 0.5;
  const max = Math.max(...series) + 0.5;
  const points = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-3 h-24 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Weight trending from ${series[0]} to ${series[series.length - 1]} kilograms`}
    >
      <path d={area} fill="rgba(61,220,151,0.12)" />
      <motion.path
        d={line}
        fill="none"
        stroke="#3DDC97"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
        vectorEffect="non-scaling-stroke"
      />
      {points.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="#3DDC97" />
      ))}
    </svg>
  );
}
