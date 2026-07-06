import fs from "fs";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
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
        theme_color: "#ffffff",
        background_color: "#ffffff",
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
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        additionalManifestEntries: [{ url: "/index.html", revision: null }],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        clientsClaim: true,
      },
    }),
  ],
});
