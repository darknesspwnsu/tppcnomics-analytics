import { afterEach, describe, expect, it, vi } from "vitest";

import { computeStreakAndXp } from "@/lib/voter";

describe("computeStreakAndXp", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at day 1 streak for a new voter", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T12:00:00.000Z"));

    const result = computeStreakAndXp(null);

    expect(result.streakDays).toBe(1);
    expect(result.xpGain).toBe(11);
    expect(result.nextXp).toBe(11);
    expect(result.nextTotalVotes).toBe(1);

  });

  it("continues streak on consecutive day and increases XP", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T12:00:00.000Z"));

    const result = computeStreakAndXp({
      streakDays: 4,
      lastVotedAt: new Date("2026-02-12T08:00:00.000Z"),
      xp: 200,
      totalVotes: 17,
    });

    expect(result.streakDays).toBe(5);
    expect(result.xpGain).toBe(15);
    expect(result.nextXp).toBe(215);
    expect(result.nextTotalVotes).toBe(18);

  });

  it("resets streak when gap is more than one day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T12:00:00.000Z"));

    const result = computeStreakAndXp({
      streakDays: 8,
      lastVotedAt: new Date("2026-02-10T08:00:00.000Z"),
      xp: 500,
      totalVotes: 60,
    });

    expect(result.streakDays).toBe(1);
    expect(result.xpGain).toBe(11);
    expect(result.nextXp).toBe(511);
    expect(result.nextTotalVotes).toBe(61);

  });
});
