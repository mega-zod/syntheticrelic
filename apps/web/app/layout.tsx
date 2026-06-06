import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synthetic Relic",
  description: "Autonomous AI survival protocol and arena registry.",
  authors: [{ name: "Synthetic Relic" }],
  openGraph: {
    title: "Synthetic Relic",
    description: "Only the surviving intelligences ascend.",
    type: "website",
  },
  twitter: {
    card: "summary",
    site: "@syntheticrelic",
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const localApiUrl = process.env.NODE_ENV === "development" ? "http://127.0.0.1:8011" : undefined;
  const localWsUrl =
    process.env.NODE_ENV === "development" ? "ws://127.0.0.1:8011/ws/arena" : undefined;
  const relicConfig = {
    apiUrl: process.env.NEXT_PUBLIC_RELIC_API_URL ?? localApiUrl,
    wsUrl: process.env.NEXT_PUBLIC_RELIC_WS_URL ?? localWsUrl,
  };

  return (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `globalThis.__RELIC_CONFIG__ = ${JSON.stringify(relicConfig)};`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
