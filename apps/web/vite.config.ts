import fs from "fs";
import { execSync } from "child_process";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

function getGitCommit(): string {
  if (process.env.VITE_GIT_COMMIT) return process.env.VITE_GIT_COMMIT;
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_GIT_COMMIT": JSON.stringify(getGitCommit()),
    "import.meta.env.VITE_BUILD_TIME": JSON.stringify(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC"),
  },
  server: {
    https:
      process.env.HTTPS_CERT && process.env.HTTPS_KEY
        ? {
            key: fs.readFileSync(process.env.HTTPS_KEY, "utf-8"),
            cert: fs.readFileSync(process.env.HTTPS_CERT, "utf-8"),
          }
        : undefined,
  },
  plugins: [
    tailwindcss(),
    nodePolyfills({
      include: ["buffer"],
    }),
    sveltekit(),
    SvelteKitPWA({
      registerType: "prompt",
      manifest: {
        name: "btsv",
        short_name: "btsv",
        description: "Local-first markdown+ editor with git sync",
        theme_color: "#f7f7f7",
        background_color: "#f7f7f7",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icons/192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      kit: {
        spa: true,
        adapterFallback: "index.html",
      },
      workbox: {
        globPatterns: [
          "client/**/*.{js,css,ico,png,svg,woff2,webmanifest}",
          "prerendered/**/*.{html,json}",
        ],
        navigateFallbackDenylist: [/^\/api\//],
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
