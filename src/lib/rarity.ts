import rarityData from "../../data/tppc_rarity.json";

type RarityEntry = {
  rank: number;
  male: number;
  female: number;
  genderless: number;
  ungendered: number;
  total: number;
};

type RarityPayload = {
  source: string;
  fetchedAt: string;
  lastUpdated: string | null;
  count: number;
  entries: Record<string, RarityEntry>;
};

type RarityColumn = "male" | "female" | "genderless" | "ungendered" | "total";

export type AssetRarity = {
  found: boolean;
  rank: number | null;
  count: number | null;
  column: RarityColumn | null;
  source: string;
  sourceLastUpdated: string | null;
  breakdown: {
    male: number;
    female: number;
    genderless: number;
    ungendered: number;
    total: number;
  } | null;
};

const payload = rarityData as RarityPayload;
const entries = payload?.entries || {};

const byLower = new Map<string, RarityEntry>();
const byNormalized = new Map<string, RarityEntry>();

function normalizeName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

for (const [name, entry] of Object.entries(entries)) {
  const lower = name.toLowerCase();
  if (!byLower.has(lower)) {
    byLower.set(lower, entry);
  }

  const normalized = normalizeName(name);
  if (!byNormalized.has(normalized)) {
    byNormalized.set(normalized, entry);
  }
}

function splitAssetKey(assetKey: string): { name: string; gender: string } {
  const [rawName, rawGender] = String(assetKey || "").split("|");
  return {
    name: String(rawName || "").trim(),
    gender: String(rawGender || "").trim().toUpperCase(),
  };
}

function findEntryByName(name: string): RarityEntry | null {
  if (!name) return null;

  return (
    entries[name] ||
    byLower.get(name.toLowerCase()) ||
    byNormalized.get(normalizeName(name)) ||
    null
  );
}

function pickColumn(entry: RarityEntry, gender: string): RarityColumn {
  if (gender === "M") return "male";
  if (gender === "F") return "female";

  const genderless = Number(entry.genderless) || 0;
  const ungendered = Number(entry.ungendered) || 0;

  if (genderless > 0 && ungendered > 0) return "total";
  if (genderless > 0) return "genderless";
  if (ungendered > 0) return "ungendered";
  return "total";
}

export function getRarityForAssetKey(assetKey: string): AssetRarity {
  const split = splitAssetKey(assetKey);
  const entry = findEntryByName(split.name);

  if (!entry) {
    return {
      found: false,
      rank: null,
      count: null,
      column: null,
      source: payload?.source || "https://tppcrpg.net/rarity.html",
      sourceLastUpdated: payload?.lastUpdated || null,
      breakdown: null,
    };
  }

  const column = pickColumn(entry, split.gender);
  const count = Number(entry[column]);

  return {
    found: true,
    rank: Number.isFinite(entry.rank) ? Number(entry.rank) : null,
    count: Number.isFinite(count) ? count : 0,
    column,
    source: payload?.source || "https://tppcrpg.net/rarity.html",
    sourceLastUpdated: payload?.lastUpdated || null,
    breakdown: {
      male: Number(entry.male) || 0,
      female: Number(entry.female) || 0,
      genderless: Number(entry.genderless) || 0,
      ungendered: Number(entry.ungendered) || 0,
      total: Number(entry.total) || 0,
    },
  };
}
