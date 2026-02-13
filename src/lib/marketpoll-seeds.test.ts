import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseMarketpollSeedCsv } from "@/lib/marketpoll-seeds";

describe("parseMarketpollSeedCsv", () => {
  it("parses comment/header lines and mixed-unit ranges", () => {
    const csv = [
      "# comment line",
      "asset_key,seed_range",
      "\"GoldenFoo|M\",200-300k",
      "\"GoldenBar|F\",950kx-1.3mx",
      "\"GoldenBaz|?\",3mx",
    ].join("\n");

    const parsed = parseMarketpollSeedCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.assets).toHaveLength(3);

    const foo = parsed.assets.find((asset) => asset.assetKey === "GoldenFoo|M");
    const bar = parsed.assets.find((asset) => asset.assetKey === "GoldenBar|F");
    const baz = parsed.assets.find((asset) => asset.assetKey === "GoldenBaz|?");

    expect(foo?.minX).toBe(200_000);
    expect(foo?.maxX).toBe(300_000);
    expect(bar?.minX).toBe(950_000);
    expect(bar?.maxX).toBe(1_300_000);
    expect(baz?.minX).toBe(3_000_000);
    expect(baz?.maxX).toBe(3_000_000);
  });

  it("parses the bundled marketpoll seed file and generates many pairs", () => {
    const seedPath = path.resolve(process.cwd(), "data", "marketpoll_seeds.csv");
    const csv = fs.readFileSync(seedPath, "utf8");
    const parsed = parseMarketpollSeedCsv(csv);

    expect(parsed.errors).toEqual([]);
    expect(parsed.assets.length).toBeGreaterThan(350);
    expect(parsed.pairs.length).toBeGreaterThan(800);
    expect(parsed.matchupModes).toEqual(["1v1", "1v2", "2v1", "2v2"]);
    expect(parsed.pairs.some((pair) => pair.matchupMode !== "1v1")).toBe(true);
  });
});
