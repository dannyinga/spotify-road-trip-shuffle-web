/**
 * Road Trip Shuffle
 * -----------------
 * Emulates loading a stack of CDs into a car changer: each album plays in its
 * real running order (disc, then track), but the *albums* are shuffled. So you
 * hear a whole record start-to-finish, then jump to a different record.
 *
 * The shuffle is deterministic given a `seed`, so a saved "recipe" can
 * reproduce the exact same ordering later. Omit the seed for a fresh random
 * arrangement.
 */

/** Minimal track shape this module needs. Extra fields are preserved as-is. */
export interface ShuffleTrack {
  /** Stable identifier (Spotify track id or uri). */
  id: string;
  /** Album this track belongs to (Spotify album id). */
  albumId: string;
  /** 1-based disc number within the album. */
  discNumber: number;
  /** 1-based track number within the disc. */
  trackNumber: number;
}

export interface RoadTripShuffleOptions {
  /**
   * Seed for reproducible shuffles. Same seed + same input album set => same
   * ordering. When omitted, a random seed is used.
   */
  seed?: number;
}

export interface RoadTripShuffleResult<T extends ShuffleTrack> {
  /** Tracks in road-trip order: albums shuffled, songs within an album ordered. */
  tracks: T[];
  /** The seed actually used — persist this to reproduce the ordering. */
  seed: number;
  /** Album ids in their shuffled play order. */
  albumOrder: string[];
}

/**
 * Small, fast, seedable PRNG (mulberry32). Good enough for shuffling a
 * playlist; not for cryptography.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-place Fisher–Yates using the supplied RNG. */
function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/**
 * Group tracks by album (preserving first-appearance order), sort each album's
 * tracks into CD running order, shuffle the album groups, then flatten.
 *
 * Determinism note: album groups are seeded in first-appearance order before
 * shuffling, so the result depends only on (input order, seed) — not on object
 * identity or Map internals.
 */
export function roadTripShuffle<T extends ShuffleTrack>(
  tracks: readonly T[],
  options: RoadTripShuffleOptions = {},
): RoadTripShuffleResult<T> {
  const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = mulberry32(seed);

  // Group by album, remembering the order albums first appear.
  const groups = new Map<string, T[]>();
  for (const track of tracks) {
    const group = groups.get(track.albumId);
    if (group) {
      group.push(track);
    } else {
      groups.set(track.albumId, [track]);
    }
  }

  // Each album plays in CD order: disc first, then track within disc.
  for (const group of groups.values()) {
    group.sort(
      (a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber,
    );
  }

  // Shuffle the albums (not the songs).
  const albumOrder = [...groups.keys()];
  shuffleInPlace(albumOrder, rng);

  const ordered = albumOrder.flatMap((albumId) => groups.get(albumId) ?? []);

  return { tracks: ordered, seed, albumOrder };
}
