import { VoteSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { ensureBootstrapData } from "@/lib/bootstrap";
import { prisma } from "@/lib/prisma";
import { getOrCreateVisitorId, issueVisitorCookie } from "@/lib/visitor-session";

const RECENT_PAIR_EXCLUDE_LIMIT = 20;

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

    const query = {
      where: {
        active: true,
        ...(excludedPairIds.length ? { id: { notIn: excludedPairIds } } : {}),
      },
      include: {
        leftAsset: {
          select: {
            id: true,
            key: true,
            label: true,
            tier: true,
            imageUrl: true,
          },
        },
        rightAsset: {
          select: {
            id: true,
            key: true,
            label: true,
            tier: true,
            imageUrl: true,
          },
        },
      },
      orderBy: [{ featured: "desc" as const }, { updatedAt: "asc" as const }],
    };

    let pair = await prisma.votingPair.findFirst(query);

    if (!pair) {
      pair = await prisma.votingPair.findFirst({
        ...query,
        where: { active: true },
      });
    }

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

    const response = NextResponse.json({
      ok: true,
      pair: {
        id: pair.id,
        pairKey: pair.pairKey,
        prompt: pair.prompt,
        featured: pair.featured,
        leftAsset: pair.leftAsset,
        rightAsset: pair.rightAsset,
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
