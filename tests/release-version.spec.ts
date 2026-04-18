import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveReleaseVersion, syncPackageVersion } from "../scripts/release-version-lib.mjs";

test("accepts semver release tags and prerelease versions", () => {
  assert.equal(resolveReleaseVersion("v1.2.3"), "1.2.3");
  assert.equal(resolveReleaseVersion("1.2.3-beta.1"), "1.2.3-beta.1");
  assert.equal(resolveReleaseVersion("  v2.0.0-rc.4  "), "2.0.0-rc.4");
  assert.equal(resolveReleaseVersion("1.2.3+build.5"), "1.2.3+build.5");
  assert.equal(resolveReleaseVersion("v1.2.3-rc.1+build.5"), "1.2.3-rc.1+build.5");
});

test("rejects invalid release tags", () => {
  assert.equal(resolveReleaseVersion("release-1.2.3"), null);
  assert.equal(resolveReleaseVersion("1.2"), null);
  assert.equal(resolveReleaseVersion(""), null);
  assert.equal(resolveReleaseVersion("1.2.3.alpha"), null);
  assert.equal(resolveReleaseVersion("1.2.3..beta"), null);
  assert.equal(resolveReleaseVersion("1.2.3.-rc.1"), null);
  assert.equal(resolveReleaseVersion("01.2.3"), null);
});

test("updates package.json version in place", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "paperclip-editor-plugin-"));
  const packageJsonPath = join(tempDir, "package.json");

  await writeFile(
    packageJsonPath,
    `${JSON.stringify({ name: "paperclip-editor-plugin", version: "0.1.0" }, null, 2)}\n`,
    "utf8"
  );

  const changed = await syncPackageVersion(packageJsonPath, "1.2.3");
  const updatedPackageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  assert.equal(changed, true);
  assert.equal(updatedPackageJson.version, "1.2.3");
});

test("does not rewrite package.json when the version already matches", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "paperclip-editor-plugin-"));
  const packageJsonPath = join(tempDir, "package.json");

  await writeFile(
    packageJsonPath,
    `${JSON.stringify({ name: "paperclip-editor-plugin", version: "1.2.3" }, null, 2)}\n`,
    "utf8"
  );

  const originalContents = await readFile(packageJsonPath, "utf8");
  const changed = await syncPackageVersion(packageJsonPath, "1.2.3");
  const finalContents = await readFile(packageJsonPath, "utf8");

  assert.equal(changed, false);
  assert.equal(finalContents, originalContents);
});
