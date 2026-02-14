import { beforeEach, describe, expect, it, vi } from "vitest";

const loadMarketpollSeedCsvFromRepo = vi.fn();
const parseMarketpollSeedCsv = vi.fn();
const buildSeedAssetRows = vi.fn();

vi.mock("@/lib/marketpoll-seeds", () => ({
  loadMarketpollSeedCsvFromRepo,
  parseMarketpollSeedCsv,
  buildSeedAssetRows,
}));

describe("ensureBootstrapData seed sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const parsedAssets = [
      {
        assetKey: "GoldenFoo|M",
        seedRangeRaw: "100-120",
        minX: 100,
        maxX: 120,
        midX: 110,
        tierId: "1-5kx",
        tierIndex: 0,
        gender: "M",
      },
      {
        assetKey: "GoldenBar|F",
        seedRangeRaw: "105-125",
        minX: 105,
        maxX: 125,
        midX: 115,
        tierId: "1-5kx",
        tierIndex: 0,
        gender: "F",
      },
      ...Array.from({ length: 58 }, (_, idx) => ({
        assetKey: `GoldenExtra${idx}|?`,
        seedRangeRaw: "100-130",
        minX: 100,
        maxX: 130,
        midX: 115,
        tierId: "1-5kx",
        tierIndex: 0,
        gender: "?",
      })),
    ];

    loadMarketpollSeedCsvFromRepo.mockReturnValue("asset_key,seed_range\n");
    parseMarketpollSeedCsv.mockReturnValue({
      errors: [],
      assets: parsedAssets,
      pairs: Array.from({ length: 120 }, (_, idx) => ({
        leftKeys: ["GoldenFoo|M"],
        rightKeys: ["GoldenBar|F"],
        matchupMode: "1v1",
        prompt: `prompt-${idx}`,
        featured: idx < 2,
      })),
    });

    buildSeedAssetRows.mockReturnValue(
      parsedAssets.map((asset) => ({
        key: asset.assetKey,
        label: asset.assetKey.split("|")[0],
        tier: asset.tierId,
        imageUrl: null,
        active: true,
        metadata: { seedRange: asset.seedRangeRaw },
      }))
    );
  });

  it("deactivates stale golden assets/pairs and reactivates current seeded records", async () => {
    const { ensureBootstrapData } = await import("@/lib/bootstrap");

    const prisma = {
      ingestionCursor: {
        findUnique: vi.fn().mockResolvedValue({ lastValue: "old-version" }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      asset: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          { id: "a1", key: "GoldenFoo|M" },
          { id: "a2", key: "GoldenBar|F" },
        ]),
      },
      votingPair: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(1),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { id: "pair-keep", pairKey: "GoldenBar|F::GoldenFoo|M" },
            { id: "pair-stale", pairKey: "GoldenBaz|?::GoldenFoo|M" },
          ])
          .mockResolvedValueOnce([
            {
              id: "pair-golden",
              leftAsset: { key: "GoldenFoo|M" },
              rightAsset: { key: "GoldenBar|F" },
            },
            {
              id: "pair-non-golden",
              leftAsset: { key: "Pikachu|M" },
              rightAsset: { key: "GoldenBar|F" },
            },
          ]),
      },
    };

    await ensureBootstrapData(prisma as never);

    expect(prisma.asset.createMany).toHaveBeenCalled();
    expect(prisma.votingPair.createMany).toHaveBeenCalled();

    const assetUpdateCalls = prisma.asset.updateMany.mock.calls.map((call) => call[0]);
    expect(
      assetUpdateCalls.some(
        (input) =>
          input?.where?.key?.in?.includes("GoldenFoo|M") &&
          input?.where?.key?.in?.includes("GoldenBar|F") &&
          input?.data?.active === true
      )
    ).toBe(true);

    const staleAssetDeactivationCall = assetUpdateCalls.find(
      (input) => input?.where?.key?.startsWith === "Golden" && Array.isArray(input?.where?.key?.notIn)
    );
    expect(staleAssetDeactivationCall).toBeDefined();
    expect(staleAssetDeactivationCall.where.key.notIn).toContain("GoldenFoo|M");
    expect(staleAssetDeactivationCall.where.key.notIn).toContain("GoldenBar|F");

    const pairUpdateCalls = prisma.votingPair.updateMany.mock.calls.map((call) => call[0]);

    expect(
      pairUpdateCalls.some(
        (input) =>
          input?.where?.pairKey?.in?.includes("GoldenBar|F::GoldenFoo|M") &&
          input?.data?.active === true
      )
    ).toBe(true);

    expect(
      pairUpdateCalls.some((input) => input?.where?.id?.in?.includes("pair-stale") && input?.data?.active === false)
    ).toBe(true);

    expect(
      pairUpdateCalls.some((input) => input?.where?.id?.in?.includes("pair-non-golden") && input?.data?.active === false)
    ).toBe(true);
  });
});
