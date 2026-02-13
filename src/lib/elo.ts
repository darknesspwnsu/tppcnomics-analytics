export type EloResult = "left" | "right" | "tie";

export type EloUpdate = {
  leftScore: number;
  rightScore: number;
  totalVotes: number;
  result: EloResult;
  affectsScore: boolean;
  kFactor: number;
};

export type BundleEloUpdate = EloUpdate & {
  leftScores: number[];
  rightScores: number[];
  leftTeamScore: number;
  rightTeamScore: number;
};

export type ApplyEloInput = {
  leftScore: number;
  rightScore: number;
  votesLeft: number;
  votesRight: number;
  minVotes?: number;
};

export type ApplyBundleEloInput = {
  leftScores: number[];
  rightScores: number[];
  votesLeft: number;
  votesRight: number;
  minVotes?: number;
};

function toFiniteScore(score: number, fallback = 1500): number {
  const n = Number(score);
  return Number.isFinite(n) ? n : fallback;
}

function scoreToQ(score: number): number {
  return 10 ** (toFiniteScore(score) / 400);
}

export function applyEloFromVotes({
  leftScore,
  rightScore,
  votesLeft,
  votesRight,
  minVotes = 1,
}: ApplyEloInput): EloUpdate {
  const lScore = toFiniteScore(leftScore);
  const rScore = toFiniteScore(rightScore);
  const leftVotes = Math.max(0, Number(votesLeft) || 0);
  const rightVotes = Math.max(0, Number(votesRight) || 0);
  const totalVotes = leftVotes + rightVotes;

  const result: EloResult = leftVotes > rightVotes ? "left" : leftVotes < rightVotes ? "right" : "tie";

  if (totalVotes < Math.max(1, Number(minVotes) || 1)) {
    return {
      leftScore: lScore,
      rightScore: rScore,
      totalVotes,
      result,
      affectsScore: false,
      kFactor: 0,
    };
  }

  const expectedLeft = 1 / (1 + 10 ** ((rScore - lScore) / 400));
  const expectedRight = 1 - expectedLeft;
  const actualLeft = leftVotes / totalVotes;
  const actualRight = rightVotes / totalVotes;
  const kFactor = 24 * Math.min(2, Math.sqrt(totalVotes / 5));

  return {
    leftScore: Number((lScore + kFactor * (actualLeft - expectedLeft)).toFixed(4)),
    rightScore: Number((rScore + kFactor * (actualRight - expectedRight)).toFixed(4)),
    totalVotes,
    result,
    affectsScore: true,
    kFactor,
  };
}

export function applyEloFromVotesBundles({
  leftScores,
  rightScores,
  votesLeft,
  votesRight,
  minVotes = 1,
}: ApplyBundleEloInput): BundleEloUpdate {
  const safeLeft = (Array.isArray(leftScores) ? leftScores : []).map((score) => toFiniteScore(score));
  const safeRight = (Array.isArray(rightScores) ? rightScores : []).map((score) => toFiniteScore(score));

  const leftList = safeLeft.length ? safeLeft : [1500];
  const rightList = safeRight.length ? safeRight : [1500];

  const leftQ = leftList.map(scoreToQ);
  const rightQ = rightList.map(scoreToQ);
  const leftQSum = leftQ.reduce((total, value) => total + value, 0);
  const rightQSum = rightQ.reduce((total, value) => total + value, 0);

  const leftTeamScore = 400 * Math.log10(leftQSum);
  const rightTeamScore = 400 * Math.log10(rightQSum);

  const team = applyEloFromVotes({
    leftScore: leftTeamScore,
    rightScore: rightTeamScore,
    votesLeft,
    votesRight,
    minVotes,
  });

  if (!team.affectsScore) {
    return {
      ...team,
      leftScores: leftList,
      rightScores: rightList,
      leftTeamScore: Number(leftTeamScore.toFixed(4)),
      rightTeamScore: Number(rightTeamScore.toFixed(4)),
    };
  }

  const leftTeamDelta = Number(team.leftScore) - leftTeamScore;
  const rightTeamDelta = Number(team.rightScore) - rightTeamScore;

  const nextLeft = leftList.map((score, idx) =>
    Number((score + leftTeamDelta * (leftQ[idx] / leftQSum)).toFixed(4))
  );
  const nextRight = rightList.map((score, idx) =>
    Number((score + rightTeamDelta * (rightQ[idx] / rightQSum)).toFixed(4))
  );

  return {
    ...team,
    leftScores: nextLeft,
    rightScores: nextRight,
    leftTeamScore: Number(leftTeamScore.toFixed(4)),
    rightTeamScore: Number(rightTeamScore.toFixed(4)),
  };
}
