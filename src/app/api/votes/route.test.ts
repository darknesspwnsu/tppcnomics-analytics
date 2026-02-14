import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApplyEloFromVotesBundles = vi.fn();
const mockGetOrCreateVisitorId = vi.fn();
const mockIssueVisitorCookie = vi.fn();
const mockWithSerializableRetry = vi.fn();

const mockPrisma = {
  votingPair: {
    findUnique: vi.fn(),
  },
  asset: {
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/elo", () => ({
  applyEloFromVotesBundles: (...args: unknown[]) => mockApplyEloFromVotesBundles(...args),
}));

vi.mock("@/lib/visitor-session", () => ({
  getOrCreateVisitorId: (...args: unknown[]) => mockGetOrCreateVisitorId(...args),
  issueVisitorCookie: (...args: unknown[]) => mockIssueVisitorCookie(...args),
}));

vi.mock("@/lib/tx-retry", () => ({
  withSerializableRetry: (...args: unknown[]) => mockWithSerializableRetry(...args),
}));

describe("POST /api/votes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetOrCreateVisitorId.mockReturnValue({
      visitorId: "visitor-1",
      source: "cookie",
      hadCookie: true,
      cookieWasValid: true,
      issuedAtSeconds: 1,
      shouldIssueCookie: false,
      shouldRefreshCookie: false,
    });

    mockPrisma.votingPair.findUnique.mockResolvedValue({
      id: "pair-1",
      pairKey: "GoldenBar|F::GoldenFoo|M",
      matchupMode: "1v1",
      active: true,
      leftAssetKeys: ["GoldenFoo|M"],
      rightAssetKeys: ["GoldenBar|F"],
      leftAssetId: "asset-left",
      rightAssetId: "asset-right",
      leftAsset: { key: "GoldenFoo|M" },
      rightAsset: { key: "GoldenBar|F" },
    });

    mockPrisma.asset.findMany.mockResolvedValue([
      { id: "asset-left", key: "GoldenFoo|M" },
      { id: "asset-right", key: "GoldenBar|F" },
    ]);
  });

  it("keeps response payload shape and uses atomic increments for voter and score counters", async () => {
    const tx = {
      voter: {
        findUnique: vi.fn().mockResolvedValue({
          streakDays: 4,
          lastVotedAt: new Date("2026-02-13T10:00:00.000Z"),
          xp: 200,
          totalVotes: 17,
        }),
        upsert: vi.fn().mockResolvedValue({
          id: "voter-1",
          xp: 215,
          streakDays: 5,
          totalVotes: 18,
        }),
      },
      voteEvent: {
        create: vi.fn().mockResolvedValue({
          id: "vote-1",
          createdAt: new Date("2026-02-14T12:00:00.000Z"),
        }),
      },
      assetScore: {
        findMany: vi.fn().mockResolvedValue([
          { assetId: "asset-left", elo: 1500 },
          { assetId: "asset-right", elo: 1500 },
        ]),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    mockApplyEloFromVotesBundles.mockReturnValue({
      result: "left",
      leftScore: 1512,
      rightScore: 1488,
      totalVotes: 1,
      affectsScore: true,
      kFactor: 24,
      leftScores: [1512],
      rightScores: [1488],
      leftTeamScore: 1500,
      rightTeamScore: 1500,
    });

    mockWithSerializableRetry.mockImplementation(async (_client: unknown, fn: (transaction: unknown) => Promise<unknown>) =>
      fn(tx)
    );

    const { POST } = await import("@/app/api/votes/route");

    const request = new NextRequest("https://example.test/api/votes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        pairId: "pair-1",
        selectedSide: "LEFT",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.vote).toMatchObject({
      id: "vote-1",
      pairId: "pair-1",
      pairKey: "GoldenBar|F::GoldenFoo|M",
      selectedSide: "LEFT",
    });
    expect(data.voter).toMatchObject({
      visitorId: "visitor-1",
      xpGain: 15,
      xp: 215,
      streakDays: 5,
      totalVotes: 18,
    });

    expect(tx.voter.upsert).toHaveBeenCalledTimes(1);
    const voterUpsert = tx.voter.upsert.mock.calls[0][0];
    expect(voterUpsert.update.xp).toEqual({ increment: 15 });
    expect(voterUpsert.update.totalVotes).toEqual({ increment: 1 });

    expect(tx.assetScore.upsert).toHaveBeenCalledTimes(2);
    const leftUpsert = tx.assetScore.upsert.mock.calls[0][0];
    expect(leftUpsert.update.wins).toEqual({ increment: 1 });
    expect(leftUpsert.update.pollsCount).toEqual({ increment: 1 });
    expect(leftUpsert.update.votesFor).toEqual({ increment: 1 });
    expect(leftUpsert.update.votesAgainst).toEqual({ increment: 0 });

    const rightUpsert = tx.assetScore.upsert.mock.calls[1][0];
    expect(rightUpsert.update.losses).toEqual({ increment: 1 });
    expect(rightUpsert.update.pollsCount).toEqual({ increment: 1 });
  });

  it("does not mutate scores for SKIP votes", async () => {
    const tx = {
      voter: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({
          id: "voter-1",
          xp: 11,
          streakDays: 1,
          totalVotes: 1,
        }),
      },
      voteEvent: {
        create: vi.fn().mockResolvedValue({
          id: "vote-skip",
          createdAt: new Date("2026-02-14T13:00:00.000Z"),
        }),
      },
      assetScore: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
    };

    mockWithSerializableRetry.mockImplementation(async (_client: unknown, fn: (transaction: unknown) => Promise<unknown>) =>
      fn(tx)
    );

    const { POST } = await import("@/app/api/votes/route");

    const request = new NextRequest("https://example.test/api/votes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        pairId: "pair-1",
        selectedSide: "SKIP",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.vote.selectedSide).toBe("SKIP");

    expect(tx.assetScore.findMany).not.toHaveBeenCalled();
    expect(tx.assetScore.upsert).not.toHaveBeenCalled();
    expect(mockApplyEloFromVotesBundles).not.toHaveBeenCalled();
  });
});
