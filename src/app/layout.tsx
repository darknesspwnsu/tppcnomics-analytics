import type { Metadata } from "next";
import { Geist_Mono, Oxanium, Space_Grotesk } from "next/font/google";
import "./globals.css";

const THEME_INIT_SCRIPT = `
(() => {
  const key = "tppcnomics-theme";
  let theme = "dark";
  try {
    const stored = localStorage.getItem(key);
    if (stored === "light") theme = "light";
  } catch {}
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.style.colorScheme = theme;
})();
`;

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const oxanium = Oxanium({
  variable: "--font-oxanium",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TPPCNomics Analytics",
  description: "Vote-driven TPPC market analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${oxanium.variable} ${geistMono.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
