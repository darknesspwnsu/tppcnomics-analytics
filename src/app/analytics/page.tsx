import Link from "next/link";

import { getAnalyticsSnapshot } from "@/lib/analytics";

import { AnalyticsDashboard } from "./analytics-dashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const snapshot = await getAnalyticsSnapshot();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_500px_at_-5%_-10%,rgba(20,184,166,0.35),transparent_62%),radial-gradient(900px_400px_at_108%_0%,rgba(245,158,11,0.28),transparent_60%),radial-gradient(800px_520px_at_52%_110%,rgba(59,130,246,0.16),transparent_70%)] dark:bg-[radial-gradient(1000px_500px_at_-5%_-10%,rgba(13,148,136,0.3),transparent_62%),radial-gradient(900px_400px_at_108%_0%,rgba(217,119,6,0.25),transparent_60%),radial-gradient(800px_520px_at_52%_110%,rgba(2,132,199,0.2),transparent_70%)]" />
      <div className="arena-noise pointer-events-none absolute inset-0 opacity-[0.16]" />

      <main className="relative mx-auto min-h-screen w-full max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pt-7 lg:px-10">
        <header className="animate-rise-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-teal-700 dark:text-teal-300">
                TPPCNomics Intelligence
              </p>
              <h1 className="mt-1 text-balance text-2xl font-black tracking-tight text-slate-950 [font-family:var(--font-display)] dark:text-slate-100 sm:text-3xl">
                Arena Analytics
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-700 dark:text-slate-300">
                Live market telemetry: trend graphs, activity heatmap, rating outliers, and mover forecasts.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="glass-panel rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                Live
              </span>
              <Link
                href="/"
                className="glass-panel rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-800 transition hover:bg-white/90 dark:text-slate-200 dark:hover:bg-slate-800/80"
              >
                Back to Arena
              </Link>
            </div>
          </div>
        </header>

        <AnalyticsDashboard data={snapshot} />

        <footer className="mt-4 text-[11px] text-slate-600 dark:text-slate-400">
          Snapshot generated at {new Date(snapshot.generatedAt).toLocaleString()}
        </footer>
      </main>
    </div>
  );
}
