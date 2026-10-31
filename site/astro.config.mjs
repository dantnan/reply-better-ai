import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Fully static site: served as Workers static assets (see wrangler.jsonc).
export default defineConfig({
  site: "https://replybetterai.com",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [sitemap()],
  // global.css imports the extension's design tokens from ../src/shared
  vite: { server: { fs: { allow: [".."] } } },
});
