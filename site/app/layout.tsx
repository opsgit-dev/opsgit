import type { Metadata } from "next";
import { Figtree, Inter } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-body", display: "swap" });

const siteUrl = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || "https://opsgit.netlify.app";
const description = "Turn features on with a pull request. opsgit keeps feature flags as JSON files in your repo and ships them to a Cloudflare Worker you own.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "opsgit",
  description,
  openGraph: {
    title: "opsgit",
    description: "Turn features on with a pull request. Feature flags as files in your repo, served from your own Cloudflare account.",
    images: [{ url: "/social.png", width: 1280, height: 640 }],
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
