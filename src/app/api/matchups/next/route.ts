import { VoteSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { ensureBootstrapData } from "@/lib/bootstrap";
import { prisma } from "@/lib/prisma";
import { getOrCreateVisitorId, issueVisitorCookie } from "@/lib/visitor-session";

const RECENT_PAIR_EXCLUDE_LIMIT = 20;
const FEATURED_PAIR_WEIGHT = 2;

function pickWeightedRandomPairId(candidates: Array<{ id: string; featured: boolean }>): string | null {
  if (!candidates.length) return null;

  let totalWeight = 0;
  const weighted = candidates.map((candidate) => {
    const weight = candidate.featured ? FEATURED_PAIR_WEIGHT : 1;
    totalWeight += weight;
    return { id: candidate.id, weight };
  });

  let roll = Math.random() * totalWeight;
  for (const candidate of weighted) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate.id;
  }

  return weighted[weighted.length - 1]?.id || null;
}

export async function GET(request: NextRequest) {
  try {
    await ensureBootstrapData(prisma);

    const session = getOrCreateVisitorId(request);

    const voter = await prisma.voter.findUnique({
      where: { visitorId: session.visitorId },
      select: {
        id: true,
        visitorId: true,
        xp: true,
        streakDays: true,
        totalVotes: true,
        lastVotedAt: true,
        lastSeenAt: true,
      },
    });

    let excludedPairIds: string[] = [];
    if (voter?.id) {
      const recentVotes = await prisma.voteEvent.findMany({
        where: {
          source: VoteSource.WEB_APP,
          voterId: voter.id,
          pairId: { not: null },
        },
        select: { pairId: true },
        orderBy: { createdAt: "desc" },
        take: RECENT_PAIR_EXCLUDE_LIMIT,
      });

      excludedPairIds = recentVotes
        .map((vote) => String(vote.pairId || "").trim())
        .filter(Boolean);
    }

    const excludePairId = String(request.nextUrl.searchParams.get("excludePairId") || "").trim();
    if (excludePairId) {
      excludedPairIds.push(excludePairId);
    }

    excludedPairIds = [...new Set(excludedPairIds)];

    const filteredCandidates = await prisma.votingPair.findMany({
      where: {
        active: true,
        ...(excludedPairIds.length ? { id: { notIn: excludedPairIds } } : {}),
      },
      select: {
        id: true,
        featured: true,
      },
    });

    let selectedPairId = pickWeightedRandomPairId(filteredCandidates);

    if (!selectedPairId) {
      const fallbackCandidates = await prisma.votingPair.findMany({
        where: { active: true },
        select: {
          id: true,
          featured: true,
        },
      });
      selectedPairId = pickWeightedRandomPairId(fallbackCandidates);
    }

    const pair = selectedPairId
      ? await prisma.votingPair.findUnique({
          where: { id: selectedPairId },
          include: {
            leftAsset: {
              select: {
                id: true,
                key: true,
                label: true,
                tier: true,
                imageUrl: true,
                metadata: true,
              },
            },
            rightAsset: {
              select: {
                id: true,
                key: true,
                label: true,
                tier: true,
                imageUrl: true,
                metadata: true,
              },
            },
          },
        })
      : null;

    if (!pair) {
      const emptyResponse = NextResponse.json(
        {
          ok: false,
          error: "No active voting matchups are available.",
        },
        { status: 404 }
      );

      issueVisitorCookie(emptyResponse, session.visitorId, {
        refresh: session.shouldIssueCookie || session.shouldRefreshCookie,
      });

      return emptyResponse;
    }

    const leftAssetKeys = pair.leftAssetKeys.length ? pair.leftAssetKeys : [pair.leftAsset.key];
    const rightAssetKeys = pair.rightAssetKeys.length ? pair.rightAssetKeys : [pair.rightAsset.key];
    const uniqueAssetKeys = [...new Set([...leftAssetKeys, ...rightAssetKeys])];

    const sideAssets = await prisma.asset.findMany({
      where: { key: { in: uniqueAssetKeys } },
      select: {
        id: true,
        key: true,
        label: true,
        tier: true,
        imageUrl: true,
        metadata: true,
      },
    });
    const assetByKey = new Map(sideAssets.map((asset) => [asset.key, asset]));

    const sideAssetScores = await prisma.assetScore.findMany({
      where: {
        assetId: {
          in: sideAssets.map((asset) => asset.id),
        },
      },
      select: {
        assetId: true,
        elo: true,
      },
    });
    const eloByAssetId = new Map(sideAssetScores.map((score) => [score.assetId, score.elo]));

    const withElo = (assetKey: string) => {
      const asset = assetByKey.get(assetKey);
      if (!asset) return null;
      return {
        ...asset,
        elo: Number.isFinite(eloByAssetId.get(asset.id)) ? Number(eloByAssetId.get(asset.id)) : null,
      };
    };

    const leftAssets = leftAssetKeys
      .map(withElo)
      .filter((asset): asset is NonNullable<ReturnType<typeof withElo>> => Boolean(asset));
    const rightAssets = rightAssetKeys
      .map(withElo)
      .filter((asset): asset is NonNullable<ReturnType<typeof withElo>> => Boolean(asset));

    const response = NextResponse.json({
      ok: true,
      pair: {
        id: pair.id,
        pairKey: pair.pairKey,
        prompt: pair.prompt,
        featured: pair.featured,
        matchupMode: pair.matchupMode,
        leftAssets,
        rightAssets,
        leftAsset: leftAssets[0] || { ...pair.leftAsset, elo: null },
        rightAsset: rightAssets[0] || { ...pair.rightAsset, elo: null },
      },
      voter: {
        visitorId: session.visitorId,
        xp: voter?.xp ?? 0,
        streakDays: voter?.streakDays ?? 0,
        totalVotes: voter?.totalVotes ?? 0,
      },
    });

    issueVisitorCookie(response, session.visitorId, {
      refresh: session.shouldIssueCookie || session.shouldRefreshCookie,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load next matchup.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
