import fs from "node:fs";
import path from "node:path";

import { canonicalPairKey, labelFromAssetKey } from "@/lib/pair-key";

const RATE_MULTIPLIERS: Record<string, number> = {
  x: 1,
  k: 1_000,
  kx: 1_000,
  m: 1_000_000,
  mx: 1_000_000,
};

const GOLDMARKET_TIERS = [
  { id: "1-5kx", min: 1_000, max: 5_000 },
  { id: "5-10kx", min: 5_000, max: 10_000 },
  { id: "10-20kx", min: 10_000, max: 20_000 },
  { id: "20-40kx", min: 20_000, max: 40_000 },
  { id: "40-100kx", min: 40_000, max: 100_000 },
  { id: "100-200kx", min: 100_000, max: 200_000 },
  { id: "200-500kx", min: 200_000, max: 500_000 },
  { id: "500-1000kx", min: 500_000, max: 1_000_000 },
  { id: "1mx-2mx", min: 1_000_000, max: 2_000_000 },
  { id: "2mx-3mx", min: 2_000_000, max: 3_000_000 },
  { id: "3mx+", min: 3_000_000, max: Number.POSITIVE_INFINITY },
] as const;

const PROMPT_TEMPLATES = [
  "Which one is better value at current rates?",
  "Which one is more likely to appreciate next?",
  "If you had to buy one now, which would you take?",
  "Which one has stronger market momentum?",
  "Which one feels underpriced right now?",
  "Which one would you hold for longer-term upside?",
] as const;

const PAIR_NEIGHBOR_WINDOW = 8;
const MIN_PAIRS_PER_ASSET = 2;
const MAX_GENERATED_PAIRS = 1600;
const FEATURED_PAIR_COUNT = 120;

export type ParsedMarketSeedAsset = {
  assetKey: string;
  seedRangeRaw: string;
  minX: number;
  maxX: number;
  midX: number;
  tierId: string;
  tierIndex: number;
};

export type GeneratedMarketSeedPair = {
  leftKey: string;
  rightKey: string;
  prompt: string;
  featured: boolean;
};

export type ParsedMarketSeedData = {
  assets: ParsedMarketSeedAsset[];
  pairs: GeneratedMarketSeedPair[];
  errors: string[];
};

type ParsedRateToken = {
  ok: boolean;
  valueX?: number;
  multiplier?: number;
  needsUnit?: boolean;
  error?: string;
};

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuote = true;
      continue;
    }

    if (ch === ",") {
      out.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current.trim());
  return out;
}

function tierForMidX(midX: number): { id: string; index: number } {
  for (let i = 0; i < GOLDMARKET_TIERS.length; i += 1) {
    const tier = GOLDMARKET_TIERS[i];
    if (midX < tier.min) continue;
    if (midX >= tier.max) continue;
    return { id: tier.id, index: i };
  }

  const last = GOLDMARKET_TIERS[GOLDMARKET_TIERS.length - 1];
  return { id: last.id, index: GOLDMARKET_TIERS.length - 1 };
}

function parseRateToken(raw: string, fallbackMultiplier: number | null = null): ParsedRateToken {
  const token = String(raw || "").trim().toLowerCase().replace(/\+$/, "");
  const match = token.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/i);
  if (!match) {
    return { ok: false, error: `Invalid rate token: ${raw}` };
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: `Invalid numeric amount: ${raw}` };
  }

  const unitRaw = String(match[2] || "").toLowerCase();
  if (!unitRaw) {
    if (!Number.isFinite(fallbackMultiplier ?? NaN)) {
      return { ok: false, needsUnit: true };
    }
    return { ok: true, valueX: amount * Number(fallbackMultiplier), multiplier: Number(fallbackMultiplier) };
  }

  const multiplier = RATE_MULTIPLIERS[unitRaw];
  if (!Number.isFinite(multiplier)) {
    return { ok: false, error: `Unknown unit in rate token: ${raw}` };
  }

  return { ok: true, valueX: amount * multiplier, multiplier };
}

function parseSeedRange(rawRange: string): {
  ok: boolean;
  minX?: number;
  maxX?: number;
  midX?: number;
  tierId?: string;
  tierIndex?: number;
  error?: string;
} {
  const raw = String(rawRange || "").trim();
  if (!raw) return { ok: false, error: "Range cannot be empty." };

  const parts = raw
    .split("-")
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  if (parts.length < 1 || parts.length > 2) {
    return { ok: false, error: `Range must be single value or min-max: ${raw}` };
  }

  if (parts.length === 1) {
    const single = parseRateToken(parts[0], 1);
    if (!single.ok || !Number.isFinite(single.valueX)) {
      return { ok: false, error: single.error || `Invalid single-value range: ${raw}` };
    }

    const minX = Number(single.valueX);
    const maxX = Number(single.valueX);
    const midX = minX;
    const tier = tierForMidX(midX);
    return { ok: true, minX, maxX, midX, tierId: tier.id, tierIndex: tier.index };
  }

  let left = parseRateToken(parts[0]);
  let right = parseRateToken(parts[1]);

  if (!left.ok && !left.needsUnit) return { ok: false, error: left.error || `Invalid range: ${raw}` };
  if (!right.ok && !right.needsUnit) return { ok: false, error: right.error || `Invalid range: ${raw}` };

  if (left.needsUnit && right.needsUnit) {
    left = parseRateToken(parts[0], 1);
    right = parseRateToken(parts[1], 1);
  } else {
    if (left.needsUnit) left = parseRateToken(parts[0], right.multiplier ?? null);
    if (right.needsUnit) right = parseRateToken(parts[1], left.multiplier ?? null);
  }

  if (!left.ok || !right.ok || !Number.isFinite(left.valueX) || !Number.isFinite(right.valueX)) {
    return { ok: false, error: `Could not parse range: ${raw}` };
  }

  const minX = Number(left.valueX);
  const maxX = Number(right.valueX);
  if (minX > maxX) return { ok: false, error: `Range min greater than max: ${raw}` };

  const midX = (minX + maxX) / 2;
  const tier = tierForMidX(midX);
  return { ok: true, minX, maxX, midX, tierId: tier.id, tierIndex: tier.index };
}

function rangesOverlap(a: ParsedMarketSeedAsset, b: ParsedMarketSeedAsset): boolean {
  return Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX);
}

function isPairCompatible(a: ParsedMarketSeedAsset, b: ParsedMarketSeedAsset): boolean {
  const tierDiff = Math.abs(a.tierIndex - b.tierIndex);
  if (tierDiff > 1) return false;
  if (tierDiff === 1 && !rangesOverlap(a, b)) return false;
  return true;
}

function stringHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function buildPrompt(pairKey: string): string {
  const idx = stringHash(pairKey) % PROMPT_TEMPLATES.length;
  return PROMPT_TEMPLATES[idx];
}

function generatePairs(assets: ParsedMarketSeedAsset[]): GeneratedMarketSeedPair[] {
  const sorted = [...assets].sort((a, b) => a.midX - b.midX || a.assetKey.localeCompare(b.assetKey));
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const candidates: Array<{
    leftKey: string;
    rightKey: string;
    pairKey: string;
    closeness: number;
    combinedMid: number;
  }> = [];

  const addCandidate = (a: ParsedMarketSeedAsset, b: ParsedMarketSeedAsset) => {
    if (!isPairCompatible(a, b)) return;
    const pairKey = canonicalPairKey(a.assetKey, b.assetKey);
    if (seen.has(pairKey)) return;
    seen.add(pairKey);

    const closeness = Math.abs(a.midX - b.midX) / Math.max(a.midX, b.midX, 1);
    const combinedMid = a.midX + b.midX;
    candidates.push({
      leftKey: a.assetKey,
      rightKey: b.assetKey,
      pairKey,
      closeness,
      combinedMid,
    });
    counts.set(a.assetKey, (counts.get(a.assetKey) || 0) + 1);
    counts.set(b.assetKey, (counts.get(b.assetKey) || 0) + 1);
  };

  for (let i = 0; i < sorted.length; i += 1) {
    for (
      let j = i + 1;
      j < sorted.length && j <= i + PAIR_NEIGHBOR_WINDOW && candidates.length < MAX_GENERATED_PAIRS;
      j += 1
    ) {
      addCandidate(sorted[i], sorted[j]);
    }
    if (candidates.length >= MAX_GENERATED_PAIRS) break;
  }

  for (let i = 0; i < sorted.length; i += 1) {
    const asset = sorted[i];
    if ((counts.get(asset.assetKey) || 0) >= MIN_PAIRS_PER_ASSET) continue;

    for (let delta = 1; delta < sorted.length && candidates.length < MAX_GENERATED_PAIRS; delta += 1) {
      const leftIdx = i - delta;
      const rightIdx = i + delta;

      if (leftIdx >= 0) addCandidate(asset, sorted[leftIdx]);
      if ((counts.get(asset.assetKey) || 0) >= MIN_PAIRS_PER_ASSET) break;
      if (rightIdx < sorted.length) addCandidate(asset, sorted[rightIdx]);
      if ((counts.get(asset.assetKey) || 0) >= MIN_PAIRS_PER_ASSET) break;

      if (leftIdx < 0 && rightIdx >= sorted.length) break;
    }
  }

  candidates.sort((a, b) => a.closeness - b.closeness || b.combinedMid - a.combinedMid);
  const featuredSet = new Set(candidates.slice(0, FEATURED_PAIR_COUNT).map((pair) => pair.pairKey));

  return candidates.map((pair) => ({
    leftKey: pair.leftKey,
    rightKey: pair.rightKey,
    prompt: buildPrompt(pair.pairKey),
    featured: featuredSet.has(pair.pairKey),
  }));
}

export function parseMarketpollSeedCsv(csvText: string): ParsedMarketSeedData {
  const errors: string[] = [];
  const assets: ParsedMarketSeedAsset[] = [];
  const seen = new Set<string>();

  const lines = String(csvText || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const lineNo = i + 1;
    const line = String(rawLine || "").trim();

    if (!line || line.startsWith("#")) continue;
    if (/^asset_key\s*,\s*seed_range\b/i.test(line)) continue;

    const cols = parseCsvRow(rawLine);
    if (cols.length < 2) {
      errors.push(`line ${lineNo}: expected asset_key,seed_range`);
      continue;
    }

    const assetKey = String(cols[0] || "").trim();
    const seedRangeRaw = String(cols[1] || "").trim();

    if (!assetKey) {
      errors.push(`line ${lineNo}: invalid asset key`);
      continue;
    }
    if (!seedRangeRaw) continue;
    if (seen.has(assetKey)) {
      errors.push(`line ${lineNo}: duplicate asset key ${assetKey}`);
      continue;
    }
    seen.add(assetKey);

    const parsed = parseSeedRange(seedRangeRaw);
    if (!parsed.ok) {
      errors.push(`line ${lineNo}: ${parsed.error || "invalid range"}`);
      continue;
    }

    assets.push({
      assetKey,
      seedRangeRaw,
      minX: Number(parsed.minX),
      maxX: Number(parsed.maxX),
      midX: Number(parsed.midX),
      tierId: String(parsed.tierId),
      tierIndex: Number(parsed.tierIndex),
    });
  }

  assets.sort((a, b) => a.assetKey.localeCompare(b.assetKey));
  const pairs = generatePairs(assets);
  return { assets, pairs, errors };
}

export function loadMarketpollSeedCsvFromRepo(): string {
  const csvPath = path.resolve(process.cwd(), "data", "marketpoll_seeds.csv");
  return fs.readFileSync(csvPath, "utf8");
}

export function buildSeedAssetRows(assets: ParsedMarketSeedAsset[]) {
  return assets.map((asset) => ({
    key: asset.assetKey,
    label: labelFromAssetKey(asset.assetKey),
    tier: asset.tierId,
    imageUrl: null,
    active: true,
    metadata: {
      source: "marketpoll_seeds.csv",
      seedRange: asset.seedRangeRaw,
      minX: asset.minX,
      maxX: asset.maxX,
      midX: asset.midX,
      tierIndex: asset.tierIndex,
    },
  }));
}
