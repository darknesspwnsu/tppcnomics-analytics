function toBundleKey(assetOrAssets: string | string[]): string {
  const list = Array.isArray(assetOrAssets) ? assetOrAssets : [assetOrAssets];
  return [...new Set(list.map((entry) => String(entry || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join(" + ");
}

function genderDisplaySuffix(code: string): string {
  const normalized = String(code || "").trim().toUpperCase();
  if (normalized === "M") return "♂";
  if (normalized === "F") return "♀";
  if (normalized === "G" || normalized === "⚲") return "G";
  if (normalized === "U" || normalized === "?") return "(?)";
  return "";
}

export function normalizeGenderLabel(label: string): string {
  const input = String(label || "").trim();
  const match = input.match(/^(.*?)(?:\s+(M|F|U|\?|G|\(\?\)|♂|♀|⚲))?$/iu);
  if (!match) return input;

  const base = String(match[1] || "").trim();
  const rawSuffix = String(match[2] || "").trim();
  if (!rawSuffix) return base;

  const suffix = genderDisplaySuffix(rawSuffix);
  return suffix ? `${base} ${suffix}` : base;
}

export function canonicalPairKey(a: string | string[], b: string | string[]): string {
  const left = toBundleKey(a);
  const right = toBundleKey(b);
  return [left, right].sort((x, y) => x.localeCompare(y)).join("::");
}

export function labelFromAssetKey(assetKey: string): string {
  const [name, gender] = String(assetKey || "Unknown").split("|");
  const symbol = genderDisplaySuffix(gender);
  return `${name || "Unknown"} ${symbol}`.trim();
}
