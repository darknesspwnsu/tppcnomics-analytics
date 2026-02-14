import { VoteSide, VoteSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { applyEloFromVotesBundles } from "@/lib/elo";
import { prisma } from "@/lib/prisma";
import { getOrCreateVisitorId, issueVisitorCookie } from "@/lib/visitor-session";
import { computeStreakAndXp } from "@/lib/voter";

const VoteRequestSchema = z.object({
  pairId: z.string().trim().min(1),
  selectedSide: z.enum(["LEFT", "RIGHT", "SKIP"]),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = VoteRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid vote payload.",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const session = getOrCreateVisitorId(request);

    const [pair, existingVoter] = await Promise.all([
      prisma.votingPair.findUnique({
        where: { id: parsed.data.pairId },
        select: {
          id: true,
          pairKey: true,
          matchupMode: true,
          active: true,
          leftAssetKeys: true,
          rightAssetKeys: true,
          leftAssetId: true,
          rightAssetId: true,
          leftAsset: {
            select: {
              key: true,
            },
          },
          rightAsset: {
            select: {
              key: true,
            },
          },
        },
      }),
      prisma.voter.findUnique({
        where: { visitorId: session.visitorId },
        select: {
          streakDays: true,
          lastVotedAt: true,
          xp: true,
          totalVotes: true,
        },
      }),
    ]);

    if (!pair || !pair.active) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voting pair not found.",
        },
        { status: 404 }
      );
    }

    const now = new Date();

    const progression = computeStreakAndXp(existingVoter);
    const selectedSide = parsed.data.selectedSide as VoteSide;

    const leftAssetKeys = pair.leftAssetKeys.length ? pair.leftAssetKeys : [pair.leftAsset.key];
    const rightAssetKeys = pair.rightAssetKeys.length ? pair.rightAssetKeys : [pair.rightAsset.key];
    const allAssetKeys = [...new Set([...leftAssetKeys, ...rightAssetKeys])];

    const sideAssets = await prisma.asset.findMany({
      where: {
        key: {
          in: allAssetKeys,
        },
      },
      select: {
        id: true,
        key: true,
      },
    });
    const assetIdByKey = new Map(sideAssets.map((asset) => [asset.key, asset.id]));
    const leftAssetIds = leftAssetKeys.map((key) => assetIdByKey.get(key)).filter(Boolean) as string[];
    const rightAssetIds = rightAssetKeys.map((key) => assetIdByKey.get(key)).filter(Boolean) as string[];

    if (!leftAssetIds.length || !rightAssetIds.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voting pair assets could not be resolved.",
        },
        { status: 500 }
      );
    }

    const votesLeft = selectedSide === VoteSide.LEFT ? 1 : selectedSide === VoteSide.RIGHT ? 0 : 0;
    const votesRight = selectedSide === VoteSide.RIGHT ? 1 : selectedSide === VoteSide.LEFT ? 0 : 0;

    const selectedAssetId =
      selectedSide === VoteSide.LEFT
        ? leftAssetIds[0]
        : selectedSide === VoteSide.RIGHT
          ? rightAssetIds[0]
          : null;

    const result = await prisma.$transaction(async (tx) => {
      const voter = await tx.voter.upsert({
        where: {
          visitorId: session.visitorId,
        },
        create: {
          visitorId: session.visitorId,
          xp: progression.nextXp,
          streakDays: progression.streakDays,
          totalVotes: progression.nextTotalVotes,
          lastVotedAt: now,
          lastSeenAt: now,
        },
        update: {
          xp: progression.nextXp,
          streakDays: progression.streakDays,
          totalVotes: progression.nextTotalVotes,
          lastVotedAt: now,
          lastSeenAt: now,
        },
      });

      const vote = await tx.voteEvent.create({
        data: {
          source: VoteSource.WEB_APP,
          selectedSide,
          weight: 1,
          pairId: pair.id,
          pairKey: pair.pairKey,
          voterId: voter.id,
          leftAssetId: pair.leftAssetId,
          rightAssetId: pair.rightAssetId,
          selectedAssetId,
          metadata: {
            sessionSource: session.source,
            hadCookie: session.hadCookie,
            cookieWasValid: session.cookieWasValid,
            matchupMode: pair.matchupMode,
            leftAssets: leftAssetKeys,
            rightAssets: rightAssetKeys,
          },
        },
      });

      if (selectedSide !== VoteSide.SKIP) {
        const allAssetIds = [...new Set([...leftAssetIds, ...rightAssetIds])];
        const existingScores = await tx.assetScore.findMany({
          where: {
            assetId: {
              in: allAssetIds,
            },
          },
          select: {
            assetId: true,
            elo: true,
            wins: true,
            losses: true,
            ties: true,
            pollsCount: true,
            votesFor: true,
            votesAgainst: true,
          },
        });
        const existingByAssetId = new Map(existingScores.map((score) => [score.assetId, score]));

        const elo = applyEloFromVotesBundles({
          leftScores: leftAssetIds.map((assetId) => existingByAssetId.get(assetId)?.elo ?? 1500),
          rightScores: rightAssetIds.map((assetId) => existingByAssetId.get(assetId)?.elo ?? 1500),
          votesLeft,
          votesRight,
          minVotes: 1,
        });

        const leftOutcome = elo.result === "left" ? "win" : elo.result === "right" ? "loss" : "tie";
        const rightOutcome = elo.result === "right" ? "win" : elo.result === "left" ? "loss" : "tie";

        for (let idx = 0; idx < leftAssetIds.length; idx += 1) {
          const assetId = leftAssetIds[idx];
          const base = existingByAssetId.get(assetId);
          const nextElo = elo.leftScores[idx] ?? base?.elo ?? 1500;

          await tx.assetScore.upsert({
            where: { assetId },
            create: {
              assetId,
              elo: nextElo,
              wins: leftOutcome === "win" ? 1 : 0,
              losses: leftOutcome === "loss" ? 1 : 0,
              ties: leftOutcome === "tie" ? 1 : 0,
              pollsCount: 1,
              votesFor: votesLeft,
              votesAgainst: votesRight,
              lastPollAt: now,
            },
            update: {
              elo: nextElo,
              wins: (base?.wins ?? 0) + (leftOutcome === "win" ? 1 : 0),
              losses: (base?.losses ?? 0) + (leftOutcome === "loss" ? 1 : 0),
              ties: (base?.ties ?? 0) + (leftOutcome === "tie" ? 1 : 0),
              pollsCount: (base?.pollsCount ?? 0) + 1,
              votesFor: (base?.votesFor ?? 0) + votesLeft,
              votesAgainst: (base?.votesAgainst ?? 0) + votesRight,
              lastPollAt: now,
            },
          });
        }

        for (let idx = 0; idx < rightAssetIds.length; idx += 1) {
          const assetId = rightAssetIds[idx];
          const base = existingByAssetId.get(assetId);
          const nextElo = elo.rightScores[idx] ?? base?.elo ?? 1500;

          await tx.assetScore.upsert({
            where: { assetId },
            create: {
              assetId,
              elo: nextElo,
              wins: rightOutcome === "win" ? 1 : 0,
              losses: rightOutcome === "loss" ? 1 : 0,
              ties: rightOutcome === "tie" ? 1 : 0,
              pollsCount: 1,
              votesFor: votesRight,
              votesAgainst: votesLeft,
              lastPollAt: now,
            },
            update: {
              elo: nextElo,
              wins: (base?.wins ?? 0) + (rightOutcome === "win" ? 1 : 0),
              losses: (base?.losses ?? 0) + (rightOutcome === "loss" ? 1 : 0),
              ties: (base?.ties ?? 0) + (rightOutcome === "tie" ? 1 : 0),
              pollsCount: (base?.pollsCount ?? 0) + 1,
              votesFor: (base?.votesFor ?? 0) + votesRight,
              votesAgainst: (base?.votesAgainst ?? 0) + votesLeft,
              lastPollAt: now,
            },
          });
        }
      }

      return { voter, vote };
    });

    const response = NextResponse.json({
      ok: true,
      vote: {
        id: result.vote.id,
        pairId: pair.id,
        pairKey: pair.pairKey,
        selectedSide,
        createdAt: result.vote.createdAt,
      },
      voter: {
        visitorId: session.visitorId,
        xpGain: progression.xpGain,
        xp: result.voter.xp,
        streakDays: result.voter.streakDays,
        totalVotes: result.voter.totalVotes,
      },
    });

    issueVisitorCookie(response, session.visitorId, { refresh: true });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to submit vote.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
