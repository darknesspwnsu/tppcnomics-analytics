import { Prisma, VoteSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { ensureBootstrapData } from "@/lib/bootstrap";
import { pickRandomOffset, pickWeightedBucket } from "@/lib/matchup-picker";
import { getConfiguredMatchupModes, loadMarketpollSeedCsvFromRepo, parseMarketpollSeedCsv } from "@/lib/marketpoll-seeds";
import { canonicalPairKey } from "@/lib/pair-key";
import { prisma } from "@/lib/prisma";
import { getRarityForAssetKey } from "@/lib/rarity";
import { getOrCreateVisitorId, issueVisitorCookie } from "@/lib/visitor-session";

const RECENT_PAIR_EXCLUDE_LIMIT = 20;
const FEATURED_PAIR_WEIGHT = 2;
const GOLDEN_PREFIX = "Golden";
let cachedValidPairKeys: string[] | null = null;

function getValidSeedPairKeys(): string[] {
  if (cachedValidPairKeys) return cachedValidPairKeys;

  try {
    const parsed = parseMarketpollSeedCsv(loadMarketpollSeedCsvFromRepo(), {
      matchupModes: getConfiguredMatchupModes(),
    });
    if (!parsed.errors.length && parsed.pairs.length) {
      cachedValidPairKeys = [...new Set(parsed.pairs.map((pair) => canonicalPairKey(pair.leftKeys, pair.rightKeys)))];
      return cachedValidPairKeys;
    }
  } catch {
    // Ignore and fall back to DB-only filtering.
  }

  cachedValidPairKeys = [];
  return cachedValidPairKeys;
}

async function pickPairIdForBucket(
  where: Prisma.VotingPairWhereInput,
  featured: boolean,
  count: number
): Promise<string | null> {
  const offset = pickRandomOffset(count);
  if (offset == null) return null;

  const picked = await prisma.votingPair.findFirst({
    where: {
      ...where,
      featured,
    },
    select: { id: true },
    orderBy: { id: "asc" },
    skip: offset,
  });

  return picked?.id || null;
}

async function pickWeightedRandomPairId(where: Prisma.VotingPairWhereInput): Promise<string | null> {
  const [featuredCount, normalCount] = await Promise.all([
    prisma.votingPair.count({
      where: {
        ...where,
        featured: true,
      },
    }),
    prisma.votingPair.count({
      where: {
        ...where,
        featured: false,
      },
    }),
  ]);

  const chosenBucket = pickWeightedBucket(featuredCount, normalCount, FEATURED_PAIR_WEIGHT);
  if (!chosenBucket) return null;

  if (chosenBucket === "featured") {
    const featuredPick = await pickPairIdForBucket(where, true, featuredCount);
    if (featuredPick) return featuredPick;
    if (normalCount > 0) return pickPairIdForBucket(where, false, normalCount);
    return null;
  }

  const normalPick = await pickPairIdForBucket(where, false, normalCount);
  if (normalPick) return normalPick;
  if (featuredCount > 0) return pickPairIdForBucket(where, true, featuredCount);
  return null;
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
    const validSeedPairKeys = getValidSeedPairKeys();

    const baseWhere: Prisma.VotingPairWhereInput = {
      active: true,
      ...(validSeedPairKeys.length ? { pairKey: { in: validSeedPairKeys } } : {}),
      leftAsset: {
        key: {
          startsWith: GOLDEN_PREFIX,
        },
      },
      rightAsset: {
        key: {
          startsWith: GOLDEN_PREFIX,
        },
      },
    };

    const filteredWhere: Prisma.VotingPairWhereInput = excludedPairIds.length
      ? {
          ...baseWhere,
          id: {
            notIn: excludedPairIds,
          },
        }
      : baseWhere;

    let selectedPairId = await pickWeightedRandomPairId(filteredWhere);

    if (!selectedPairId) {
      selectedPairId = await pickWeightedRandomPairId(baseWhere);
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
        rarity: getRarityForAssetKey(asset.key),
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
        leftAsset: leftAssets[0] || { ...pair.leftAsset, elo: null, rarity: getRarityForAssetKey(pair.leftAsset.key) },
        rightAsset:
          rightAssets[0] || { ...pair.rightAsset, elo: null, rarity: getRarityForAssetKey(pair.rightAsset.key) },
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
