import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./components/nav";

export const metadata: Metadata = {
  title: "videogen — The Cutting Room",
  description:
    "AI creative studio — turn an idea into an approved, editable production plan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700&f[]=general-sans@400,500,600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
