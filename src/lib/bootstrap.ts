import { PrismaClient } from "@prisma/client";

import { DEFAULT_ASSETS, DEFAULT_PAIRS } from "@/lib/default-seed";
import { canonicalPairKey } from "@/lib/pair-key";

export async function ensureBootstrapData(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.votingPair.count({ where: { active: true } });
  if (existing > 0) return;

  for (const asset of DEFAULT_ASSETS) {
    await prisma.asset.upsert({
      where: { key: asset.key },
      update: {
        label: asset.label,
        tier: asset.tier,
        imageUrl: asset.imageUrl ?? null,
        active: true,
      },
      create: {
        key: asset.key,
        label: asset.label,
        tier: asset.tier,
        imageUrl: asset.imageUrl ?? null,
        active: true,
      },
    });
  }

  for (const pair of DEFAULT_PAIRS) {
    const left = await prisma.asset.findUnique({ where: { key: pair.leftKey } });
    const right = await prisma.asset.findUnique({ where: { key: pair.rightKey } });
    if (!left || !right || left.id === right.id) continue;

    const pairKey = canonicalPairKey(left.key, right.key);

    await prisma.votingPair.upsert({
      where: { pairKey },
      update: {
        leftAssetId: left.id,
        rightAssetId: right.id,
        prompt: pair.prompt,
        featured: Boolean(pair.featured),
        active: true,
      },
      create: {
        pairKey,
        leftAssetId: left.id,
        rightAssetId: right.id,
        prompt: pair.prompt,
        featured: Boolean(pair.featured),
        active: true,
      },
    });
  }
}
