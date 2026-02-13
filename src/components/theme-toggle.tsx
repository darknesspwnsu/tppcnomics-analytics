"use client";

import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "tppcnomics-theme";

type ThemeMode = "dark" | "light";

function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function readInitialTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    return readInitialTheme();
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore localStorage failures and keep runtime theme.
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`fixed bottom-24 right-4 z-40 h-11 w-[4.75rem] rounded-full border border-slate-300/90 bg-white/90 p-1 shadow-lg shadow-slate-900/20 backdrop-blur transition hover:brightness-105 dark:border-slate-600/90 dark:bg-slate-900/85 dark:shadow-black/35 sm:bottom-5 sm:right-5 ${className}`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span className="sr-only">Toggle theme</span>

      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-amber-500">
        <SunIcon />
      </span>
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-500 dark:text-slate-300">
        <MoonIcon />
      </span>

      <span
        className={`pointer-events-none absolute left-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shadow-md transition-transform duration-200 dark:bg-slate-100 dark:text-slate-900 ${theme === "dark" ? "translate-x-[2.1rem]" : "translate-x-0"}`}
      >
        {theme === "dark" ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.7 4.7l1.6 1.6M17.7 17.7l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.7 19.3l1.6-1.6M17.7 6.3l1.6-1.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8" aria-hidden="true">
      <path d="M20.6 14.6a8.8 8.8 0 1 1-11.2-11.2A7.7 7.7 0 0 0 20.6 14.6Z" />
    </svg>
  );
}
