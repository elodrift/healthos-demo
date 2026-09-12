"use client";

import { useState } from "react";

import { Dashboard } from "./_components/Dashboard";
import type { Confirmation, Deviation, Ledger } from "@/src/engine/derive-plan";

const MORNING = new Date("2026-09-10T06:00:00");

export default function Home() {
  const [ledger, setLedger] = useState<Ledger>([]);
  const [now, setNow] = useState(MORNING);

  const appendToLedger = (row: Confirmation | Deviation) => {
    setLedger((prev) => [...prev, row]);
  };

  return (
    <Dashboard
      ledger={ledger}
      now={now}
      onAppend={appendToLedger}
      onNowChange={setNow}
    />
  );
}
