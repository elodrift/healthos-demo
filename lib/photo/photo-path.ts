/**
 * Blob pathname layout for meal photos.
 *
 * Upload writes to this prefix and delivery checks it, so the two must agree.
 * It lives in a plain module rather than in either route because App Router
 * route files may only export a fixed set of fields — exporting a shared
 * constant from a route fails the build (see CLAUDE.md §2.7).
 */
export function mealPhotoPrefix(userId: string): string {
  return `meal-photos/${userId}/`;
}
