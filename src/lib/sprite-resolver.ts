import pokedexMap from "../../data/pokedex_map.json";

export type SpriteProviderPreference = "tppc" | "pokeapi";
export type SpriteProvider = "tppc" | "pokeapi";
export type SpriteVariant = "normal" | "golden" | "shiny" | "dark";

export type ResolvedAssetSprite = {
  assetKey: string;
  rawName: string;
  pokemonName: string;
  gender: string;
  variant: SpriteVariant;
  pokedexEntryKey: string | null;
  dexNumber: number | null;
  form: number;
};

export type SpriteCandidate = {
  provider: SpriteProvider;
  url: string;
};

const GRAPHICS_BASE_URL = "https://graphics.tppcrpg.net";
const POKEAPI_SPRITES_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

const POKEDEX_BY_NAME = pokedexMap as Record<string, string>;
const POKEDEX_BY_LOWER = new Map<string, string>();
const POKEDEX_BY_NORMALIZED = new Map<string, string>();

for (const [name, key] of Object.entries(POKEDEX_BY_NAME)) {
  POKEDEX_BY_LOWER.set(name.toLowerCase(), key);
  const normalized = normalizePokemonName(name);
  if (!POKEDEX_BY_NORMALIZED.has(normalized)) {
    POKEDEX_BY_NORMALIZED.set(normalized, key);
  }
}

function normalizePokemonName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseEntryKey(entryKey: string): { dexNumber: number | null; form: number } {
  const [rawDex, rawForm] = String(entryKey || "").split("-");
  const dexNumber = Number.parseInt(rawDex, 10);
  const form = Number.parseInt(rawForm || "0", 10);

  return {
    dexNumber: Number.isInteger(dexNumber) && dexNumber > 0 ? dexNumber : null,
    form: Number.isInteger(form) && form >= 0 ? form : 0,
  };
}

function resolvePokedexEntryKey(nameRaw: string): string | null {
  const name = String(nameRaw || "").trim();
  if (!name) return null;

  return (
    POKEDEX_BY_NAME[name] ||
    POKEDEX_BY_LOWER.get(name.toLowerCase()) ||
    POKEDEX_BY_NORMALIZED.get(normalizePokemonName(name)) ||
    null
  );
}

function resolveVariantAndName(rawName: string): { variant: SpriteVariant; pokemonName: string } {
  const clean = String(rawName || "").trim();
  if (!clean) return { variant: "normal", pokemonName: "" };

  const checks: Array<{ prefix: string; variant: SpriteVariant }> = [
    { prefix: "golden", variant: "golden" },
    { prefix: "shiny", variant: "shiny" },
    { prefix: "dark", variant: "dark" },
  ];

  for (const check of checks) {
    if (clean.toLowerCase().startsWith(check.prefix)) {
      const pokemonName = clean.slice(check.prefix.length).trim();
      return { variant: check.variant, pokemonName: pokemonName || clean };
    }
  }

  return { variant: "normal", pokemonName: clean };
}

function genderCandidates(rawGender: string): Array<"M" | "F"> {
  const normalized = String(rawGender || "").trim().toUpperCase();
  if (normalized === "F") return ["F", "M"];
  if (normalized === "M") return ["M", "F"];
  return ["M", "F"];
}

function buildTppcSpriteUrls({
  dexNumber,
  form,
  variant,
  gender,
}: {
  dexNumber: number;
  form: number;
  variant: SpriteVariant;
  gender: string;
}): string[] {
  const dex = String(dexNumber).padStart(3, "0");
  const formSuffix = form > 0 ? `-${form}` : "";
  const urls = genderCandidates(gender).map(
    (letter) => `${GRAPHICS_BASE_URL}/xy/${variant}/${dex}${letter}${formSuffix}.gif`
  );
  return [...new Set(urls)];
}

function buildPokeapiSpriteUrls(dexNumber: number, variant: SpriteVariant): string[] {
  const urls: string[] = [];

  if (variant === "shiny") {
    urls.push(`${POKEAPI_SPRITES_BASE}/shiny/${dexNumber}.png`);
  }

  urls.push(`${POKEAPI_SPRITES_BASE}/other/official-artwork/${dexNumber}.png`);
  urls.push(`${POKEAPI_SPRITES_BASE}/${dexNumber}.png`);

  return urls;
}

function orderedProviders(prefer: SpriteProviderPreference): SpriteProvider[] {
  return prefer === "pokeapi" ? ["pokeapi", "tppc"] : ["tppc", "pokeapi"];
}

export function resolveAssetSprite(assetKey: string): ResolvedAssetSprite {
  const [rawNamePart, rawGenderPart] = String(assetKey || "").split("|");
  const rawName = String(rawNamePart || "").trim();
  const gender = String(rawGenderPart || "").trim().toUpperCase() || "M";

  const variantAndName = resolveVariantAndName(rawName);
  const pokedexEntryKey = resolvePokedexEntryKey(variantAndName.pokemonName);
  const parsedEntry = parseEntryKey(pokedexEntryKey || "");

  return {
    assetKey: String(assetKey || ""),
    rawName,
    pokemonName: variantAndName.pokemonName,
    gender,
    variant: variantAndName.variant,
    pokedexEntryKey,
    dexNumber: parsedEntry.dexNumber,
    form: parsedEntry.form,
  };
}

export function buildSpriteCandidates(
  assetKey: string,
  prefer: SpriteProviderPreference = "tppc"
): SpriteCandidate[] {
  const resolved = resolveAssetSprite(assetKey);
  if (!resolved.dexNumber) return [];

  const tppcCandidates = buildTppcSpriteUrls({
    dexNumber: resolved.dexNumber,
    form: resolved.form,
    variant: resolved.variant,
    gender: resolved.gender,
  }).map((url) => ({ provider: "tppc" as const, url }));

  const pokeapiCandidates = buildPokeapiSpriteUrls(resolved.dexNumber, resolved.variant).map((url) => ({
    provider: "pokeapi" as const,
    url,
  }));

  const byProvider: Record<SpriteProvider, SpriteCandidate[]> = {
    tppc: tppcCandidates,
    pokeapi: pokeapiCandidates,
  };

  return orderedProviders(prefer).flatMap((provider) => byProvider[provider]);
}
