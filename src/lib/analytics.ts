import { prisma } from "@/lib/prisma";
import { labelFromAssetKey, normalizeGenderLabel } from "@/lib/pair-key";

const TREND_DAYS = 30;
const HEATMAP_LOOKBACK_DAYS = 28;
const MOVER_LOOKBACK_HOURS = 72;
const UPSET_LOOKBACK_DAYS = 14;

type CountValue = bigint | number | string;

type TrendRow = {
  day: Date;
  total_votes: CountValue;
  decisive_votes: CountValue;
  skips: CountValue;
  unique_voters: CountValue;
};

type HeatmapRow = {
  dow: number;
  hour: number;
  votes: CountValue;
};

type RecentPerformanceRow = {
  asset_id: string;
  matches: CountValue;
  wins: CountValue;
};

type UpsetCandidateRow = {
  vote_id: string;
  pair_key: string;
  selected_side: "LEFT" | "RIGHT";
  created_at: Date;
  left_label: string;
  right_label: string;
  left_elo: number | null;
  right_elo: number | null;
};

export type AnalyticsSnapshot = {
  generatedAt: string;
  summary: {
    totalVotes: number;
    decisiveVotes: number;
    skipVotes: number;
    votesLast24h: number;
    decisiveLast24h: number;
    uniqueVoters: number;
    activeAssets: number;
    activePairs: number;
    scoredAssets: number;
  };
  trend: Array<{
    date: string;
    totalVotes: number;
    decisiveVotes: number;
    skips: number;
    uniqueVoters: number;
    trailingDecisive7d: number;
  }>;
  heatmap: {
    maxVotes: number;
    days: Array<{
      dayIndex: number;
      dayLabel: string;
      cells: Array<{
        hour: number;
        votes: number;
        intensity: number;
      }>;
    }>;
  };
  leaderboard: Array<{
    assetId: string;
    key: string;
    label: string;
    tier: string | null;
    elo: number;
    pollsCount: number;
    winRate: number;
    votesFor: number;
    votesAgainst: number;
    lastPollAt: string | null;
  }>;
  movers: Array<{
    assetId: string;
    key: string;
    label: string;
    tier: string | null;
    elo: number;
    recentMatches: number;
    recentWinRate: number;
    baselineWinRate: number;
    deltaWinRate: number;
    momentumScore: number;
    projectedEloMove: number;
    direction: "UP" | "DOWN" | "FLAT";
  }>;
  ratingOutliers: Array<{
    assetId: string;
    key: string;
    label: string;
    elo: number;
    pollsCount: number;
    winRate: number;
    zScore: number;
  }>;
  upsets: Array<{
    voteId: string;
    pairKey: string;
    createdAt: string;
    winnerLabel: string;
    loserLabel: string;
    winnerElo: number;
    loserElo: number;
    upsetDelta: number;
  }>;
};

function toNumber(value: CountValue): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDay(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function round(value: number, precision = 3): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function safeRate(numerator: number, denominator: number, fallback = 0): number {
  if (denominator <= 0) return fallback;
  return numerator / denominator;
}

function stddev(values: number[]): { mean: number; std: number } {
  if (!values.length) return { mean: 0, std: 0 };

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => {
      const delta = value - mean;
      return sum + delta * delta;
    }, 0) / values.length;

  return {
    mean,
    std: Math.sqrt(Math.max(variance, 0)),
  };
}

export async function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalVotes,
    decisiveVotes,
    skipVotes,
    votesLast24h,
    decisiveLast24h,
    uniqueVoters,
    activeAssets,
    activePairs,
    allScores,
    trendRows,
    heatmapRows,
    recentPerformanceRows,
    upsetCandidates,
  ] = await Promise.all([
    prisma.voteEvent.count(),
    prisma.voteEvent.count({
      where: {
        selectedSide: {
          in: ["LEFT", "RIGHT"],
        },
      },
    }),
    prisma.voteEvent.count({ where: { selectedSide: "SKIP" } }),
    prisma.voteEvent.count({ where: { createdAt: { gte: since24h } } }),
    prisma.voteEvent.count({
      where: {
        createdAt: { gte: since24h },
        selectedSide: {
          in: ["LEFT", "RIGHT"],
        },
      },
    }),
    prisma.voter.count(),
    prisma.asset.count({ where: { active: true } }),
    prisma.votingPair.count({ where: { active: true } }),
    prisma.assetScore.findMany({
      include: {
        asset: {
          select: {
            id: true,
            key: true,
            label: true,
            tier: true,
            active: true,
          },
        },
      },
      orderBy: { elo: "desc" },
    }),
    prisma.$queryRaw<TrendRow[]>`
      SELECT
        date_trunc('day', "createdAt") AS day,
        COUNT(*)::bigint AS total_votes,
        COUNT(*) FILTER (WHERE "selectedSide" IN ('LEFT', 'RIGHT'))::bigint AS decisive_votes,
        COUNT(*) FILTER (WHERE "selectedSide" = 'SKIP')::bigint AS skips,
        COUNT(DISTINCT "voterId")::bigint AS unique_voters
      FROM "VoteEvent"
      WHERE "createdAt" >= NOW() - (${TREND_DAYS} * INTERVAL '1 day')
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<HeatmapRow[]>`
      SELECT
        EXTRACT(DOW FROM "createdAt")::int AS dow,
        EXTRACT(HOUR FROM "createdAt")::int AS hour,
        COUNT(*) FILTER (WHERE "selectedSide" IN ('LEFT', 'RIGHT'))::bigint AS votes
      FROM "VoteEvent"
      WHERE "createdAt" >= NOW() - (${HEATMAP_LOOKBACK_DAYS} * INTERVAL '1 day')
      GROUP BY 1, 2
      ORDER BY 1, 2
    `,
    prisma.$queryRaw<RecentPerformanceRow[]>`
      WITH side_results AS (
        SELECT
          "leftAssetId" AS asset_id,
          CASE WHEN "selectedSide" = 'LEFT' THEN 1 ELSE 0 END AS win
        FROM "VoteEvent"
        WHERE "createdAt" >= NOW() - (${MOVER_LOOKBACK_HOURS} * INTERVAL '1 hour')
          AND "selectedSide" IN ('LEFT', 'RIGHT')

        UNION ALL

        SELECT
          "rightAssetId" AS asset_id,
          CASE WHEN "selectedSide" = 'RIGHT' THEN 1 ELSE 0 END AS win
        FROM "VoteEvent"
        WHERE "createdAt" >= NOW() - (${MOVER_LOOKBACK_HOURS} * INTERVAL '1 hour')
          AND "selectedSide" IN ('LEFT', 'RIGHT')
      )
      SELECT
        asset_id,
        COUNT(*)::bigint AS matches,
        SUM(win)::bigint AS wins
      FROM side_results
      GROUP BY asset_id
    `,
    prisma.$queryRaw<UpsetCandidateRow[]>`
      SELECT
        ve.id AS vote_id,
        ve."pairKey" AS pair_key,
        ve."selectedSide" AS selected_side,
        ve."createdAt" AS created_at,
        left_asset.label AS left_label,
        right_asset.label AS right_label,
        left_score.elo AS left_elo,
        right_score.elo AS right_elo
      FROM "VoteEvent" ve
      INNER JOIN "Asset" left_asset
        ON left_asset.id = ve."leftAssetId"
      INNER JOIN "Asset" right_asset
        ON right_asset.id = ve."rightAssetId"
      LEFT JOIN "AssetScore" left_score
        ON left_score."assetId" = ve."leftAssetId"
      LEFT JOIN "AssetScore" right_score
        ON right_score."assetId" = ve."rightAssetId"
      WHERE ve."createdAt" >= NOW() - (${UPSET_LOOKBACK_DAYS} * INTERVAL '1 day')
        AND ve."selectedSide" IN ('LEFT', 'RIGHT')
      ORDER BY ve."createdAt" DESC
      LIMIT 800
    `,
  ]);

  const scoreByAssetId = new Map(allScores.map((score) => [score.assetId, score]));

  const leaderboard = allScores.slice(0, 12).map((score) => {
    const decisivePolls = score.wins + score.losses;
    return {
      assetId: score.assetId,
      key: score.asset.key,
      label: labelFromAssetKey(score.asset.key),
      tier: score.asset.tier,
      elo: round(score.elo, 2),
      pollsCount: score.pollsCount,
      winRate: round(safeRate(score.wins, decisivePolls, 0.5), 4),
      votesFor: score.votesFor,
      votesAgainst: score.votesAgainst,
      lastPollAt: score.lastPollAt ? score.lastPollAt.toISOString() : null,
    };
  });

  const trendByDay = new Map(
    trendRows.map((row) => [
      toIsoDay(row.day),
      {
        totalVotes: toNumber(row.total_votes),
        decisiveVotes: toNumber(row.decisive_votes),
        skips: toNumber(row.skips),
        uniqueVoters: toNumber(row.unique_voters),
      },
    ])
  );

  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  trendStart.setUTCDate(trendStart.getUTCDate() - (TREND_DAYS - 1));

  const trend = Array.from({ length: TREND_DAYS }, (_, index) => {
    const currentDay = new Date(trendStart.getTime());
    currentDay.setUTCDate(trendStart.getUTCDate() + index);
    const dayKey = toIsoDay(currentDay);
    const stats = trendByDay.get(dayKey) || {
      totalVotes: 0,
      decisiveVotes: 0,
      skips: 0,
      uniqueVoters: 0,
    };

    return {
      date: dayKey,
      ...stats,
      trailingDecisive7d: 0,
    };
  });

  for (let index = 0; index < trend.length; index += 1) {
    const windowStart = Math.max(0, index - 6);
    const window = trend.slice(windowStart, index + 1);
    const avg = window.reduce((sum, point) => sum + point.decisiveVotes, 0) / window.length;
    trend[index].trailingDecisive7d = round(avg, 2);
  }

  const heatmapMatrix: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const row of heatmapRows) {
    const day = Math.max(0, Math.min(6, Number(row.dow) || 0));
    const hour = Math.max(0, Math.min(23, Number(row.hour) || 0));
    heatmapMatrix[day][hour] = toNumber(row.votes);
  }

  const heatmapMaxVotes = Math.max(1, ...heatmapMatrix.flat());
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const heatmapDays = dayLabels.map((dayLabel, dayIndex) => ({
    dayIndex,
    dayLabel,
    cells: heatmapMatrix[dayIndex].map((votes, hour) => ({
      hour,
      votes,
      intensity: round(votes / heatmapMaxVotes, 4),
    })),
  }));

  const movers = recentPerformanceRows
    .map((row) => {
      const score = scoreByAssetId.get(row.asset_id);
      if (!score || !score.asset.active) {
        return null;
      }

      const recentMatches = toNumber(row.matches);
      const recentWins = toNumber(row.wins);
      if (recentMatches < 3) {
        return null;
      }

      const baselineMatches = score.wins + score.losses;
      const baselineWinRate = safeRate(score.wins, baselineMatches, 0.5);
      const recentWinRate = safeRate(recentWins, recentMatches, 0.5);
      const deltaWinRate = recentWinRate - baselineWinRate;

      const uncertaintyBoost = Math.min(2.4, 1 + 16 / (baselineMatches + 8));
      const volumeBoost = Math.log2(recentMatches + 1);
      const momentumScore = deltaWinRate * volumeBoost * uncertaintyBoost;
      const projectedEloMove = momentumScore * 18;

      const direction: "UP" | "DOWN" | "FLAT" =
        projectedEloMove > 0.25 ? "UP" : projectedEloMove < -0.25 ? "DOWN" : "FLAT";

      return {
        assetId: score.assetId,
        key: score.asset.key,
        label: labelFromAssetKey(score.asset.key),
        tier: score.asset.tier,
        elo: round(score.elo, 2),
        recentMatches,
        recentWinRate: round(recentWinRate, 4),
        baselineWinRate: round(baselineWinRate, 4),
        deltaWinRate: round(deltaWinRate, 4),
        momentumScore: round(momentumScore, 4),
        projectedEloMove: round(projectedEloMove, 2),
        direction,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => Math.abs(b.projectedEloMove) - Math.abs(a.projectedEloMove))
    .slice(0, 8);

  const outlierPool = allScores.filter((score) => score.asset.active && score.pollsCount >= 5);
  const outlierStats = stddev(outlierPool.map((score) => score.elo));

  const ratingOutliers = outlierPool
    .map((score) => {
      const decisivePolls = score.wins + score.losses;
      const zScore = outlierStats.std > 0 ? (score.elo - outlierStats.mean) / outlierStats.std : 0;

      return {
        assetId: score.assetId,
        key: score.asset.key,
        label: labelFromAssetKey(score.asset.key),
        elo: round(score.elo, 2),
        pollsCount: score.pollsCount,
        winRate: round(safeRate(score.wins, decisivePolls, 0.5), 4),
        zScore: round(zScore, 3),
      };
    })
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
    .slice(0, 8);

  const upsets = upsetCandidates
    .map((candidate) => {
      const leftElo = Number(candidate.left_elo ?? NaN);
      const rightElo = Number(candidate.right_elo ?? NaN);
      if (!Number.isFinite(leftElo) || !Number.isFinite(rightElo)) {
        return null;
      }

      if (candidate.selected_side === "LEFT") {
        const upsetDelta = rightElo - leftElo;
        if (upsetDelta <= 0) {
          return null;
        }

        return {
          voteId: candidate.vote_id,
          pairKey: candidate.pair_key,
          createdAt: new Date(candidate.created_at).toISOString(),
          winnerLabel: normalizeGenderLabel(candidate.left_label),
          loserLabel: normalizeGenderLabel(candidate.right_label),
          winnerElo: round(leftElo, 2),
          loserElo: round(rightElo, 2),
          upsetDelta: round(upsetDelta, 2),
        };
      }

      const upsetDelta = leftElo - rightElo;
      if (upsetDelta <= 0) {
        return null;
      }

      return {
        voteId: candidate.vote_id,
        pairKey: candidate.pair_key,
        createdAt: new Date(candidate.created_at).toISOString(),
        winnerLabel: normalizeGenderLabel(candidate.right_label),
        loserLabel: normalizeGenderLabel(candidate.left_label),
        winnerElo: round(rightElo, 2),
        loserElo: round(leftElo, 2),
        upsetDelta: round(upsetDelta, 2),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => b.upsetDelta - a.upsetDelta)
    .slice(0, 10);

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalVotes,
      decisiveVotes,
      skipVotes,
      votesLast24h,
      decisiveLast24h,
      uniqueVoters,
      activeAssets,
      activePairs,
      scoredAssets: allScores.length,
    },
    trend,
    heatmap: {
      maxVotes: heatmapMaxVotes,
      days: heatmapDays,
    },
    leaderboard,
    movers,
    ratingOutliers,
    upsets,
  };
}
