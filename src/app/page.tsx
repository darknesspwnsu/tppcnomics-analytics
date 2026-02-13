"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Asset = {
  id: string;
  key: string;
  label: string;
  tier: string | null;
  imageUrl: string | null;
  elo: number | null;
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

const SWIPE_THRESHOLD_PX = 70;
const SPRITE_PROVIDER = process.env.NEXT_PUBLIC_SPRITE_PROVIDER === "pokeapi" ? "pokeapi" : "tppc";

export default function Home() {
  const [pair, setPair] = useState<MatchupResponse["pair"] | null>(null);
  const [voter, setVoter] = useState<MatchupResponse["voter"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState<string>("Loading your next matchup...");
  const [lastXpGain, setLastXpGain] = useState<number | null>(null);
  const swipeStartXRef = useRef<number | null>(null);

  const voterSummary = useMemo(() => {
    if (!voter) return "No vote history yet";
    return `XP ${voter.xp} · Streak ${voter.streakDays} · Votes ${voter.totalVotes}`;
  }, [voter]);

  const loadNextMatchup = useCallback(async (excludePairId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (excludePairId) {
        params.set("excludePairId", excludePairId);
      }
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
      setStatusText("Pick one side or swipe.");
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
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submitVote]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-white to-orange-50">
      <div className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-16 h-72 w-72 rounded-full bg-orange-200/50 blur-3xl" />

      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-10 md:px-10">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">TPPCNomics Arena</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            Vote the market, one matchup at a time
          </h1>
          <p className="mt-2 text-sm text-slate-600">{statusText}</p>
        </header>

        <section className="mb-6 grid gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur md:grid-cols-3">
          <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-wider text-slate-300">Profile</p>
            <p className="mt-1 text-sm font-semibold">{voterSummary}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Input</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              Tap cards, use <code className="rounded bg-slate-200 px-1">←</code> /{" "}
              <code className="rounded bg-slate-200 px-1">→</code>, or swipe.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Last XP</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {lastXpGain ? `+${lastXpGain}` : "No vote yet"}
            </p>
          </div>
        </section>

        <section
          className="grid flex-1 gap-4 md:grid-cols-2"
          onPointerDown={(event) => {
            swipeStartXRef.current = event.clientX;
          }}
          onPointerUp={(event) => {
            const start = swipeStartXRef.current;
            swipeStartXRef.current = null;
            if (start == null || !pair || submitting) return;
            const delta = event.clientX - start;
            if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
            void submitVote(delta > 0 ? "RIGHT" : "LEFT");
          }}
        >
          <VoteCard
            sideLabel="LEFT"
            assets={pair?.leftAssets || (pair?.leftAsset ? [pair.leftAsset] : [])}
            prompt={pair?.prompt || "Which one wins this round?"}
            disabled={loading || submitting || !pair}
            onPick={() => void submitVote("LEFT")}
            tone="left"
          />
          <VoteCard
            sideLabel="RIGHT"
            assets={pair?.rightAssets || (pair?.rightAsset ? [pair.rightAsset] : [])}
            prompt={pair?.prompt || "Which one wins this round?"}
            disabled={loading || submitting || !pair}
            onPick={() => void submitVote("RIGHT")}
            tone="right"
          />
        </section>

        <footer className="mt-6 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Pair: {pair?.pairKey || "Loading..."} {pair?.matchupMode ? `(${pair.matchupMode})` : ""}
          </p>
          <button
            type="button"
            onClick={() => void submitVote("SKIP")}
            disabled={loading || submitting || !pair}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Skip
          </button>
        </footer>
      </main>
    </div>
  );
}

function VoteCard({
  sideLabel,
  assets,
  prompt,
  disabled,
  onPick,
  tone,
}: {
  sideLabel: "LEFT" | "RIGHT";
  assets: Asset[];
  prompt: string;
  disabled: boolean;
  onPick: () => void;
  tone: "left" | "right";
}) {
  const [failedAssetKeys, setFailedAssetKeys] = useState<string[]>([]);
  const activeAssets = assets.slice(0, 2);
  const title = activeAssets.length ? activeAssets.map((asset) => asset.label).join(" + ") : "Loading...";
  const tierLabel = activeAssets.length
    ? [...new Set(activeAssets.map((asset) => asset.tier || "Unranked"))].join(" / ")
    : "Unranked";
  const avgElo = activeAssets.length
    ? activeAssets.reduce((sum, asset) => sum + (Number(asset.elo) || 1500), 0) / activeAssets.length
    : null;

  const toneClasses =
    tone === "left"
      ? "border-sky-300 bg-gradient-to-b from-sky-50 to-white"
      : "border-orange-300 bg-gradient-to-b from-orange-50 to-white";

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`group rounded-3xl border p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 ${toneClasses}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{sideLabel}</p>
      <div className="mt-4 flex h-32 items-center justify-center gap-3 rounded-2xl border border-slate-200/90 bg-white/90">
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
                alt={`${asset.label} sprite`}
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
      <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{prompt}</p>
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{tierLabel}</span>
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            Elo {avgElo ? Math.round(avgElo) : 1500}
          </span>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tap to vote</span>
      </div>
    </button>
  );
}
