import { Prisma, PrismaClient, VoteSide, VoteSource } from "@prisma/client";

import { canonicalPairKey, labelFromAssetKey } from "@/lib/pair-key";

export type DiscordPollRunInput = {
  externalRunId?: string;
  guildId?: string;
  channelId?: string;
  messageId: string;
  pairKey?: string;
  leftAssetKey: string;
  rightAssetKey: string;
  leftVotes: number;
  rightVotes: number;
  totalVotes?: number;
  result?: string;
  affectsScore?: boolean;
  startedAtMs?: number;
  endsAtMs?: number;
  closedAtMs?: number;
  leftAssets?: string[];
  rightAssets?: string[];
};

function toDate(ms?: number): Date | null {
  if (!Number.isFinite(ms) || !ms) return null;
  const d = new Date(Number(ms));
  return Number.isFinite(d.getTime()) ? d : null;
}

async function ensureAsset(prisma: PrismaClient, assetKey: string) {
  return prisma.asset.upsert({
    where: { key: assetKey },
    update: {
      label: labelFromAssetKey(assetKey),
      active: true,
    },
    create: {
      key: assetKey,
      label: labelFromAssetKey(assetKey),
      active: true,
      metadata: Prisma.JsonNull,
    },
  });
}

async function ensurePair(prisma: PrismaClient, leftAssetId: string, rightAssetId: string, pairKey: string) {
  return prisma.votingPair.upsert({
    where: { pairKey },
    update: {
      leftAssetId,
      rightAssetId,
      active: true,
    },
    create: {
      pairKey,
      leftAssetId,
      rightAssetId,
      active: true,
      featured: false,
    },
  });
}

export async function ingestDiscordPollRuns(
  prisma: PrismaClient,
  runs: DiscordPollRunInput[]
): Promise<{ processed: number; upsertedVotes: number }> {
  let upsertedVotes = 0;

  for (const raw of runs) {
    const messageId = String(raw.messageId || "").trim();
    const leftAssetKey = String(raw.leftAssetKey || "").trim();
    const rightAssetKey = String(raw.rightAssetKey || "").trim();
    if (!messageId || !leftAssetKey || !rightAssetKey || leftAssetKey === rightAssetKey) continue;

    const leftAsset = await ensureAsset(prisma, leftAssetKey);
    const rightAsset = await ensureAsset(prisma, rightAssetKey);
    const pairKey = String(raw.pairKey || canonicalPairKey(leftAssetKey, rightAssetKey));
    const pair = await ensurePair(prisma, leftAsset.id, rightAsset.id, pairKey);

    const commonData = {
      source: VoteSource.DISCORD_BOT,
      pairId: pair.id,
      pairKey,
      leftAssetId: leftAsset.id,
      rightAssetId: rightAsset.id,
      pollMessageId: messageId,
      guildId: raw.guildId ? String(raw.guildId) : null,
      channelId: raw.channelId ? String(raw.channelId) : null,
      startedAt: toDate(raw.startedAtMs),
      endedAt: toDate(raw.endsAtMs),
      closedAt: toDate(raw.closedAtMs),
      metadata: {
        externalRunId: raw.externalRunId ?? null,
        result: raw.result ?? null,
        affectsScore: Boolean(raw.affectsScore),
        totalVotes: Number(raw.totalVotes ?? Number(raw.leftVotes || 0) + Number(raw.rightVotes || 0)),
        leftAssets: Array.isArray(raw.leftAssets) ? raw.leftAssets : [],
        rightAssets: Array.isArray(raw.rightAssets) ? raw.rightAssets : [],
      },
    };

    await prisma.voteEvent.upsert({
      where: {
        source_pollMessageId_selectedSide: {
          source: VoteSource.DISCORD_BOT,
          pollMessageId: messageId,
          selectedSide: VoteSide.LEFT,
        },
      },
      update: {
        ...commonData,
        selectedSide: VoteSide.LEFT,
        selectedAssetId: leftAsset.id,
        weight: Math.max(0, Number(raw.leftVotes || 0)),
      },
      create: {
        ...commonData,
        selectedSide: VoteSide.LEFT,
        selectedAssetId: leftAsset.id,
        weight: Math.max(0, Number(raw.leftVotes || 0)),
      },
    });
    upsertedVotes += 1;

    await prisma.voteEvent.upsert({
      where: {
        source_pollMessageId_selectedSide: {
          source: VoteSource.DISCORD_BOT,
          pollMessageId: messageId,
          selectedSide: VoteSide.RIGHT,
        },
      },
      update: {
        ...commonData,
        selectedSide: VoteSide.RIGHT,
        selectedAssetId: rightAsset.id,
        weight: Math.max(0, Number(raw.rightVotes || 0)),
      },
      create: {
        ...commonData,
        selectedSide: VoteSide.RIGHT,
        selectedAssetId: rightAsset.id,
        weight: Math.max(0, Number(raw.rightVotes || 0)),
      },
    });
    upsertedVotes += 1;
  }

  return { processed: runs.length, upsertedVotes };
}
