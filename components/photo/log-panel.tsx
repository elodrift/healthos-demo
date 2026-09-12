"use client";

/**
 * Owns the one piece of state the upload and the list have to agree on.
 *
 * Both are client components and the page is a server component, so the
 * "a meal was just saved" signal has to live in a client boundary that wraps
 * them both. Without it the list would keep showing the pre-write total and the
 * user would reasonably conclude the save had failed.
 */

import { useState } from "react";

import { BarcodeEntry } from "./barcode-entry";
import { MealPhotoUpload } from "./meal-photo-upload";
import { MealsToday } from "./meals-today";

export function LogPanel() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((n) => n + 1);

  return (
    <>
      <MealPhotoUpload onLogged={bump} />
      {/*
        Below the photo flow, not above it: the photo is the common path, and a
        barcode only exists for packaged food. Both write to the same list.
      */}
      <BarcodeEntry onLogged={bump} />
      <MealsToday refreshKey={refreshKey} />
    </>
  );
}
