import { PrismaClient } from "@prisma/client";

import { DEFAULT_ASSETS, DEFAULT_PAIRS } from "@/lib/default-seed";
import {
  buildSeedAssetRows,
  loadMarketpollSeedCsvFromRepo,
  parseMarketpollSeedCsv,
} from "@/lib/marketpoll-seeds";
import { canonicalPairKey } from "@/lib/pair-key";

const BOOTSTRAP_CURSOR_SOURCE = "web_bootstrap_seed_version";
const BOOTSTRAP_SEED_VERSION = "2026-02-14-seed-expansion-snorlax-sudowoodo-volcarona-v1";
const BOOTSTRAP_FALLBACK_VERSION = `${BOOTSTRAP_SEED_VERSION}:fallback`;
const GOLDEN_PREFIX = "Golden";

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

async function hasActiveGoldenPairs(prisma: PrismaClient): Promise<boolean> {
  const count = await prisma.votingPair.count({
    where: {
      active: true,
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
    },
  });
  return count > 0;
}

async function deactivateNonGoldenRecords(prisma: PrismaClient): Promise<void> {
  await prisma.asset.updateMany({
    where: {
      key: {
        not: {
          startsWith: GOLDEN_PREFIX,
        },
      },
    },
    data: {
      active: false,
    },
  });

  const pairs = await prisma.votingPair.findMany({
    where: { active: true },
    select: {
      id: true,
      leftAsset: { select: { key: true } },
      rightAsset: { select: { key: true } },
    },
  });

  const nonGoldenPairIds = pairs
    .filter(
      (pair) => !pair.leftAsset.key.startsWith(GOLDEN_PREFIX) || !pair.rightAsset.key.startsWith(GOLDEN_PREFIX)
    )
    .map((pair) => pair.id);

  if (!nonGoldenPairIds.length) return;

  await prisma.votingPair.updateMany({
    where: {
      id: {
        in: nonGoldenPairIds,
      },
    },
    data: {
      active: false,
    },
  });
}

export async function ensureBootstrapData(prisma: PrismaClient): Promise<void> {
  const cursor = await prisma.ingestionCursor.findUnique({
    where: { source: BOOTSTRAP_CURSOR_SOURCE },
    select: { lastValue: true },
  });

  const alreadySeeded = cursor?.lastValue === BOOTSTRAP_SEED_VERSION;
  if (alreadySeeded && (await hasActiveGoldenPairs(prisma))) {
    return;
  }

  let seededFromMarketpoll = false;

  try {
    seededFromMarketpoll = await seedFromMarketpollCsv(prisma);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[bootstrap] marketpoll seed import failed, using fallback seeds:",
        error instanceof Error ? error.message : error
      );
    }
  }

  if (seededFromMarketpoll) {
    await deactivateNonGoldenRecords(prisma);
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
    return;
  }

  const hasAnyPairs = await prisma.votingPair.count({ where: { active: true } });
  if (!hasAnyPairs) {
    await seedFallbackDefaults(prisma);
  }

  await prisma.ingestionCursor.upsert({
    where: { source: BOOTSTRAP_CURSOR_SOURCE },
    create: {
      source: BOOTSTRAP_CURSOR_SOURCE,
      lastValue: BOOTSTRAP_FALLBACK_VERSION,
    },
    update: {
      lastValue: BOOTSTRAP_FALLBACK_VERSION,
    },
  });
}
