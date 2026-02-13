import { describe, expect, it } from "vitest";

import { buildSpriteCandidates, resolveAssetSprite } from "@/lib/sprite-resolver";

describe("resolveAssetSprite", () => {
  it("resolves GoldenBulbasaur to dex #1 golden variant", () => {
    const resolved = resolveAssetSprite("GoldenBulbasaur|M");
    expect(resolved.pokemonName).toBe("Bulbasaur");
    expect(resolved.variant).toBe("golden");
    expect(resolved.dexNumber).toBe(1);
    expect(resolved.form).toBe(0);
  });

  it("resolves Deoxys form correctly from asset key", () => {
    const resolved = resolveAssetSprite("GoldenDeoxys (Attack)|G");
    expect(resolved.pokemonName).toBe("Deoxys (Attack)");
    expect(resolved.variant).toBe("golden");
    expect(resolved.dexNumber).toBe(386);
    expect(resolved.form).toBe(1);
  });
});

describe("buildSpriteCandidates", () => {
  it("builds TPPC-first URLs by default", () => {
    const candidates = buildSpriteCandidates("GoldenBulbasaur|M");
    expect(candidates[0]).toEqual({
      provider: "tppc",
      url: "https://graphics.tppcrpg.net/xy/golden/001M.gif",
    });
    expect(candidates.some((candidate) => candidate.provider === "pokeapi")).toBe(true);
  });

  it("builds form-aware TPPC URLs", () => {
    const candidates = buildSpriteCandidates("GoldenDeoxys (Attack)|G");
    expect(candidates[0]).toEqual({
      provider: "tppc",
      url: "https://graphics.tppcrpg.net/xy/golden/386M-1.gif",
    });
  });

  it("supports pokeapi preference ordering", () => {
    const candidates = buildSpriteCandidates("GoldenBulbasaur|M", "pokeapi");
    expect(candidates[0]?.provider).toBe("pokeapi");
    expect(candidates[0]?.url).toContain("/1.png");
  });

  it("returns no candidates for unknown pokemon names", () => {
    const candidates = buildSpriteCandidates("GoldenDefinitelyNotRealmon|M");
    expect(candidates).toEqual([]);
  });
});
