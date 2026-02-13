#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const SOURCE_URL = "https://tppcrpg.net/rarity.html";
const OUTPUT_PATH = path.resolve(process.cwd(), "data", "tppc_rarity.json");

function decodeHtmlEntities(input) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    eacute: "e",
  };

  return String(input || "")
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number.parseInt(code, 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const value = Number.parseInt(code, 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : _;
    })
    .replace(/&([a-z]+);/gi, (full, name) => named[name.toLowerCase()] || full);
}

function parseIntSafe(raw) {
  const value = Number.parseInt(String(raw || "").trim().replace(/,/g, ""), 10);
  return Number.isFinite(value) ? value : 0;
}

function fetchText(url, depth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const statusCode = Number(res.statusCode || 0);
      const location = String(res.headers?.location || "").trim();
      if (statusCode >= 300 && statusCode < 400 && location) {
        res.resume();
        if (depth >= 4) {
          reject(new Error(`too many redirects for ${url}`));
          return;
        }
        const redirected = new URL(location, url).toString();
        fetchText(redirected, depth + 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve(body));
      res.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("request timeout"));
    });
  });
}

function parseRarityHtml(html) {
  const text = String(html || "");
  const lastUpdatedMatch = text.match(/Last Updated:\s*([^<]+)/i);
  const lastUpdated = lastUpdatedMatch ? decodeHtmlEntities(lastUpdatedMatch[1]).trim() : null;

  const rowPattern =
    /<tr[^>]*>\s*<td>([^<]*)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/gi;

  const entries = {};
  let match = null;

  while ((match = rowPattern.exec(text)) !== null) {
    const rank = parseIntSafe(match[1]);
    const name = decodeHtmlEntities(match[2])
      .replace(/<[^>]+>/g, "")
      .trim();

    if (!name) continue;

    entries[name] = {
      rank,
      male: parseIntSafe(match[3]),
      female: parseIntSafe(match[4]),
      genderless: parseIntSafe(match[5]),
      ungendered: parseIntSafe(match[6]),
      total: parseIntSafe(match[7]),
    };
  }

  return {
    source: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    lastUpdated,
    count: Object.keys(entries).length,
    entries,
  };
}

async function main() {
  const html = await fetchText(SOURCE_URL);
  const parsed = parseRarityHtml(html);

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  console.log(
    `[rarity] wrote ${parsed.count} entries to ${OUTPUT_PATH} (last updated: ${parsed.lastUpdated || "unknown"})`
  );
}

main().catch((error) => {
  console.error("[rarity] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
