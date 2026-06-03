import { describe, expect, it } from "vitest";
import { poolTracksByWeight, type WeightedTrackGroup } from "./pool-tracks";

/** Build a group of `n` string tracks labelled `<prefix>0..n-1`. */
function group(weight: number, prefix: string, n: number): WeightedTrackGroup<string> {
  return {
    weight,
    tracks: Array.from({ length: n }, (_, i) => `${prefix}${i}`),
  };
}

describe("poolTracksByWeight", () => {
  it("includes every track when the total is within the cap", () => {
    const groups = [group(1, "a", 3), group(5, "b", 2)];
    const pooled = poolTracksByWeight(groups, 1000);
    expect(pooled).toEqual(["a0", "a1", "a2", "b0", "b1"]);
  });

  it("returns the total at exactly the cap (boundary is inclusive)", () => {
    const groups = [group(1, "a", 6), group(1, "b", 4)];
    const pooled = poolTracksByWeight(groups, 10);
    expect(pooled).toHaveLength(10);
  });

  it("splits proportionally by weight when over the cap", () => {
    // 200 + 200 tracks, cap 100, weights 3:1 -> 75 and 25.
    const groups = [group(3, "a", 200), group(1, "b", 200)];
    const pooled = poolTracksByWeight(groups, 100);
    expect(pooled.filter((t) => t.startsWith("a"))).toHaveLength(75);
    expect(pooled.filter((t) => t.startsWith("b"))).toHaveLength(25);
  });

  it("takes a group's tracks from the front (contribution order)", () => {
    const groups = [group(1, "a", 200), group(1, "b", 200)];
    const pooled = poolTracksByWeight(groups, 100);
    const aTracks = pooled.filter((t) => t.startsWith("a"));
    expect(aTracks[0]).toBe("a0");
    expect(aTracks).toEqual(aTracks.slice().sort((x, y) =>
      Number(x.slice(1)) - Number(y.slice(1))));
  });

  it("never gives a group more than it contributed", () => {
    // Heavy weight but only 10 tracks; share would be ~90 but capped at 10.
    const groups = [group(9, "a", 10), group(1, "b", 2000)];
    const pooled = poolTracksByWeight(groups, 1000);
    expect(pooled.filter((t) => t.startsWith("a"))).toHaveLength(10);
  });

  it("returns fewer than the cap when flooring loses fractional shares", () => {
    // Three equal groups, cap 100: floor(100/3)=33 each -> 99 total.
    const groups = [group(1, "a", 100), group(1, "b", 100), group(1, "c", 100)];
    const pooled = poolTracksByWeight(groups, 100);
    expect(pooled).toHaveLength(99);
  });

  it("handles an empty input", () => {
    expect(poolTracksByWeight([], 1000)).toEqual([]);
  });

  it("does not divide by zero when all weights are zero (over cap)", () => {
    const groups = [group(0, "a", 800), group(0, "b", 800)];
    const pooled = poolTracksByWeight(groups, 1000);
    // No group can claim a share, so nothing is pooled — but it must not throw.
    expect(pooled).toEqual([]);
  });
});
