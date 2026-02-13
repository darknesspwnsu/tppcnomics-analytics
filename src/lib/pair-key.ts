export function canonicalPairKey(a: string, b: string): string {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  return [left, right].sort((x, y) => x.localeCompare(y)).join("::");
}

export function labelFromAssetKey(assetKey: string): string {
  const [name, gender] = String(assetKey || "Unknown").split("|");
  const normalizedGender = gender === "?" ? "(?)" : gender || "";
  return `${name || "Unknown"} ${normalizedGender}`.trim();
}
