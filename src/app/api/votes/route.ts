import { VoteSide, VoteSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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

    const pair = await prisma.votingPair.findUnique({
      where: { id: parsed.data.pairId },
      select: {
        id: true,
        pairKey: true,
        active: true,
        leftAssetId: true,
        rightAssetId: true,
      },
    });

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

    const existingVoter = await prisma.voter.findUnique({
      where: { visitorId: session.visitorId },
      select: {
        streakDays: true,
        lastVotedAt: true,
        xp: true,
        totalVotes: true,
      },
    });

    const progression = computeStreakAndXp(existingVoter);
    const selectedSide = parsed.data.selectedSide as VoteSide;

    const selectedAssetId =
      selectedSide === VoteSide.LEFT
        ? pair.leftAssetId
        : selectedSide === VoteSide.RIGHT
          ? pair.rightAssetId
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
          },
        },
      });

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
