import { spawn } from "node:child_process";
import { definePlugin, runWorker, type PluginContext, type PluginWorkspace } from "@paperclipai/plugin-sdk";

export interface EditorChoice {
  id: string;
  label: string;
}

export interface EditorAvailability {
  available: boolean;
  reason?: string;
  editors: EditorChoice[];
  workspacePath?: string;
}

export interface LaunchCommand {
  command: string;
  args: string[];
}

const DEFAULT_EDITOR: EditorChoice = {
  id: "intellij-idea",
  label: "IntelliJ IDEA"
};

const PATH_LIKE_PATTERN = /[\\/]/;
const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;

function readString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

function looksLikePath(value: string): boolean {
  return PATH_LIKE_PATTERN.test(value) || WINDOWS_DRIVE_PATH_PATTERN.test(value);
}

function sanitizeWorkspacePath(pathValue: unknown): string {
  if (typeof pathValue !== "string") {
    return "";
  }

  const trimmed = pathValue.trim();
  return trimmed.length > 0 && looksLikePath(trimmed) ? trimmed : "";
}

function readCurrentExecutionWorkspacePath(issue: Record<string, unknown> | null): string {
  const currentExecutionWorkspace =
    issue && typeof issue.currentExecutionWorkspace === "object" && issue.currentExecutionWorkspace
      ? issue.currentExecutionWorkspace as Record<string, unknown>
      : null;

  return sanitizeWorkspacePath(currentExecutionWorkspace?.cwd);
}

function isLocalHostOrigin(origin: string): boolean {
  if (!origin) {
    return false;
  }

  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function createUnavailableAvailability(reason: string): EditorAvailability {
  return {
    available: false,
    reason,
    editors: []
  };
}

function chooseWorkspace(workspaces: PluginWorkspace[]): PluginWorkspace | null {
  return workspaces.find((workspace) => workspace.isPrimary) ?? workspaces[0] ?? null;
}

async function resolveIssueWorkspace(
  ctx: PluginContext,
  companyId: string,
  issueId: string
): Promise<{ workspace: PluginWorkspace; workspacePath: string }> {
  const issue = await ctx.issues.get(issueId, companyId);
  const currentExecutionWorkspacePath = readCurrentExecutionWorkspacePath(issue as Record<string, unknown> | null);
  if (currentExecutionWorkspacePath) {
    return {
      workspace: {
        id: `${issueId}:execution-workspace`,
        projectId: typeof issue?.projectId === "string" ? issue.projectId : "",
        name: "Issue execution workspace",
        path: currentExecutionWorkspacePath,
        isPrimary: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      workspacePath: currentExecutionWorkspacePath
    };
  }

  const projectId = typeof issue?.projectId === "string" ? issue.projectId : "";
  if (!projectId) {
    throw new Error("This issue is not linked to a project workspace.");
  }

  const preferredWorkspace = await ctx.projects.getWorkspaceForIssue(issueId, companyId);
  const preferredWorkspacePath = sanitizeWorkspacePath(preferredWorkspace?.path);
  if (preferredWorkspace && preferredWorkspacePath) {
    return {
      workspace: preferredWorkspace,
      workspacePath: preferredWorkspacePath
    };
  }

  const workspaces = await ctx.projects.listWorkspaces(projectId, companyId);
  const workspace = chooseWorkspace(workspaces);
  if (!workspace) {
    throw new Error("No workspace is configured for this issue's project.");
  }

  const workspacePath = sanitizeWorkspacePath(workspace.path);
  if (!workspacePath) {
    throw new Error("The selected workspace does not expose a local path.");
  }

  return { workspace, workspacePath };
}

export function buildEditorLaunchCommand(
  editorId: string,
  workspacePath: string,
  platform: NodeJS.Platform = process.platform
): LaunchCommand | null {
  if (editorId !== DEFAULT_EDITOR.id) {
    return null;
  }

  if (platform === "darwin") {
    return {
      command: "open",
      args: ["-a", "IntelliJ IDEA", workspacePath]
    };
  }

  return null;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("editor.availability", async (input) => {
      const params = input as Record<string, unknown>;
      const companyId = readString(params, "companyId");
      const issueId = readString(params, "issueId");
      const hostOrigin = readString(params, "hostOrigin");

      if (!companyId || !issueId) {
        return createUnavailableAvailability("Missing issue context.");
      }

      if (!isLocalHostOrigin(hostOrigin)) {
        return createUnavailableAvailability("This launcher is available only when Paperclip is served from localhost.");
      }

      try {
        const { workspacePath } = await resolveIssueWorkspace(ctx, companyId, issueId);
        const launchCommand = buildEditorLaunchCommand(DEFAULT_EDITOR.id, workspacePath);

        if (!launchCommand) {
          return createUnavailableAvailability("IntelliJ IDEA launching is not supported on this platform.");
        }

        return {
          available: true,
          editors: [DEFAULT_EDITOR],
          workspacePath
        } satisfies EditorAvailability;
      } catch (error) {
        return createUnavailableAvailability(
          error instanceof Error ? error.message : "No local workspace is available for this issue."
        );
      }
    });

    ctx.actions.register("editor.launch", async (input) => {
      const params = input as Record<string, unknown>;
      const companyId = readString(params, "companyId");
      const issueId = readString(params, "issueId");
      const hostOrigin = readString(params, "hostOrigin");
      const editorId = readString(params, "editorId") || DEFAULT_EDITOR.id;

      if (!companyId || !issueId) {
        throw new Error("Missing issue context.");
      }

      if (!isLocalHostOrigin(hostOrigin)) {
        throw new Error("This launcher is available only when Paperclip is served from localhost.");
      }

      const { workspacePath } = await resolveIssueWorkspace(ctx, companyId, issueId);
      const launchCommand = buildEditorLaunchCommand(editorId, workspacePath);

      if (!launchCommand) {
        throw new Error("This editor is not supported on the current platform.");
      }

      const child = spawn(launchCommand.command, launchCommand.args, {
        cwd: workspacePath,
        detached: true,
        stdio: "ignore"
      });
      child.unref();

      ctx.logger.info("Launched editor for issue workspace", {
        companyId,
        issueId,
        editorId,
        workspacePath
      });

      return {
        ok: true,
        editorId,
        workspacePath
      };
    });
  },

  async onHealth() {
    return {
      status: "ok",
      message: "paperclip-editor-plugin ready"
    };
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
