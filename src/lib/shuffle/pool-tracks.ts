/**
 * Group-shuffle track pooling
 * ---------------------------
 * Combines several members' contributed playlists into a single track pool for
 * a group ("cabin") shuffle. When the combined size is within `maxTotal`, every
 * track is included. Above the cap, each group is given a share proportional to
 * its `weight` — `floor(maxTotal × weight / totalWeight)` — capped at the number
 * of tracks it actually contributed.
 *
 * Pure and deterministic given its input order, so it can be reasoned about and
 * tested independently of Spotify and the database. The same formula is mirrored
 * in the UI (`app/page.tsx`) to preview each member's share before shuffling.
 */

export interface WeightedTrackGroup<T> {
  /** Relative share weight (1–10 in the app; any positive number works here). */
  weight: number;
  /** This group's contributed tracks, in contribution order. */
  tracks: T[];
}

/**
 * Pool weighted track groups into a single list, capped at `maxTotal` tracks.
 *
 * @param groups   One entry per contributing member. Pass only groups that have
 *                 at least one track (empty groups contribute nothing anyway).
 * @param maxTotal Hard cap on the pooled track count.
 */
export function poolTracksByWeight<T>(
  groups: readonly WeightedTrackGroup<T>[],
  maxTotal: number,
): T[] {
  const totalRaw = groups.reduce((acc, g) => acc + g.tracks.length, 0);

  // Under the cap: include everything, preserving group order.
  if (totalRaw <= maxTotal) {
    return groups.flatMap((g) => g.tracks);
  }

  // Over the cap: give each group a weight-proportional slice of `maxTotal`,
  // never more than it actually contributed.
  const totalWeight = groups.reduce((acc, g) => acc + g.weight, 0);
  const pooled: T[] = [];
  for (const g of groups) {
    const share = totalWeight > 0 ? Math.floor(maxTotal * (g.weight / totalWeight)) : 0;
    const count = Math.min(g.tracks.length, share);
    pooled.push(...g.tracks.slice(0, count));
  }
  return pooled;
}
