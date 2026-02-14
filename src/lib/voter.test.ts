import { describe, expect, it } from "vitest";

import { computeStreakAndXp } from "@/lib/voter";

describe("computeStreakAndXp", () => {
  it("starts at day 1 streak for a new voter", () => {
    const now = new Date("2026-02-13T12:00:00.000Z");

    const result = computeStreakAndXp(null, now);

    expect(result.streakDays).toBe(1);
    expect(result.xpGain).toBe(11);
    expect(result.nextXp).toBe(11);
    expect(result.nextTotalVotes).toBe(1);
  });

  it("continues streak on consecutive day and increases XP", () => {
    const now = new Date("2026-02-13T12:00:00.000Z");

    const result = computeStreakAndXp({
      streakDays: 4,
      lastVotedAt: new Date("2026-02-12T08:00:00.000Z"),
      xp: 200,
      totalVotes: 17,
    }, now);

    expect(result.streakDays).toBe(5);
    expect(result.xpGain).toBe(15);
    expect(result.nextXp).toBe(215);
    expect(result.nextTotalVotes).toBe(18);
  });

  it("resets streak when gap is more than one day", () => {
    const now = new Date("2026-02-13T12:00:00.000Z");

    const result = computeStreakAndXp({
      streakDays: 8,
      lastVotedAt: new Date("2026-02-10T08:00:00.000Z"),
      xp: 500,
      totalVotes: 60,
    }, now);

    expect(result.streakDays).toBe(1);
    expect(result.xpGain).toBe(11);
    expect(result.nextXp).toBe(511);
    expect(result.nextTotalVotes).toBe(61);
  });

  it("keeps streak unchanged for additional votes on the same UTC day", () => {
    const now = new Date("2026-02-13T22:59:00.000Z");

    const result = computeStreakAndXp({
      streakDays: 7,
      lastVotedAt: new Date("2026-02-13T00:15:00.000Z"),
      xp: 900,
      totalVotes: 99,
    }, now);

    expect(result.streakDays).toBe(7);
    expect(result.xpGain).toBe(17);
    expect(result.nextXp).toBe(917);
    expect(result.nextTotalVotes).toBe(100);
  });
});
