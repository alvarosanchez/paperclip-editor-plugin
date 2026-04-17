#!/usr/bin/env node
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const outdir = resolve(packageRoot, "dist");
const watch = process.argv.includes("--watch");
const packageJson = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const pluginVersion =
  process.env.PLUGIN_VERSION?.trim()
  || (typeof packageJson.version === "string" && packageJson.version.trim())
  || "0.0.0-dev";

const esbuild = await import("esbuild");

await rm(outdir, { recursive: true, force: true });
await mkdir(resolve(outdir, "ui"), { recursive: true });

const nodeSharedOptions = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  packages: "external",
  sourcemap: false,
  logLevel: "info"
};

const manifestBuildOptions = {
  ...nodeSharedOptions,
  entryPoints: [resolve(packageRoot, "src/manifest.ts")],
  outfile: resolve(outdir, "manifest.js"),
  define: {
    "process.env.PLUGIN_VERSION": JSON.stringify(pluginVersion)
  }
};

const workerBuildOptions = {
  ...nodeSharedOptions,
  entryPoints: [resolve(packageRoot, "src/worker.ts")],
  outfile: resolve(outdir, "worker.js")
};

const uiBuildOptions = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  external: ["react", "react-dom", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"],
  sourcemap: true,
  logLevel: "info",
  entryPoints: [resolve(packageRoot, "src/ui/index.tsx")],
  outfile: resolve(outdir, "ui/index.js"),
  jsx: "automatic"
};

if (watch) {
  const contexts = await Promise.all([
    esbuild.context(manifestBuildOptions),
    esbuild.context(workerBuildOptions),
    esbuild.context(uiBuildOptions)
  ]);

  const shutdown = async () => {
    await Promise.allSettled(contexts.map(async (context) => context.dispose()));
  };

  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });

  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  await Promise.all(contexts.map(async (context) => context.watch()));
  console.log("[paperclip-editor-plugin] watch mode enabled");
} else {
  await Promise.all([
    esbuild.build(manifestBuildOptions),
    esbuild.build(workerBuildOptions),
    esbuild.build(uiBuildOptions)
  ]);

  console.log("[paperclip-editor-plugin] build complete");
}
