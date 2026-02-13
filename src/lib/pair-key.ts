function toBundleKey(assetOrAssets: string | string[]): string {
  const list = Array.isArray(assetOrAssets) ? assetOrAssets : [assetOrAssets];
  return [...new Set(list.map((entry) => String(entry || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join(" + ");
}

export function canonicalPairKey(a: string | string[], b: string | string[]): string {
  const left = toBundleKey(a);
  const right = toBundleKey(b);
  return [left, right].sort((x, y) => x.localeCompare(y)).join("::");
}

export function labelFromAssetKey(assetKey: string): string {
  const [name, gender] = String(assetKey || "Unknown").split("|");
  const normalized = String(gender || "").trim().toUpperCase();
  const symbol = normalized === "M" ? "♂" : normalized === "F" ? "♀" : normalized === "?" ? "⚲" : "";
  return `${name || "Unknown"} ${symbol}`.trim();
}
