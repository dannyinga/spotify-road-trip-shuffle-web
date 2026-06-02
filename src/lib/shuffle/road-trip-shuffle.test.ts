import { describe, expect, it } from "vitest";
import { roadTripShuffle, type ShuffleTrack } from "./road-trip-shuffle";

/** Build a track quickly for fixtures. */
function track(
  id: string,
  albumId: string,
  trackNumber: number,
  discNumber = 1,
): ShuffleTrack {
  return { id, albumId, discNumber, trackNumber };
}

/** A library of three albums, deliberately interleaved and out of order. */
function sampleLibrary(): ShuffleTrack[] {
  return [
    track("a2", "A", 2),
    track("b1", "B", 1),
    track("a1", "A", 1),
    track("c3", "C", 3),
    track("b2", "B", 2),
    track("c1", "C", 1),
    track("a3", "A", 3),
    track("c2", "C", 2),
  ];
}

describe("roadTripShuffle", () => {
  it("keeps every track from the input", () => {
    const input = sampleLibrary();
    const { tracks } = roadTripShuffle(input, { seed: 1 });
    expect(tracks).toHaveLength(input.length);
    expect(new Set(tracks.map((t) => t.id))).toEqual(
      new Set(input.map((t) => t.id)),
    );
  });

  it("plays each album as a contiguous block (no interleaving)", () => {
    const { tracks } = roadTripShuffle(sampleLibrary(), { seed: 42 });
    // Collapse consecutive tracks into the album they belong to.
    const blocks = tracks
      .map((t) => t.albumId)
      .filter((album, i, arr) => album !== arr[i - 1]);
    // Each album appears exactly once as a block => no album was split.
    expect(blocks).toHaveLength(new Set(blocks).size);
    expect(new Set(blocks)).toEqual(new Set(["A", "B", "C"]));
  });

  it("orders tracks within an album by disc then track number", () => {
    const { tracks } = roadTripShuffle(sampleLibrary(), { seed: 7 });
    const albumA = tracks.filter((t) => t.albumId === "A").map((t) => t.id);
    expect(albumA).toEqual(["a1", "a2", "a3"]);
  });

  it("respects disc number before track number", () => {
    const multiDisc: ShuffleTrack[] = [
      track("d2t1", "D", 1, 2),
      track("d1t2", "D", 2, 1),
      track("d1t1", "D", 1, 1),
      track("d2t2", "D", 2, 2),
    ];
    const { tracks } = roadTripShuffle(multiDisc, { seed: 3 });
    expect(tracks.map((t) => t.id)).toEqual(["d1t1", "d1t2", "d2t1", "d2t2"]);
  });

  it("is deterministic for a given seed", () => {
    const first = roadTripShuffle(sampleLibrary(), { seed: 99 });
    const second = roadTripShuffle(sampleLibrary(), { seed: 99 });
    expect(second.tracks.map((t) => t.id)).toEqual(
      first.tracks.map((t) => t.id),
    );
    expect(second.albumOrder).toEqual(first.albumOrder);
  });

  it("returns the seed it used so a recipe can reproduce the order", () => {
    const auto = roadTripShuffle(sampleLibrary());
    const replay = roadTripShuffle(sampleLibrary(), { seed: auto.seed });
    expect(replay.tracks.map((t) => t.id)).toEqual(
      auto.tracks.map((t) => t.id),
    );
  });

  it("handles an empty playlist", () => {
    const { tracks, albumOrder } = roadTripShuffle([], { seed: 1 });
    expect(tracks).toEqual([]);
    expect(albumOrder).toEqual([]);
  });
});
