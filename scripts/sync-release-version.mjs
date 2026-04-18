#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveReleaseVersion, syncPackageVersion } from "./release-version-lib.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(scriptDir, "..", "package.json");
const input = process.argv[2] ?? process.env.RELEASE_TAG ?? process.env.PLUGIN_VERSION ?? "";
const version = resolveReleaseVersion(input);

if (!version) {
  console.error(`Expected a semver release tag or version, received ${JSON.stringify(input)}.`);
  process.exit(1);
}

const changed = await syncPackageVersion(packageJsonPath, version);

if (changed) {
  console.log(`Updated package.json version to ${version}.`);
} else {
  console.log(`package.json already uses version ${version}.`);
}
