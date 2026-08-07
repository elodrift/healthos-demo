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

import { MealPhotoUpload } from "./meal-photo-upload";
import { MealsToday } from "./meals-today";

export function LogPanel() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <MealPhotoUpload onLogged={() => setRefreshKey((n) => n + 1)} />
      <MealsToday refreshKey={refreshKey} />
    </>
  );
}
