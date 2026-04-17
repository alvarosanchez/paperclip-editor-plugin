export async function ensureIsolatedWorkspacesEnabled({
  baseUrl,
  fetchJson,
  log = () => {}
}) {
  const experimentalSettingsUrl = new URL("/api/instance/settings/experimental", baseUrl).toString();
  const currentSettings = await fetchJson(experimentalSettingsUrl);

  if (currentSettings?.enableIsolatedWorkspaces === true) {
    log("Paperclip isolated workspaces are already enabled for manual verification.");
    return currentSettings;
  }

  const updatedSettings = await fetchJson(experimentalSettingsUrl, {
    method: "PATCH",
    body: JSON.stringify({
      enableIsolatedWorkspaces: true
    })
  });

  log("Enabled Paperclip isolated workspaces for manual verification.");
  return updatedSettings;
}
