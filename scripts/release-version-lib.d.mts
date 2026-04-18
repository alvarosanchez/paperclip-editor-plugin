export function resolveReleaseVersion(rawValue: unknown): string | null;

export function syncPackageVersion(packageJsonPath: string, version: string): Promise<boolean>;
