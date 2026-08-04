import type { Config } from "tailwindcss";

// The approved "Cutting Room" token sheet (ui-design.md, ADR-010) as the
// Tailwind theme. No ad-hoc values in components — these tokens are the only
// colors/fonts/radii. Fonts load via the Fontshare/Google CDN links in
// layout.tsx; Tailwind just references the CSS vars.
export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#141110",
        surface: "#1E1A18",
        paper: "#EDE6DA",
        paperDim: "#D9D0C0",
        ash: "#8C8378",
        line: "#2B2622",
        rec: "#E04B3A",
        tungsten: "#E2A85C",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: { slate: "2px" },
    },
  },
  plugins: [],
} satisfies Config;
