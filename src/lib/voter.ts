import type { Voter } from "@prisma/client";

function dayKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeStreakAndXp(
  voter: Pick<Voter, "streakDays" | "lastVotedAt" | "xp" | "totalVotes"> | null,
  now = new Date()
): {
  streakDays: number;
  xpGain: number;
  nextXp: number;
  nextTotalVotes: number;
} {
  const today = dayKeyUtc(now);

  const yesterdayDate = new Date(now);
  yesterdayDate.setUTCDate(now.getUTCDate() - 1);
  const yesterday = dayKeyUtc(yesterdayDate);

  let streakDays = 1;
  if (voter?.lastVotedAt) {
    const last = dayKeyUtc(voter.lastVotedAt);
    if (last === today) streakDays = Math.max(1, voter.streakDays);
    else if (last === yesterday) streakDays = Math.max(1, voter.streakDays + 1);
  }

  const xpGain = 10 + Math.min(streakDays, 7);
  const nextXp = (voter?.xp || 0) + xpGain;
  const nextTotalVotes = (voter?.totalVotes || 0) + 1;

  return { streakDays, xpGain, nextXp, nextTotalVotes };
}
