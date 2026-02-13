import { describe, expect, it } from "vitest";

import { applyEloFromVotes, applyEloFromVotesBundles } from "@/lib/elo";

describe("applyEloFromVotes", () => {
  it("does not move ratings below minimum votes threshold", () => {
    const result = applyEloFromVotes({
      leftScore: 1500,
      rightScore: 1500,
      votesLeft: 1,
      votesRight: 0,
      minVotes: 5,
    });

    expect(result.affectsScore).toBe(false);
    expect(result.leftScore).toBe(1500);
    expect(result.rightScore).toBe(1500);
  });

  it("updates both ratings when threshold is met", () => {
    const result = applyEloFromVotes({
      leftScore: 1500,
      rightScore: 1500,
      votesLeft: 7,
      votesRight: 3,
      minVotes: 1,
    });

    expect(result.affectsScore).toBe(true);
    expect(result.leftScore).toBeGreaterThan(1500);
    expect(result.rightScore).toBeLessThan(1500);
  });
});

describe("applyEloFromVotesBundles", () => {
  it("distributes team delta across multi-asset sides", () => {
    const result = applyEloFromVotesBundles({
      leftScores: [1500, 1520],
      rightScores: [1510],
      votesLeft: 12,
      votesRight: 5,
      minVotes: 1,
    });

    expect(result.affectsScore).toBe(true);
    expect(result.leftScores).toHaveLength(2);
    expect(result.rightScores).toHaveLength(1);
    expect(result.leftScores[0]).toBeGreaterThan(1500);
    expect(result.leftScores[1]).toBeGreaterThan(1520);
    expect(result.rightScores[0]).toBeLessThan(1510);
  });
});
