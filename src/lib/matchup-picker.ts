export type MatchupBucket = "featured" | "normal";

export function pickWeightedBucket(
  featuredCountRaw: number,
  normalCountRaw: number,
  featuredWeightRaw = 2,
  rng: () => number = Math.random
): MatchupBucket | null {
  const featuredCount = Math.max(0, Math.trunc(Number(featuredCountRaw) || 0));
  const normalCount = Math.max(0, Math.trunc(Number(normalCountRaw) || 0));
  const featuredWeight = Math.max(1, Math.trunc(Number(featuredWeightRaw) || 1));

  if (!featuredCount && !normalCount) return null;
  if (!normalCount) return "featured";
  if (!featuredCount) return "normal";

  const weightedFeatured = featuredCount * featuredWeight;
  const totalWeight = weightedFeatured + normalCount;
  const raw = Number(rng());
  const roll = Math.floor(Math.max(0, Math.min(0.999999999, Number.isFinite(raw) ? raw : 0.5)) * totalWeight);

  return roll < weightedFeatured ? "featured" : "normal";
}

export function pickRandomOffset(countRaw: number, rng: () => number = Math.random): number | null {
  const count = Math.max(0, Math.trunc(Number(countRaw) || 0));
  if (count <= 0) return null;

  const raw = Number(rng());
  const bounded = Math.max(0, Math.min(0.999999999, Number.isFinite(raw) ? raw : 0.5));
  return Math.floor(bounded * count);
}
