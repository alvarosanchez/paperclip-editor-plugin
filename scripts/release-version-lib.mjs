import { readFile, writeFile } from "node:fs/promises";

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function resolveReleaseVersion(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

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
