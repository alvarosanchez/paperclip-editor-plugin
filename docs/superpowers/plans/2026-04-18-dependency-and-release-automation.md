# Dependency And Release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Renovate automation plus a sibling-style GitHub Release publishing workflow for this Paperclip plugin.

**Architecture:** Keep runtime code changes minimal. Add a small release-version helper that can be exercised from tests, then build repository automation around it: pinned GitHub workflows for CI and release publishing, and a Renovate policy tuned for low-risk automerge on dev dependencies and GitHub Actions only.

**Tech Stack:** GitHub Actions, Renovate, Node.js, pnpm, TypeScript tests via `tsx --test`

---

### Task 1: Release version helper and regression tests

**Files:**
- Create: `scripts/release-version-lib.mjs`
- Create: `scripts/sync-release-version.mjs`
- Create: `tests/release-version.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing release helper tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveReleaseVersion, syncPackageVersion } from "../scripts/release-version-lib.mjs";

test("accepts semver tags and prerelease tags", () => {
  assert.equal(resolveReleaseVersion("v1.2.3"), "1.2.3");
  assert.equal(resolveReleaseVersion("1.2.3-beta.1"), "1.2.3-beta.1");
});

test("rejects invalid release tags", () => {
  assert.equal(resolveReleaseVersion("release-1.2.3"), null);
  assert.equal(resolveReleaseVersion(""), null);
});

test("updates package.json version in place", async () => {
  const dir = await mkdtemp(join(tmpdir(), "paperclip-editor-plugin-"));
  const packageJsonPath = join(dir, "package.json");
  await writeFile(packageJsonPath, JSON.stringify({ name: "test", version: "0.1.0" }, null, 2));

  const changed = await syncPackageVersion(packageJsonPath, "1.2.3");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  assert.equal(changed, true);
  assert.equal(packageJson.version, "1.2.3");
});
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `pnpm test -- tests/release-version.spec.ts`
Expected: FAIL because `../scripts/release-version-lib.mjs` does not exist yet.

- [ ] **Step 3: Implement the helper library and CLI wrapper**

```js
// scripts/release-version-lib.mjs
import { readFile, writeFile } from "node:fs/promises";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[.-][0-9A-Za-z.-]+)?$/;

export function resolveReleaseVersion(rawValue) {
  const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";
  const version = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  return SEMVER_PATTERN.test(version) ? version : null;
}

export async function syncPackageVersion(packageJsonPath, version) {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (packageJson.version === version) {
    return false;
  }

  packageJson.version = version;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  return true;
}
```

```js
// scripts/sync-release-version.mjs
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
console.log(changed ? `Updated package.json version to ${version}.` : `package.json already uses version ${version}.`);
```

```json
// package.json scripts
{
  "scripts": {
    "release:sync-version": "node ./scripts/sync-release-version.mjs",
    "test": "tsx --test tests/*.spec.ts"
  }
}
```

- [ ] **Step 4: Run the release helper tests to verify they pass**

Run: `pnpm test -- tests/release-version.spec.ts`
Expected: PASS for the three release helper tests.

- [ ] **Step 5: Run the full test suite after broadening the test glob**

Run: `pnpm test`
Expected: PASS for both `tests/plugin.spec.ts` and `tests/release-version.spec.ts`.

### Task 2: Release workflow and pinned CI actions

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update CI to use pinned GitHub Actions SHAs**

```yaml
name: CI

on:
  push:
    branches:
      - main
  pull_request:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      CI: true
    steps:
      - name: Check out repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6

      - name: Set up pnpm
        uses: pnpm/action-setup@08c4be7e2e672a47d11bd04269e27e5f3e8529cb # v6
        with:
          version: 10.33.0
          standalone: true
          run_install: false

      - name: Set up Node.js
        uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify package
        run: pnpm verify
```

- [ ] **Step 2: Add the GitHub Release publishing workflow**

```yaml
name: Release

on:
  release:
    types:
      - published

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      CI: true
    steps:
      - name: Check out repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - name: Set up pnpm
        uses: pnpm/action-setup@08c4be7e2e672a47d11bd04269e27e5f3e8529cb # v6
        with:
          version: 10.33.0
          standalone: true
          run_install: false
      - name: Set up Node.js
        uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6
        with:
          node-version: 20
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Sync package version from release tag
        env:
          RELEASE_TAG: ${{ github.event.release.tag_name }}
        run: pnpm release:sync-version "$RELEASE_TAG"
      - name: Verify package
        run: pnpm verify

  publish:
    needs: verify
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    timeout-minutes: 15
    env:
      CI: true
    steps:
      - name: Check out repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
        with:
          fetch-depth: 0
      - name: Set up pnpm
        uses: pnpm/action-setup@08c4be7e2e672a47d11bd04269e27e5f3e8529cb # v6
        with:
          version: 10.33.0
          standalone: true
          run_install: false
      - name: Set up Node.js
        uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6
        with:
          node-version: 24.15.0
          registry-url: https://registry.npmjs.org
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Sync package version from release tag
        env:
          RELEASE_TAG: ${{ github.event.release.tag_name }}
        run: pnpm release:sync-version "$RELEASE_TAG"
      - name: Publish to npm
        run: npm publish --access public --provenance
```

- [ ] **Step 3: Add the branch sync guard after publish**

```yaml
      - name: Sync checked-in package version to release branch
        env:
          RELEASE_TAG: ${{ github.event.release.tag_name }}
          RELEASE_TARGET_BRANCH: ${{ github.event.release.target_commitish }}
          DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}
        run: |
          set -euo pipefail

          RELEASE_VERSION="${RELEASE_TAG#v}"
          TARGET_BRANCH="${RELEASE_TARGET_BRANCH:-$DEFAULT_BRANCH}"

          if ! git ls-remote --exit-code --heads origin "$TARGET_BRANCH" >/dev/null 2>&1; then
            echo "Release target '$TARGET_BRANCH' is not a branch on origin; skipping package.json sync."
            exit 0
          fi

          git restore package.json
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git fetch origin "$TARGET_BRANCH"
          git switch --create "release-version-sync-$RELEASE_VERSION" "origin/$TARGET_BRANCH"
          pnpm release:sync-version "$RELEASE_VERSION"

          if git diff --quiet -- package.json; then
            echo "package.json already matches $RELEASE_VERSION on $TARGET_BRANCH."
            exit 0
          fi

          git add package.json
          git commit -m "chore: sync package version to $RELEASE_VERSION"
          git push origin HEAD:"$TARGET_BRANCH"
```

- [ ] **Step 4: Re-read both workflow files for trigger, permission, and version-sync correctness**

Run: `sed -n '1,220p' .github/workflows/ci.yml && sed -n '1,320p' .github/workflows/release.yml`
Expected: CI uses pinned SHAs; release workflow has `verify` then `publish`, and publish has `contents: write` plus `id-token: write`.

### Task 3: Renovate policy and maintenance docs

**Files:**
- Create: `renovate.json`
- Modify: `README.md`

- [ ] **Step 1: Add the Renovate configuration**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    ":configMigration"
  ],
  "timezone": "Europe/Madrid",
  "labels": ["dependencies"],
  "enabledManagers": ["npm", "github-actions"],
  "prConcurrentLimit": 5,
  "prHourlyLimit": 2,
  "packageRules": [
    {
      "matchUpdateTypes": ["major"],
      "dependencyDashboardApproval": true
    },
    {
      "matchManagers": ["github-actions"],
      "matchUpdateTypes": ["minor", "patch", "pin", "digest"],
      "groupName": "github actions (non-major)",
      "automerge": true
    },
    {
      "matchManagers": ["npm"],
      "matchDepTypes": ["dependencies"],
      "matchUpdateTypes": ["minor", "patch", "pin", "digest"],
      "groupName": "npm production dependencies"
    },
    {
      "matchManagers": ["npm"],
      "matchDepTypes": ["devDependencies"],
      "matchCurrentVersion": "!/^0/",
      "matchUpdateTypes": ["minor", "patch"],
      "groupName": "npm development dependencies",
      "automerge": true
    }
  ]
}
```

- [ ] **Step 2: Document the release path in the README packaging notes**

```md
## Packaging notes

- GitHub Releases with semver tags trigger npm publication through `.github/workflows/release.yml`.
- The release workflow stamps `package.json` from the release tag and syncs that version back to the release branch after a successful publish.
```

- [ ] **Step 3: Validate the Renovate config and release helper**

Run: `pnpm dlx renovate-config-validator`
Expected: PASS with no config validation errors.

Run: `pnpm release:sync-version v0.1.0`
Expected: `package.json already uses version 0.1.0.`

- [ ] **Step 4: Run the full repository verification before closeout**

Run: `pnpm verify`
Expected: PASS for typecheck, tests, build, and package dry-run.
