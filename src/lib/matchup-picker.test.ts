import { describe, expect, it } from "vitest";

import { pickRandomOffset, pickWeightedBucket } from "@/lib/matchup-picker";

describe("pickWeightedBucket", () => {
  it("returns null when no candidates exist", () => {
    expect(pickWeightedBucket(0, 0, 2, () => 0.2)).toBeNull();
  });

  it("falls back to the only populated bucket", () => {
    expect(pickWeightedBucket(3, 0, 2, () => 0.8)).toBe("featured");
    expect(pickWeightedBucket(0, 4, 2, () => 0.1)).toBe("normal");
  });

  it("applies featured weighting", () => {
    // featured mass = 2*2 = 4, normal mass = 3, total = 7
    expect(pickWeightedBucket(2, 3, 2, () => 0.0)).toBe("featured");
    expect(pickWeightedBucket(2, 3, 2, () => 0.56)).toBe("featured"); // floor(3.92)=3
    expect(pickWeightedBucket(2, 3, 2, () => 0.58)).toBe("normal"); // floor(4.06)=4
  });
});

describe("pickRandomOffset", () => {
  it("returns null for empty candidate counts", () => {
    expect(pickRandomOffset(0, () => 0.2)).toBeNull();
    expect(pickRandomOffset(-10, () => 0.2)).toBeNull();
  });

  it("returns bounded offsets", () => {
    expect(pickRandomOffset(5, () => 0)).toBe(0);
    expect(pickRandomOffset(5, () => 0.6)).toBe(3);
    expect(pickRandomOffset(5, () => 0.9999)).toBe(4);
  });
});
