import { PrismaClient } from "@prisma/client";

import { DEFAULT_ASSETS, DEFAULT_PAIRS } from "@/lib/default-seed";
import {
  buildSeedAssetRows,
  loadMarketpollSeedCsvFromRepo,
  parseMarketpollSeedCsv,
} from "@/lib/marketpoll-seeds";
import { canonicalPairKey } from "@/lib/pair-key";

const BOOTSTRAP_CURSOR_SOURCE = "web_bootstrap_seed_version";
const BOOTSTRAP_SEED_VERSION = "2026-02-13-matchup-modes-elo-v1";

async function seedFromMarketpollCsv(prisma: PrismaClient): Promise<boolean> {
  const csvText = loadMarketpollSeedCsvFromRepo();
  const parsed = parseMarketpollSeedCsv(csvText);

  if (parsed.errors.length > 0) {
    const head = parsed.errors.slice(0, 5).join("; ");
    throw new Error(`Seed CSV parse errors (${parsed.errors.length}): ${head}`);
  }

  if (parsed.assets.length < 50 || parsed.pairs.length < 100) {
    throw new Error(
      `Seed CSV did not generate enough rows (assets=${parsed.assets.length}, pairs=${parsed.pairs.length}).`
    );
  }

  const assetRows = buildSeedAssetRows(parsed.assets);
  await prisma.asset.createMany({
    data: assetRows,
    skipDuplicates: true,
  });

  const seededAssets = await prisma.asset.findMany({
    where: {
      key: {
        in: parsed.assets.map((asset) => asset.assetKey),
      },
    },
    select: {
      id: true,
      key: true,
    },
  });

  const assetIdByKey = new Map(seededAssets.map((asset) => [asset.key, asset.id]));
  const pairRows = parsed.pairs
    .map((pair) => {
      const leftAssetId = assetIdByKey.get(pair.leftKeys[0]);
      const rightAssetId = assetIdByKey.get(pair.rightKeys[0]);
      if (!leftAssetId || !rightAssetId || leftAssetId === rightAssetId) return null;
      return {
        pairKey: canonicalPairKey(pair.leftKeys, pair.rightKeys),
        leftAssetId,
        rightAssetId,
        leftAssetKeys: pair.leftKeys,
        rightAssetKeys: pair.rightKeys,
        matchupMode: pair.matchupMode,
        prompt: pair.prompt,
        featured: Boolean(pair.featured),
        active: true,
      };
    })
    .filter(Boolean) as Array<{
    pairKey: string;
    leftAssetId: string;
    rightAssetId: string;
    leftAssetKeys: string[];
    rightAssetKeys: string[];
    matchupMode: string;
    prompt: string;
    featured: boolean;
    active: boolean;
  }>;

  await prisma.votingPair.createMany({
    data: pairRows,
    skipDuplicates: true,
  });

  return true;
}

async function seedFallbackDefaults(prisma: PrismaClient): Promise<void> {
  await prisma.asset.createMany({
    data: DEFAULT_ASSETS.map((asset) => ({
      key: asset.key,
      label: asset.label,
      tier: asset.tier,
      imageUrl: asset.imageUrl ?? null,
      active: true,
    })),
    skipDuplicates: true,
  });

  const assets = await prisma.asset.findMany({
    where: {
      key: {
        in: DEFAULT_ASSETS.map((asset) => asset.key),
      },
    },
    select: {
      id: true,
      key: true,
    },
  });
  const assetIdByKey = new Map(assets.map((asset) => [asset.key, asset.id]));

  const pairs = DEFAULT_PAIRS.map((pair) => {
    const leftAssetId = assetIdByKey.get(pair.leftKey);
    const rightAssetId = assetIdByKey.get(pair.rightKey);
    if (!leftAssetId || !rightAssetId || leftAssetId === rightAssetId) return null;

    return {
      pairKey: canonicalPairKey(pair.leftKey, pair.rightKey),
      leftAssetId,
      rightAssetId,
      leftAssetKeys: [pair.leftKey],
      rightAssetKeys: [pair.rightKey],
      matchupMode: "1v1",
      prompt: pair.prompt,
      featured: Boolean(pair.featured),
      active: true,
    };
  }).filter(Boolean) as Array<{
    pairKey: string;
    leftAssetId: string;
    rightAssetId: string;
    leftAssetKeys: string[];
    rightAssetKeys: string[];
    matchupMode: string;
    prompt: string;
    featured: boolean;
    active: boolean;
  }>;

  await prisma.votingPair.createMany({
    data: pairs,
    skipDuplicates: true,
  });
}

export async function ensureBootstrapData(prisma: PrismaClient): Promise<void> {
  const cursor = await prisma.ingestionCursor.findUnique({
    where: { source: BOOTSTRAP_CURSOR_SOURCE },
    select: { lastValue: true },
  });

  if (cursor?.lastValue === BOOTSTRAP_SEED_VERSION) return;

  try {
    await seedFromMarketpollCsv(prisma);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[bootstrap] marketpoll seed import failed, using fallback seeds:",
        error instanceof Error ? error.message : error
      );
    }
    await seedFallbackDefaults(prisma);
  }

  await prisma.ingestionCursor.upsert({
    where: { source: BOOTSTRAP_CURSOR_SOURCE },
    create: {
      source: BOOTSTRAP_CURSOR_SOURCE,
      lastValue: BOOTSTRAP_SEED_VERSION,
    },
    update: {
      lastValue: BOOTSTRAP_SEED_VERSION,
    },
  });
}
