"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalyticsSnapshot } from "@/lib/analytics";

type AnalyticsDashboardProps = {
  data: AnalyticsSnapshot;
};

const trendDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  style: "short",
  numeric: "auto",
});

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function compactLabel(label: string, max = 12): string {
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

function heatColor(intensity: number): string {
  const alpha = 0.12 + Math.max(0, Math.min(1, intensity)) * 0.78;
  return `rgba(16, 185, 129, ${alpha})`;
}

function formatRelative(dateIso: string): string {
  const now = Date.now();
  const then = new Date(dateIso).getTime();
  const diffMinutes = Math.round((then - now) / (60 * 1000));

  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) {
    return relativeTimeFormatter.format(diffHours, "hour");
  }

  return relativeTimeFormatter.format(Math.round(diffHours / 24), "day");
}

export function AnalyticsDashboard({ data }: AnalyticsDashboardProps) {
  const trendChartData = data.trend.map((point) => ({
    ...point,
    dateLabel: trendDayFormatter.format(new Date(`${point.date}T00:00:00Z`)),
  }));

  const leaderboardChartData = data.leaderboard.slice(0, 8).map((entry) => ({
    label: compactLabel(entry.label, 11),
    fullLabel: entry.label,
    elo: Math.round(entry.elo),
    pollsCount: entry.pollsCount,
    winRate: entry.winRate,
  }));

  const summaryCards = [
    {
      label: "Decisive Votes",
      value: data.summary.decisiveVotes.toLocaleString(),
      helper: `${data.summary.decisiveLast24h.toLocaleString()} in last 24h`,
      tone: "from-cyan-400/30 to-sky-200/50",
    },
    {
      label: "Total Votes",
      value: data.summary.totalVotes.toLocaleString(),
      helper: `${data.summary.skipVotes.toLocaleString()} skips`,
      tone: "from-emerald-400/30 to-lime-200/50",
    },
    {
      label: "Active Pairs",
      value: data.summary.activePairs.toLocaleString(),
      helper: `${data.summary.activeAssets.toLocaleString()} active assets`,
      tone: "from-amber-400/30 to-orange-200/50",
    },
    {
      label: "Participants",
      value: data.summary.uniqueVoters.toLocaleString(),
      helper: `${data.summary.scoredAssets.toLocaleString()} assets scored`,
      tone: "from-indigo-400/30 to-violet-200/50",
    },
  ];

  return (
    <div className="mt-5 space-y-4 pb-8 sm:mt-6 sm:space-y-5">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {summaryCards.map((card) => (
          <article
            key={card.label}
            className={`rounded-2xl border border-white/70 bg-gradient-to-br ${card.tone} px-3 py-3 shadow-sm sm:px-4`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">{card.label}</p>
            <p className="mt-1 text-xl font-black text-slate-950 [font-family:var(--font-display)] sm:text-2xl">
              {card.value}
            </p>
            <p className="mt-1 text-[11px] text-slate-700">{card.helper}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <article className="glass-panel rounded-3xl p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600">Trending Graph</p>
              <h2 className="text-xl font-black text-slate-950 [font-family:var(--font-display)]">Vote Velocity</h2>
            </div>
            <p className="text-[11px] text-slate-600">30-day window</p>
          </div>

          <div className="mt-2 h-64 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData} margin={{ top: 12, right: 6, left: -18, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.25)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => trendDayFormatter.format(new Date(`${value}T00:00:00Z`))}
                  tick={{ fontSize: 11, fill: "#475569" }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#475569" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ stroke: "rgba(14, 116, 144, 0.3)", strokeWidth: 1 }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    background: "rgba(255,255,255,0.95)",
                    fontSize: 12,
                  }}
                  labelFormatter={(value) => trendDayFormatter.format(new Date(`${String(value)}T00:00:00Z`))}
                />
                <Line
                  type="monotone"
                  dataKey="decisiveVotes"
                  name="Decisive votes"
                  stroke="#0284c7"
                  strokeWidth={2.4}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="trailingDecisive7d"
                  name="7-day avg"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="glass-panel rounded-3xl p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600">Graph</p>
              <h2 className="text-xl font-black text-slate-950 [font-family:var(--font-display)]">Top Elo Board</h2>
            </div>
            <p className="text-[11px] text-slate-600">Top 8</p>
          </div>

          <div className="mt-2 h-64 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leaderboardChartData} margin={{ top: 12, right: 0, left: -24, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.2)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#475569" }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#475569" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    background: "rgba(255,255,255,0.95)",
                    fontSize: 12,
                  }}
                  formatter={(value) => [Math.round(Number(value)), "Elo"]}
                  labelFormatter={(value) => {
                    const entry = leaderboardChartData.find((candidate) => candidate.label === value);
                    return entry?.fullLabel || String(value);
                  }}
                />
                <Bar dataKey="elo" radius={[10, 10, 0, 0]}>
                  {leaderboardChartData.map((entry) => (
                    <Cell
                      key={entry.fullLabel}
                      fill={entry.winRate >= 0.5 ? "rgba(16,185,129,0.8)" : "rgba(56,189,248,0.8)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="glass-panel rounded-3xl p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600">Heatmap</p>
              <h2 className="text-xl font-black text-slate-950 [font-family:var(--font-display)]">Vote Activity Grid</h2>
            </div>
            <p className="text-[11px] text-slate-600">Last 28 days</p>
          </div>

          <div className="mt-3 overflow-x-auto pb-1">
            <div className="min-w-[660px]">
              <div
                className="mb-1.5 grid gap-1"
                style={{ gridTemplateColumns: "64px repeat(24, minmax(0, 1fr))" }}
              >
                <div />
                {Array.from({ length: 24 }, (_, hour) => (
                  <div key={`hour-${hour}`} className="text-center text-[9px] font-semibold text-slate-500">
                    {hour % 3 === 0 ? hour : ""}
                  </div>
                ))}
              </div>

              {data.heatmap.days.map((day) => (
                <div
                  key={day.dayLabel}
                  className="mb-1 grid gap-1"
                  style={{ gridTemplateColumns: "64px repeat(24, minmax(0, 1fr))" }}
                >
                  <div className="pr-2 text-right text-[11px] font-semibold text-slate-600">{day.dayLabel}</div>
                  {day.cells.map((cell) => (
                    <div
                      key={`${day.dayLabel}-${cell.hour}`}
                      title={`${day.dayLabel} ${cell.hour}:00 • ${cell.votes} decisive votes`}
                      className="h-4 rounded-[4px] border border-white/50"
                      style={{ backgroundColor: heatColor(cell.intensity) }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="glass-panel rounded-3xl p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600">Most Likely Movers</p>
              <h2 className="text-xl font-black text-slate-950 [font-family:var(--font-display)]">Momentum Watchlist</h2>
            </div>
            <p className="text-[11px] text-slate-600">72h model</p>
          </div>

          <div className="mt-3 space-y-2">
            {data.movers.length ? (
              data.movers.map((mover) => {
                const toneClass =
                  mover.direction === "UP"
                    ? "border-emerald-300 bg-emerald-50"
                    : mover.direction === "DOWN"
                      ? "border-rose-300 bg-rose-50"
                      : "border-slate-300 bg-slate-50";

                return (
                  <article key={mover.assetId} className={`rounded-2xl border px-3 py-2 ${toneClass}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{mover.label}</p>
                        <p className="text-[11px] text-slate-600">
                          Elo {Math.round(mover.elo)} • {mover.recentMatches} recent matchups
                        </p>
                      </div>
                      <p className="text-sm font-extrabold text-slate-900">
                        {mover.projectedEloMove >= 0 ? "+" : ""}
                        {mover.projectedEloMove.toFixed(1)}
                      </p>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-700">
                      <span>Recent {formatPercent(mover.recentWinRate)}</span>
                      <span>Baseline {formatPercent(mover.baselineWinRate)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-slate-700"
                        style={{ width: `${Math.min(100, Math.max(4, Math.abs(mover.momentumScore) * 50))}%` }}
                      />
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                Not enough recent decisive votes to estimate movers yet.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="glass-panel rounded-3xl p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600">Outliers</p>
              <h2 className="text-xl font-black text-slate-950 [font-family:var(--font-display)]">Rating Extremes</h2>
            </div>
            <p className="text-[11px] text-slate-600">z-score view</p>
          </div>

          <div className="mt-3 space-y-2">
            {data.ratingOutliers.length ? (
              data.ratingOutliers.map((outlier) => (
                <article
                  key={outlier.assetId}
                  className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{outlier.label}</p>
                      <p className="text-[11px] text-slate-600">
                        Elo {Math.round(outlier.elo)} • {outlier.pollsCount} polls • {formatPercent(outlier.winRate)} win
                        rate
                      </p>
                    </div>
                    <p className="text-sm font-extrabold text-slate-900">
                      z={outlier.zScore >= 0 ? "+" : ""}
                      {outlier.zScore.toFixed(2)}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                Need more scored assets to identify rating outliers.
              </p>
            )}
          </div>
        </article>

        <article className="glass-panel rounded-3xl p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600">Outliers</p>
              <h2 className="text-xl font-black text-slate-950 [font-family:var(--font-display)]">Recent Upsets</h2>
            </div>
            <p className="text-[11px] text-slate-600">current Elo baseline</p>
          </div>

          <div className="mt-3 space-y-2">
            {data.upsets.length ? (
              data.upsets.slice(0, 8).map((upset) => (
                <article key={upset.voteId} className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2">
                  <p className="text-sm font-bold text-slate-900">
                    {upset.winnerLabel} beat {upset.loserLabel}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span>
                      Elo swing signal +{upset.upsetDelta.toFixed(1)} ({Math.round(upset.winnerElo)} vs {Math.round(upset.loserElo)})
                    </span>
                    <span>{formatRelative(upset.createdAt)}</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                No upset outliers detected in the current lookback window.
              </p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
