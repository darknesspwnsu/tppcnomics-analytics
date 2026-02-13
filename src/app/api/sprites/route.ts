import { NextRequest, NextResponse } from "next/server";

import { buildSpriteCandidates, type SpriteProviderPreference } from "@/lib/sprite-resolver";

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

function parseProviderPreference(raw: string | null): SpriteProviderPreference {
  return raw === "pokeapi" ? "pokeapi" : "tppc";
}

async function fetchImage(url: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "force-cache",
      signal: controller.signal,
      headers: {
        accept: "image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) return null;

    const body = await response.arrayBuffer();
    if (!body.byteLength) return null;

    return { body, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const assetKey = String(request.nextUrl.searchParams.get("assetKey") || "").trim();
  if (!assetKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing assetKey query parameter.",
      },
      { status: 400 }
    );
  }

  const prefer = parseProviderPreference(request.nextUrl.searchParams.get("prefer"));
  const candidates = buildSpriteCandidates(assetKey, prefer);

  for (const candidate of candidates) {
    const image = await fetchImage(candidate.url);
    if (!image) continue;

    return new NextResponse(image.body, {
      status: 200,
      headers: {
        "content-type": image.contentType,
        "cache-control": CACHE_CONTROL,
        "x-sprite-provider": candidate.provider,
      },
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: `No sprite found for asset key: ${assetKey}`,
    },
    { status: 404 }
  );
}
