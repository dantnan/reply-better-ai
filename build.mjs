import { build, context } from "esbuild";
import { rm, mkdir, copyFile, readdir, stat } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import { join, dirname, relative } from "node:path";
import { spawn } from "node:child_process";

const ROOT = dirname(new URL(import.meta.url).pathname);
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const BROWSERS = ["chrome", "firefox"];

const ARGS = new Set(process.argv.slice(2));
const WATCH = ARGS.has("--watch");
const PACKAGE = ARGS.has("--package");

const BUNDLES = [
  { entry: "background/service-worker.js", out: "service-worker.js", format: "iife" },
  { entry: "content/index.js", out: "content.js", format: "iife" },
  { entry: "popup/index.js", out: "popup.js", format: "iife" },
  { entry: "options/index.js", out: "options.js", format: "iife" },
];

const STATIC_FILES = [
  { from: "popup/popup.html", to: "popup.html" },
  { from: "popup/popup.css", to: "popup.css" },
  { from: "popup/model-picker.css", to: "model-picker.css" },
  { from: "shared/tokens.css", to: "tokens.css" },
  { from: "options/options.html", to: "options.html" },
  { from: "options/options.css", to: "options.css" },
];

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function buildBrowser(browser) {
  const outDir = join(DIST, browser);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const bundle of BUNDLES) {
    const entryPath = join(SRC, bundle.entry);
    if (!existsSync(entryPath)) {
      console.warn(`[${browser}] skip missing entry: ${bundle.entry}`);
      continue;
    }
    await build({
      entryPoints: [entryPath],
      outfile: join(outDir, bundle.out),
      bundle: true,
      format: bundle.format,
      target: ["chrome109", "firefox115"],
      minify: !WATCH,
      sourcemap: WATCH ? "inline" : false,
      define: {
        "process.env.NODE_ENV": WATCH ? '"development"' : '"production"',
        "__BROWSER__": JSON.stringify(browser),
      },
      loader: { ".svg": "text" },
      logLevel: "info",
    });
  }

  await copyFile(
    join(ROOT, `manifest.${browser}.json`),
    join(outDir, "manifest.json"),
  );

  for (const f of STATIC_FILES) {
    const src = join(SRC, f.from);
    if (!existsSync(src)) {
      console.warn(`[${browser}] missing static: ${f.from}`);
      continue;
    }
    await copyFile(src, join(outDir, f.to));
  }

  const iconsSrc = join(ROOT, "icons");
  if (existsSync(iconsSrc)) {
    await copyDir(iconsSrc, join(outDir, "icons"));
  }

  console.log(`[${browser}] built → ${relative(ROOT, outDir)}`);
}

async function packageBrowser(browser) {
  const outDir = join(DIST, browser);
  if (!existsSync(outDir)) {
    console.error(`[${browser}] dist not found, run build first`);
    return;
  }
  const zipPath = join(DIST, `reply-better-ai-${browser}.zip`);
  await new Promise((resolve, reject) => {
    const proc = spawn("zip", ["-r", zipPath, "."], { cwd: outDir, stdio: "inherit" });
    proc.on("close", code => code === 0 ? resolve() : reject(new Error(`zip exited ${code}`)));
    proc.on("error", reject);
  });
  console.log(`[${browser}] packaged → ${relative(ROOT, zipPath)}`);
}

async function main() {
  for (const browser of BROWSERS) {
    await buildBrowser(browser);
  }
  if (PACKAGE) {
    for (const browser of BROWSERS) {
      await packageBrowser(browser);
    }
  }
  if (WATCH) {
    console.log("watching src/ for changes...");
    const { watch } = await import("node:fs");
    let timeout;
    watch(SRC, { recursive: true }, () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        try {
          for (const browser of BROWSERS) await buildBrowser(browser);
        } catch (e) {
          console.error("rebuild failed:", e.message);
        }
      }, 100);
    });
    await new Promise(() => {});
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
