import fs from "fs";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
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
  ],
});
