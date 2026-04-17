export interface ExperimentalSettingsResponse {
  enableIsolatedWorkspaces?: boolean;
}

export interface EnsureIsolatedWorkspacesEnabledOptions {
  baseUrl: string;
  fetchJson: (url: string, init?: RequestInit) => Promise<ExperimentalSettingsResponse>;
  log?: (message: string) => void;
}

export function ensureIsolatedWorkspacesEnabled(
  options: EnsureIsolatedWorkspacesEnabledOptions
): Promise<ExperimentalSettingsResponse>;
