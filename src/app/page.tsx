"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type AssetMetadata = {
  seedRange?: string;
  minX?: number;
  maxX?: number;
  midX?: number;
  [key: string]: unknown;
};

type Asset = {
  id: string;
  key: string;
  label: string;
  tier: string | null;
  imageUrl: string | null;
  elo: number | null;
  metadata: AssetMetadata | null;
};

type MatchupResponse = {
  ok: boolean;
  pair: {
    id: string;
    pairKey: string;
    prompt: string | null;
    featured: boolean;
    matchupMode: string;
    leftAssets: Asset[];
    rightAssets: Asset[];
    leftAsset: Asset;
    rightAsset: Asset;
  };
  voter: {
    visitorId: string;
    xp: number;
    streakDays: number;
    totalVotes: number;
  };
  error?: string;
};

type VoteResponse = {
  ok: boolean;
  voter: {
    visitorId: string;
    xpGain: number;
    xp: number;
    streakDays: number;
    totalVotes: number;
  };
  error?: string;
};

type VoteSide = "LEFT" | "RIGHT" | "SKIP";

const SWIPE_THRESHOLD_PX = 84;
const SPRITE_PROVIDER = process.env.NEXT_PUBLIC_SPRITE_PROVIDER === "pokeapi" ? "pokeapi" : "tppc";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseAssetNameAndGender(assetKey: string): { name: string; gender: string } {
  const [rawNamePart, rawGenderPart] = String(assetKey || "").split("|");
  return {
    name: String(rawNamePart || "").trim(),
    gender: String(rawGenderPart || "").trim().toUpperCase(),
  };
}

function genderSymbol(gender: string): string {
  const normalized = String(gender || "").trim().toUpperCase();
  if (normalized === "M") return "♂";
  if (normalized === "F") return "♀";
  if (normalized === "?") return "⚲";
  return "";
}

function displayAssetName(asset: Asset): string {
  const parsed = parseAssetNameAndGender(asset.key);
  const symbol = genderSymbol(parsed.gender);
  const fallback = String(asset.label || "Unknown")
    .trim()
    .replace(/\s+(?:M|F|\(\?\)|♂|♀|⚲)$/u, "");
  const base = parsed.name || fallback || "Unknown";
  return symbol ? `${base} ${symbol}` : base;
}

function rarityLabel(asset: Asset): string {
  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : null;
  const seedRange = metadata?.seedRange;
  if (typeof seedRange === "string" && seedRange.trim()) {
    return seedRange.trim();
  }
  if (asset.tier && asset.tier.trim()) {
    return `${asset.tier} tier`;
  }
  return "Unknown";
}

export default function Home() {
  const [pair, setPair] = useState<MatchupResponse["pair"] | null>(null);
  const [voter, setVoter] = useState<MatchupResponse["voter"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string>("Loading next arena matchup...");
  const [lastXpGain, setLastXpGain] = useState<number | null>(null);
  const [swipeDeltaX, setSwipeDeltaX] = useState(0);
  const swipeStartXRef = useRef<number | null>(null);

  const canVote = Boolean(pair) && !loading && !submitting;

  const loadNextMatchup = useCallback(async (excludePairId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (excludePairId) params.set("excludePairId", excludePairId);
      const path = params.size ? `/api/matchups/next?${params.toString()}` : "/api/matchups/next";

      const response = await fetch(path, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const data = (await response.json()) as MatchupResponse;

      if (!response.ok || !data.ok) {
        setPair(null);
        setStatusText(data.error || "Could not load matchup.");
        return;
      }

      setPair(data.pair);
      setVoter(data.voter);
      setStatusText("Swipe or tap an arena side.");
    } catch {
      setPair(null);
      setStatusText("Network error while loading matchup.");
    } finally {
      setLoading(false);
    }
  }, []);

  const submitVote = useCallback(
    async (selectedSide: VoteSide) => {
      if (!pair || submitting) return;

      setSubmitting(true);
      setStatusText("Recording vote...");

      try {
        const response = await fetch("/api/votes", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            pairId: pair.id,
            selectedSide,
          }),
        });

        const data = (await response.json()) as VoteResponse;
        if (!response.ok || !data.ok) {
          setStatusText(data.error || "Vote failed.");
          return;
        }

        setVoter({
          visitorId: data.voter.visitorId,
          xp: data.voter.xp,
          streakDays: data.voter.streakDays,
          totalVotes: data.voter.totalVotes,
        });
        setLastXpGain(data.voter.xpGain);
        setStatusText(`Vote saved. +${data.voter.xpGain} XP`);
        await loadNextMatchup(pair.id);
      } catch {
        setStatusText("Network error while submitting vote.");
      } finally {
        setSubmitting(false);
        setSwipeDeltaX(0);
      }
    },
    [loadNextMatchup, pair, submitting]
  );

  useEffect(() => {
    void loadNextMatchup();
  }, [loadNextMatchup]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        void submitVote("LEFT");
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        void submitVote("RIGHT");
      }
      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        void submitVote("SKIP");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submitVote]);

  const modeLabel = pair?.matchupMode || "1v1";
  const swipeDirection = swipeDeltaX > 16 ? "RIGHT" : swipeDeltaX < -16 ? "LEFT" : null;
  const arenaTransform = {
    transform: `translateX(${clamp(swipeDeltaX / 6, -24, 24)}px) rotate(${clamp(swipeDeltaX / 28, -4, 4)}deg)`,
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_500px_at_-10%_-10%,rgba(110,231,255,0.35),transparent_60%),radial-gradient(900px_420px_at_110%_5%,rgba(251,191,36,0.30),transparent_58%),radial-gradient(900px_600px_at_50%_120%,rgba(59,130,246,0.12),transparent_70%)]" />
      <div className="arena-noise pointer-events-none absolute inset-0 opacity-[0.16]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-24 pt-5 sm:px-6 sm:pt-7 lg:px-10">
        <header className="animate-rise-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-700">TPPCNomics Arena</p>
              <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight text-slate-950 [font-family:var(--font-display)] sm:text-3xl">
                Swipe the Market
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-700">{statusText}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/analytics"
                className="glass-panel animate-pop-in rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-800 transition hover:bg-white"
              >
                Analytics
              </Link>
              <div className="glass-panel animate-pop-in rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                Mode {modeLabel}
              </div>
            </div>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <StatusChip label="XP" value={String(voter?.xp ?? 0)} tone="sky" />
          <StatusChip label="Streak" value={`${voter?.streakDays ?? 0}d`} tone="amber" />
          <StatusChip label="Votes" value={String(voter?.totalVotes ?? 0)} tone="violet" />
          <StatusChip label="Last Gain" value={lastXpGain ? `+${lastXpGain}` : "—"} tone="emerald" />
        </section>

        <section
          className="mt-5 flex-1"
          onPointerDown={(event) => {
            swipeStartXRef.current = event.clientX;
          }}
          onPointerMove={(event) => {
            const start = swipeStartXRef.current;
            if (start == null || !canVote) return;
            setSwipeDeltaX(event.clientX - start);
          }}
          onPointerUp={() => {
            const delta = swipeDeltaX;
            swipeStartXRef.current = null;
            if (!canVote) {
              setSwipeDeltaX(0);
              return;
            }
            if (Math.abs(delta) < SWIPE_THRESHOLD_PX) {
              setSwipeDeltaX(0);
              return;
            }
            void submitVote(delta > 0 ? "RIGHT" : "LEFT");
          }}
          onPointerCancel={() => {
            swipeStartXRef.current = null;
            setSwipeDeltaX(0);
          }}
        >
          <div
            className="grid min-h-[56vh] gap-3 transition-transform duration-150 md:grid-cols-[1fr_auto_1fr] md:gap-5"
            style={arenaTransform}
          >
            <VoteCard
              key={`left-${pair?.id || "empty"}`}
              sideLabel="LEFT"
              assets={pair?.leftAssets || (pair?.leftAsset ? [pair.leftAsset] : [])}
              prompt={pair?.prompt || "Which side wins this matchup?"}
              disabled={!canVote}
              onPick={() => void submitVote("LEFT")}
              tone="left"
              swipeHint={swipeDirection === "LEFT"}
            />

            <div className="hidden items-center justify-center md:flex">
              <div className="animate-soft-pulse glass-panel rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-[0.16em] text-slate-700">
                VS
              </div>
            </div>

            <VoteCard
              key={`right-${pair?.id || "empty"}`}
              sideLabel="RIGHT"
              assets={pair?.rightAssets || (pair?.rightAsset ? [pair.rightAsset] : [])}
              prompt={pair?.prompt || "Which side wins this matchup?"}
              disabled={!canVote}
              onPick={() => void submitVote("RIGHT")}
              tone="right"
              swipeHint={swipeDirection === "RIGHT"}
            />
          </div>
        </section>

        <section className="sticky bottom-0 z-20 mt-6">
          <div className="glass-panel rounded-2xl px-3 py-3 shadow-lg shadow-slate-900/10">
            <div className="flex items-center justify-between gap-2">
              <ActionButton
                label="Left"
                hint="←"
                tone="left"
                disabled={!canVote}
                onClick={() => void submitVote("LEFT")}
              />
              <ActionButton
                label="Skip"
                hint="Space"
                tone="skip"
                disabled={!canVote}
                onClick={() => void submitVote("SKIP")}
              />
              <ActionButton
                label="Right"
                hint="→"
                tone="right"
                disabled={!canVote}
                onClick={() => void submitVote("RIGHT")}
              />
            </div>
          </div>
        </section>

        <footer className="mt-3 flex items-center justify-between text-[11px] text-slate-600">
          <span className="truncate">Pair {pair?.pairKey || "loading..."}</span>
          <span className="uppercase tracking-wider">{modeLabel}</span>
        </footer>
      </main>
    </div>
  );
}

function StatusChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "sky" | "amber" | "violet" | "emerald";
}) {
  const toneClass =
    tone === "sky"
      ? "from-cyan-300/40 to-sky-100/80"
      : tone === "amber"
        ? "from-amber-300/45 to-orange-100/80"
        : tone === "violet"
          ? "from-indigo-300/40 to-violet-100/80"
          : "from-emerald-300/45 to-green-100/80";

  return (
    <div className={`animate-rise-in rounded-xl border border-white/70 bg-gradient-to-br ${toneClass} px-3 py-2`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  hint,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  tone: "left" | "skip" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const toneClasses =
    tone === "left"
      ? "border-rose-300 bg-gradient-to-b from-rose-400 to-rose-500 text-white shadow-rose-500/30"
      : tone === "right"
        ? "border-emerald-300 bg-gradient-to-b from-emerald-400 to-emerald-500 text-white shadow-emerald-500/30"
        : "border-slate-300 bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 shadow-slate-300/30";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group inline-flex min-w-[30%] flex-1 flex-col items-center justify-center rounded-2xl border px-3 py-2 text-center shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses}`}
    >
      <span className="text-sm font-extrabold uppercase tracking-wide">{label}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-85">{hint}</span>
    </button>
  );
}

function VoteCard({
  sideLabel,
  assets,
  prompt,
  disabled,
  onPick,
  tone,
  swipeHint,
}: {
  sideLabel: "LEFT" | "RIGHT";
  assets: Asset[];
  prompt: string;
  disabled: boolean;
  onPick: () => void;
  tone: "left" | "right";
  swipeHint: boolean;
}) {
  const [failedAssetKeys, setFailedAssetKeys] = useState<string[]>([]);
  const activeAssets = assets.slice(0, 2);
  const title = activeAssets.length ? activeAssets.map((asset) => displayAssetName(asset)).join(" + ") : "Loading...";
  const tierLabel = activeAssets.length
    ? [...new Set(activeAssets.map((asset) => asset.tier || "Unranked"))].join(" / ")
    : "Unranked";
  const rarityTags = activeAssets.map((asset) => ({
    key: asset.key,
    name: displayAssetName(asset),
    rarity: rarityLabel(asset),
  }));
  const avgElo = activeAssets.length
    ? activeAssets.reduce((sum, asset) => sum + (Number(asset.elo) || 1500), 0) / activeAssets.length
    : 1500;

  const toneClasses =
    tone === "left"
      ? "border-cyan-300/80 from-cyan-100/85 via-white to-cyan-50/70"
      : "border-amber-300/80 from-amber-100/85 via-white to-orange-50/70";

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-b p-4 text-left shadow-md transition duration-200 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 sm:p-5 ${toneClasses} ${swipeHint ? "ring-4 ring-emerald-300/50" : ""}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_90%_0%,rgba(255,255,255,0.75),transparent_60%)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">{sideLabel}</p>
          <span className="rounded-full border border-slate-200/90 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
            Team {activeAssets.length || 1}
          </span>
        </div>

        <div className="mt-3 flex min-h-28 items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-2 py-2 shadow-inner">
          {activeAssets.length ? (
            activeAssets.map((asset) => {
              const params = new URLSearchParams({ assetKey: asset.key });
              if (SPRITE_PROVIDER !== "tppc") params.set("prefer", SPRITE_PROVIDER);
              const spriteUrl = `/api/sprites?${params.toString()}`;
              const imageFailed = failedAssetKeys.includes(asset.key);

              return imageFailed ? (
                <span
                  key={`${asset.key}-missing`}
                  className="inline-flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-slate-300 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  No sprite
                </span>
              ) : (
                <Image
                  key={asset.key}
                  src={spriteUrl}
                  alt={`${displayAssetName(asset)} sprite`}
                  width={96}
                  height={96}
                  unoptimized
                  className={`h-24 w-24 object-contain ${SPRITE_PROVIDER === "pokeapi" ? "sprite-gold-filter" : ""}`}
                  style={{ imageRendering: "pixelated" }}
                  onError={() => {
                    setFailedAssetKeys((prev) => (prev.includes(asset.key) ? prev : [...prev, asset.key]));
                  }}
                />
              );
            })
          ) : (
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">No sprite</span>
          )}
        </div>

        <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 [font-family:var(--font-display)] sm:text-[2rem]">
          {title}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm text-slate-700">{prompt}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rarityTags.map((tag) => (
            <span
              key={`${tag.key}-rarity`}
              className="rounded-full border border-slate-300 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
            >
              {tag.name}: {tag.rarity}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white">{tierLabel}</span>
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-800">
            Elo {Math.round(avgElo)}
          </span>
        </div>
      </div>
    </button>
  );
}
