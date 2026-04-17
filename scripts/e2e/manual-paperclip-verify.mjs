#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureIsolatedWorkspacesEnabled } from "./manual-paperclip-verify-lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, "..", "..");
const persistentStateRootInput = process.env.PAPERCLIP_E2E_STATE_DIR?.trim();
const persistentStateRoot = persistentStateRootInput ? resolve(pluginRoot, persistentStateRootInput) : null;
const stateRoot = persistentStateRoot ?? await mkdtemp(join(tmpdir(), "paperclip-editor-plugin-manual-"));
const paperclipHome = join(stateRoot, "paperclip-home");
const dataDir = join(stateRoot, "paperclip-data");
const workspaceDir = join(stateRoot, "workspace");
const isolatedWorkspacesDir = join(stateRoot, "isolated-workspaces");
const instanceId = "paperclip-editor-plugin-manual";
const pluginKey = "paperclip-editor-plugin";
const pluginDisplayName = "Editor Launcher";
const seededProjectName = "Editor Plugin Manual Project";
const seededIssueTitle = "Verify Open in toolbar button";
const seededAgentName = "Editor Plugin Manual Agent";
const seededAgentTitle = "Manual Plugin Verifier";
const seededAgentAdapterType = "codex_local";
const seededAgentAdapterConfig = {
  model: "gpt-5.4",
  dangerouslyBypassApprovalsAndSandbox: true,
  timeoutSec: 30
};
const seededAgentRuntimeConfig = {
  heartbeat: {
    enabled: true
  }
};
const requestedPort = process.env.PAPERCLIP_E2E_PORT ? Number(process.env.PAPERCLIP_E2E_PORT) : 3100;
const requestedDbPort = process.env.PAPERCLIP_E2E_DB_PORT ? Number(process.env.PAPERCLIP_E2E_DB_PORT) : 54329;
const wakeupSettleTimeoutMs = process.env.PAPERCLIP_E2E_WAKEUP_SETTLE_TIMEOUT_MS
  ? Number(process.env.PAPERCLIP_E2E_WAKEUP_SETTLE_TIMEOUT_MS)
  : 15000;
const executionWorkspaceTimeoutMs = process.env.PAPERCLIP_E2E_EXECUTION_WORKSPACE_TIMEOUT_MS
  ? Number(process.env.PAPERCLIP_E2E_EXECUTION_WORKSPACE_TIMEOUT_MS)
  : 180000;
const env = {
  ...process.env,
  CI: "true",
  BROWSER: "none",
  DO_NOT_TRACK: "1",
  PAPERCLIP_OPEN_ON_LISTEN: "false",
  PAPERCLIP_TELEMETRY_DISABLED: "1",
  PAPERCLIP_HOME: paperclipHome,
  PAPERCLIP_INSTANCE_ID: instanceId,
  FORCE_COLOR: "0"
};

let serverProcess;
let cleanedUp = false;
let shutdownRequested = false;
let shutdownResolver;
const shutdownPromise = new Promise((resolvePromise) => {
  shutdownResolver = resolvePromise;
});
let baseUrl;
let serverPort;
let embeddedDbPort;

function log(message) {
  console.log(`[paperclip-editor-plugin:manual] ${message}`);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function getPaperclipCommandArgs(args) {
  return ["-p", "node@20", "-p", "paperclipai", "paperclipai", ...args];
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: pluginRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function tryListen(port) {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = net.createServer();
    server.unref();
    server.on("error", rejectPromise);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => rejectPromise(new Error("Could not resolve a free TCP port.")));
        return;
      }

      const selectedPort = address.port;
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolvePromise(selectedPort);
      });
    });
  });
}

async function findAvailablePort(startPort) {
  try {
    return await tryListen(startPort);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("EADDRINUSE")) {
      throw error;
    }

    return tryListen(0);
  }
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    },
    ...init
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} ${text}`);
  }

  return body;
}

function sleep(timeoutMs) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, timeoutMs));
}

function isWithinPath(parentPath, candidatePath) {
  if (!parentPath || !candidatePath) {
    return false;
  }

  const normalizedParent = resolve(parentPath);
  const normalizedCandidate = resolve(candidatePath);
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function getRealizedExecutionWorkspace(issue) {
  const workspace = issue?.currentExecutionWorkspace;
  if (!workspace || workspace.status === "archived") {
    return null;
  }

  const providerType = typeof workspace.providerType === "string" ? workspace.providerType : null;
  const strategyType = typeof workspace.strategyType === "string" ? workspace.strategyType : null;
  if (providerType !== "git_worktree" && strategyType !== "git_worktree") {
    return null;
  }

  const cwd = typeof workspace.cwd === "string" ? workspace.cwd : null;
  const providerRef = typeof workspace.providerRef === "string" ? workspace.providerRef : null;
  if (!isWithinPath(isolatedWorkspacesDir, cwd) && !isWithinPath(isolatedWorkspacesDir, providerRef)) {
    return null;
  }

  return workspace;
}

async function getIssueDetails(issueRef) {
  return fetchJson(new URL(`/api/issues/${issueRef}`, baseUrl).toString());
}

async function getIssueHeartbeatContext(issueRef) {
  return fetchJson(new URL(`/api/issues/${issueRef}/heartbeat-context`, baseUrl).toString());
}

async function waitForExecutionWorkspace(issueId, timeoutMs, { throwOnTimeout = true } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastIssue = null;

  while (Date.now() < deadline) {
    lastIssue = await getIssueDetails(issueId);
    const workspace = getRealizedExecutionWorkspace(lastIssue);
    if (workspace) {
      return { issue: lastIssue, workspace };
    }

    await sleep(2000);
  }

  if (!throwOnTimeout) {
    return null;
  }

  const lastWorkspaceId = lastIssue?.executionWorkspaceId ?? "none";
  const lastWorkspaceCwd = lastIssue?.currentExecutionWorkspace?.cwd ?? "none";
  throw new Error(
    `Timed out waiting for a realized isolated execution workspace for issue ${issueId}. ` +
      `Last executionWorkspaceId=${lastWorkspaceId}, currentExecutionWorkspace.cwd=${lastWorkspaceCwd}`
  );
}

async function ensureStateRoot() {
  if (!persistentStateRoot) {
    return;
  }

  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
}

async function ensureConfigFile(configPath) {
  await mkdir(dirname(configPath), { recursive: true });
  await mkdir(join(dataDir, "logs"), { recursive: true });
  await mkdir(join(dataDir, "storage"), { recursive: true });
  await mkdir(join(dataDir, "backups"), { recursive: true });
  await mkdir(join(dataDir, "secrets"), { recursive: true });

  const config = {
    $meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: "doctor"
    },
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: join(dataDir, "db"),
      embeddedPostgresPort: embeddedDbPort,
      backup: {
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 30,
        dir: join(dataDir, "backups")
      }
    },
    logging: {
      mode: "file",
      logDir: join(dataDir, "logs")
    },
    server: {
      deploymentMode: "local_trusted",
      exposure: "private",
      host: "127.0.0.1",
      port: serverPort,
      serveUi: true,
      allowedHostnames: []
    },
    telemetry: {
      enabled: false
    },
    auth: {
      baseUrlMode: "auto",
      disableSignUp: false
    },
    storage: {
      provider: "local_disk",
      localDisk: {
        baseDir: join(dataDir, "storage")
      },
      s3: {
        bucket: "paperclip-e2e-placeholder",
        region: "us-east-1",
        prefix: "paperclip-e2e",
        forcePathStyle: false
      }
    },
    secrets: {
      provider: "local_encrypted",
      strictMode: false,
      localEncrypted: {
        keyFilePath: join(dataDir, "secrets", "master.key")
      }
    }
  };

  await writeFile(configPath, JSON.stringify(config, null, 2));
}

async function waitForReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = new URL("/api/health", url).toString();

  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null && serverProcess?.exitCode !== undefined) {
      throw new Error(`Paperclip exited early with code ${serverProcess.exitCode}.`);
    }

    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }

  throw new Error(`Timed out waiting for Paperclip at ${healthUrl}`);
}

async function ensureCompanySeeded() {
  const companiesUrl = new URL("/api/companies", baseUrl).toString();
  const existingCompanies = await fetchJson(companiesUrl);
  if (Array.isArray(existingCompanies) && existingCompanies.length > 0) {
    log(`Found ${existingCompanies.length} existing companies; onboarding should be skipped.`);
    return existingCompanies[0];
  }

  const createdCompany = await fetchJson(companiesUrl, {
    method: "POST",
    body: JSON.stringify({
      name: "Dummy Company",
      description: "Seed company for manual paperclip-editor-plugin verification."
    })
  });

  log(`Seeded company ${createdCompany?.name ?? "Dummy Company"}.`);
  return createdCompany;
}

async function ensureWorkspaceFixture() {
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(isolatedWorkspacesDir, { recursive: true });
  await writeFile(join(workspaceDir, "README.md"), "# Manual Editor Plugin Workspace\n");

  if (!await pathExists(join(workspaceDir, ".git"))) {
    await runCommand("git", ["init"], { cwd: workspaceDir });
    await runCommand("git", ["config", "user.name", "Paperclip Editor Plugin"], { cwd: workspaceDir });
    await runCommand("git", ["config", "user.email", "paperclip-editor-plugin@example.test"], { cwd: workspaceDir });
    await runCommand("git", ["add", "README.md"], { cwd: workspaceDir });
    await runCommand("git", ["commit", "-m", "Initial workspace fixture"], { cwd: workspaceDir });
    await runCommand("git", ["branch", "-M", "main"], { cwd: workspaceDir });
  }

  return workspaceDir;
}

async function ensureProjectWithLocalWorkspace(companyId, cwd) {
  const projectsUrl = new URL(`/api/companies/${companyId}/projects`, baseUrl).toString();
  const projects = await fetchJson(projectsUrl);
  const existingProject = Array.isArray(projects)
    ? projects.find((entry) => entry?.name === seededProjectName)
    : null;

  const project = existingProject ?? await fetchJson(projectsUrl, {
    method: "POST",
    body: JSON.stringify({
      name: seededProjectName,
      description: "Manual verification project for paperclip-editor-plugin.",
      status: "planned",
      executionWorkspacePolicy: {
        enabled: true,
        defaultMode: "isolated_workspace",
        allowIssueOverride: true,
        workspaceStrategy: {
          type: "git_worktree",
          worktreeParentDir: isolatedWorkspacesDir
        }
      }
    })
  });

  const projectId = typeof project?.id === "string" ? project.id : "";
  if (!projectId) {
    throw new Error("Project creation succeeded but did not return a project id.");
  }

  const workspacesUrl = new URL(`/api/projects/${projectId}/workspaces`, baseUrl).toString();
  const workspaces = await fetchJson(workspacesUrl);
  const existingWorkspace = Array.isArray(workspaces)
    ? workspaces.find((entry) => entry?.cwd === cwd || entry?.path === cwd)
    : null;

  const workspace = existingWorkspace ?? await fetchJson(workspacesUrl, {
    method: "POST",
    body: JSON.stringify({
      name: "local-workspace",
      cwd,
      isPrimary: true
    })
  });

  await fetchJson(new URL(`/api/projects/${projectId}`, baseUrl).toString(), {
    method: "PATCH",
    body: JSON.stringify({
      executionWorkspacePolicy: {
        enabled: true,
        defaultMode: "isolated_workspace",
        allowIssueOverride: true,
        defaultProjectWorkspaceId: workspace?.id ?? null,
        workspaceStrategy: {
          type: "git_worktree",
          worktreeParentDir: isolatedWorkspacesDir
        }
      }
    })
  });

  log(`Seeded project ${seededProjectName} mapped to local workspace ${cwd} with isolated issue checkouts enabled.`);
  return project;
}

async function ensureIssueSeeded(companyId, projectId) {
  const issuesUrl = new URL(`/api/companies/${companyId}/issues`, baseUrl).toString();
  const issues = await fetchJson(`${issuesUrl}?projectId=${encodeURIComponent(projectId)}`);
  const existingIssue = Array.isArray(issues)
    ? issues.find((entry) => entry?.title === seededIssueTitle)
    : null;

  if (existingIssue?.id) {
    log(`Reusing issue ${existingIssue.identifier ?? existingIssue.id}.`);
    return existingIssue;
  }

  const createdIssue = await fetchJson(issuesUrl, {
    method: "POST",
    body: JSON.stringify({
      title: seededIssueTitle,
      description: "Use this issue to manually verify the Open in toolbar dropdown on a project with isolated issue workspaces enabled.",
      status: "todo",
      priority: "medium",
      projectId,
      executionWorkspacePreference: "isolated_workspace",
      executionWorkspaceSettings: {
        mode: "isolated_workspace",
        workspaceStrategy: {
          type: "git_worktree",
          worktreeParentDir: isolatedWorkspacesDir
        }
      }
    })
  });

  log(`Created issue ${createdIssue?.identifier ?? createdIssue?.id ?? seededIssueTitle}.`);
  return createdIssue;
}

async function ensureCodexLocalAgent(companyId) {
  const agentsUrl = new URL(`/api/companies/${companyId}/agents`, baseUrl).toString();
  const agents = await fetchJson(agentsUrl);
  const existingAgent = Array.isArray(agents)
    ? agents.find((entry) => entry?.name === seededAgentName && entry?.status !== "terminated")
    : null;

  if (!existingAgent?.id) {
    const createdAgent = await fetchJson(agentsUrl, {
      method: "POST",
      body: JSON.stringify({
        name: seededAgentName,
        role: "general",
        title: seededAgentTitle,
        adapterType: seededAgentAdapterType,
        adapterConfig: seededAgentAdapterConfig,
        runtimeConfig: seededAgentRuntimeConfig
      })
    });

    log(
      `Created ${seededAgentAdapterType} agent ${createdAgent?.name ?? seededAgentName} ` +
        `with model ${seededAgentAdapterConfig.model}.`
    );
    return createdAgent;
  }

  const needsUpdate =
    existingAgent.adapterType !== seededAgentAdapterType ||
    existingAgent.role !== "general" ||
    existingAgent.title !== seededAgentTitle ||
    existingAgent.adapterConfig?.model !== seededAgentAdapterConfig.model ||
    existingAgent.adapterConfig?.dangerouslyBypassApprovalsAndSandbox !==
      seededAgentAdapterConfig.dangerouslyBypassApprovalsAndSandbox ||
    existingAgent.adapterConfig?.timeoutSec !== seededAgentAdapterConfig.timeoutSec ||
    existingAgent.runtimeConfig?.heartbeat?.enabled !== true;

  const agent = needsUpdate
    ? await fetchJson(new URL(`/api/agents/${existingAgent.id}`, baseUrl).toString(), {
      method: "PATCH",
      body: JSON.stringify({
        name: seededAgentName,
        role: "general",
        title: seededAgentTitle,
        adapterType: seededAgentAdapterType,
        adapterConfig: seededAgentAdapterConfig,
        runtimeConfig: seededAgentRuntimeConfig,
        replaceAdapterConfig: true
      })
    })
    : existingAgent;

  if (agent?.status === "paused") {
    await fetchJson(new URL(`/api/agents/${agent.id}/resume`, baseUrl).toString(), {
      method: "POST",
      body: JSON.stringify({})
    });
    log(`Resumed paused agent ${agent.name ?? seededAgentName}.`);
    return fetchJson(new URL(`/api/agents/${agent.id}`, baseUrl).toString());
  }

  log(
    `${needsUpdate ? "Updated" : "Reusing"} ${seededAgentAdapterType} agent ` +
      `${agent?.name ?? seededAgentName} with model ${seededAgentAdapterConfig.model}.`
  );
  return agent;
}

async function prepareIssueForExecution(issueId, assigneeAgentId) {
  const issue = await getIssueDetails(issueId);
  const patch = {};
  const expectedExecutionWorkspaceSettings = {
    mode: "isolated_workspace",
    workspaceStrategy: {
      type: "git_worktree",
      worktreeParentDir: isolatedWorkspacesDir
    }
  };

  if (issue?.assigneeAgentId !== assigneeAgentId) {
    patch.assigneeAgentId = assigneeAgentId;
  }

  if (issue?.status !== "in_progress") {
    patch.status = "in_progress";
  }

  if (issue?.executionWorkspacePreference !== "isolated_workspace") {
    patch.executionWorkspacePreference = "isolated_workspace";
  }

  const currentMode = issue?.executionWorkspaceSettings?.mode ?? null;
  const currentStrategyType = issue?.executionWorkspaceSettings?.workspaceStrategy?.type ?? null;
  const currentWorktreeParentDir = issue?.executionWorkspaceSettings?.workspaceStrategy?.worktreeParentDir ?? null;
  if (
    currentMode !== expectedExecutionWorkspaceSettings.mode ||
    currentStrategyType !== expectedExecutionWorkspaceSettings.workspaceStrategy.type ||
    currentWorktreeParentDir !== expectedExecutionWorkspaceSettings.workspaceStrategy.worktreeParentDir
  ) {
    patch.executionWorkspaceSettings = expectedExecutionWorkspaceSettings;
  }

  if (issue?.executionWorkspaceId && !getRealizedExecutionWorkspace(issue)) {
    patch.executionWorkspaceId = null;
  }

  if (Object.keys(patch).length === 0) {
    log(`Issue ${issue?.identifier ?? issueId} is already assigned and in progress.`);
    return issue;
  }

  const updatedIssue = await fetchJson(new URL(`/api/issues/${issueId}`, baseUrl).toString(), {
    method: "PATCH",
    body: JSON.stringify(patch)
  });

  log(
    `Prepared issue ${updatedIssue?.identifier ?? issueId} for execution with agent ${assigneeAgentId} ` +
      `(status=${updatedIssue?.status ?? "unknown"}).`
  );
  return updatedIssue;
}

async function ensureIssueSeedComment(issueId) {
  const heartbeatContext = await getIssueHeartbeatContext(issueId);
  const commentCount = heartbeatContext?.commentCursor?.totalComments ?? 0;
  if (commentCount > 0) {
    log(`Issue ${heartbeatContext?.issue?.identifier ?? issueId} already has ${commentCount} comment(s).`);
    return heartbeatContext;
  }

  const result = await fetchJson(new URL(`/api/issues/${issueId}`, baseUrl).toString(), {
    method: "PATCH",
    body: JSON.stringify({
      comment: "Manual verification harness seeded this issue before assignment so Paperclip can focus on realizing the isolated workspace."
    })
  });

  log(`Seeded an initial comment on issue ${result?.issue?.identifier ?? issueId}.`);
  return result;
}

async function invokeAgentHeartbeat(agentId) {
  return fetchJson(new URL(`/api/agents/${agentId}/heartbeat/invoke`, baseUrl).toString(), {
    method: "POST",
    body: JSON.stringify({})
  });
}

async function ensurePluginInstalled(configPath) {
  try {
    await runCommand(
      "npx",
      getPaperclipCommandArgs(["plugin", "install", "--local", pluginRoot, "--data-dir", dataDir, "--config", configPath])
    );
    log("Installed local paperclip-editor-plugin plugin.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Plugin already installed: paperclip-editor-plugin")) {
      log("Plugin already installed in the manual instance; continuing.");
      return;
    }

    throw error;
  }
}

async function ensurePluginRegistered() {
  const pluginsUrl = new URL("/api/plugins", baseUrl).toString();
  const plugins = await fetchJson(pluginsUrl);
  if (!Array.isArray(plugins)) {
    throw new Error("Expected /api/plugins to return an array.");
  }

  const plugin = plugins.find((candidate) => {
    const manifestId = candidate?.manifestJson?.id;
    return candidate?.pluginKey === pluginKey || manifestId === pluginKey;
  });

  if (!plugin) {
    throw new Error(`Expected ${pluginKey} to be present in /api/plugins.`);
  }

  return pluginsUrl;
}

function buildIssueUrl(company, issue) {
  const issueRef = issue?.identifier ?? issue?.id;
  if (!issueRef) {
    throw new Error("Could not determine an issue reference for manual verification.");
  }

  const companyPrefix = typeof company?.identifier === "string" && company.identifier.trim()
    ? company.identifier.trim()
    : null;
  return companyPrefix
    ? new URL(`/${companyPrefix}/issues/${issueRef}`, baseUrl).toString()
    : new URL(`/issues/${issueRef}`, baseUrl).toString();
}

async function waitForServerExit(timeoutMs) {
  if (!serverProcess || serverProcess.exitCode !== null) {
    return;
  }

  await new Promise((resolvePromise) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolvePromise(undefined);
      }
    };

    serverProcess.once("close", finish);
    setTimeout(finish, timeoutMs);
  });
}

async function cleanup() {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;

  if (serverProcess) {
    if (serverProcess.exitCode === null && !serverProcess.killed) {
      serverProcess.kill("SIGINT");
      await waitForServerExit(5000);
    }

    if (serverProcess.exitCode === null && !serverProcess.killed) {
      serverProcess.kill("SIGKILL");
      await waitForServerExit(5000);
    }
  }

  if (!persistentStateRoot) {
    await rm(stateRoot, { recursive: true, force: true });
  }
}

async function main() {
  process.on("SIGINT", () => {
    if (shutdownRequested) {
      return;
    }

    shutdownRequested = true;
    void cleanup().finally(() => shutdownResolver());
  });

  process.on("SIGTERM", () => {
    if (shutdownRequested) {
      return;
    }

    shutdownRequested = true;
    void cleanup().finally(() => shutdownResolver());
  });

  await ensureStateRoot();
  log(`${persistentStateRoot ? "Persistent" : "Disposable"} working directory ${stateRoot}`);

  serverPort = await findAvailablePort(requestedPort);
  embeddedDbPort = await findAvailablePort(requestedDbPort);
  const configPath = join(paperclipHome, "instances", instanceId, "config.json");
  env.PAPERCLIP_CONFIG_PATH = configPath;
  await ensureConfigFile(configPath);
  baseUrl = `http://127.0.0.1:${serverPort}`;

  serverProcess = spawn("npx", getPaperclipCommandArgs(["run", "--config", configPath, "--data-dir", dataDir]), {
    cwd: pluginRoot,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  serverProcess.unref();
  serverProcess.stdout?.on("data", (chunk) => process.stdout.write(chunk.toString()));
  serverProcess.stderr?.on("data", (chunk) => process.stderr.write(chunk.toString()));
  serverProcess.on("error", (error) => {
    console.error(error);
  });

  await waitForReady(baseUrl, 180000);
  log(`Paperclip server is ready at ${baseUrl}.`);
  await ensureIsolatedWorkspacesEnabled({ baseUrl, fetchJson, log });

  const company = await ensureCompanySeeded();
  const cwd = await ensureWorkspaceFixture();
  const project = await ensureProjectWithLocalWorkspace(company.id, cwd);
  const issue = await ensureIssueSeeded(company.id, project.id);
  await ensureIssueSeedComment(issue.id);
  const agent = await ensureCodexLocalAgent(company.id);
  const preparedIssue = await prepareIssueForExecution(issue.id, agent.id);
  let realizedWorkspaceResult = getRealizedExecutionWorkspace(preparedIssue)
    ? {
      issue: preparedIssue,
      workspace: getRealizedExecutionWorkspace(preparedIssue)
    }
    : null;

  if (!realizedWorkspaceResult) {
    realizedWorkspaceResult = await waitForExecutionWorkspace(preparedIssue.id, wakeupSettleTimeoutMs, {
      throwOnTimeout: false
    });
  }

  if (!realizedWorkspaceResult) {
    log(
      `Issue ${preparedIssue?.identifier ?? preparedIssue.id} did not realize a worktree from assignment alone; ` +
        `invoking the agent heartbeat directly.`
    );
    await invokeAgentHeartbeat(agent.id);
    realizedWorkspaceResult = await waitForExecutionWorkspace(preparedIssue.id, executionWorkspaceTimeoutMs);
  }

  const realizedIssue = realizedWorkspaceResult.issue;
  const realizedWorkspace = realizedWorkspaceResult.workspace;
  await ensurePluginInstalled(configPath);
  const pluginsUrl = await ensurePluginRegistered();

  const issueUrl = buildIssueUrl(company, realizedIssue);
  if (process.platform === "darwin") {
    await runCommand("open", [issueUrl], { stdio: "ignore" });
  }

  console.log("");
  console.log("Manual verification instance is ready.");
  console.log(`Open: ${issueUrl}`);
  console.log(`Plugin: ${pluginDisplayName}`);
  console.log(`Plugins API: ${pluginsUrl}`);
  console.log(`Company: ${company?.name ?? "Dummy Company"}`);
  console.log(`Project: ${project?.name ?? seededProjectName}`);
  console.log(`Issue: ${realizedIssue?.identifier ?? realizedIssue?.id ?? seededIssueTitle}`);
  console.log(`Agent: ${agent?.name ?? seededAgentName} (${seededAgentAdapterType}, ${seededAgentAdapterConfig.model})`);
  console.log(`Workspace: ${cwd}`);
  console.log(`Isolated worktree parent: ${isolatedWorkspacesDir}`);
  console.log(`Realized execution workspace: ${realizedWorkspace?.cwd ?? "none"}`);
  console.log(`State dir: ${stateRoot}`);
  console.log("");
  console.log("Checklist:");
  console.log("1. Confirm the issue detail page is open on localhost.");
  console.log("2. Confirm the project is configured for isolated issue checkouts and the issue is assigned to the manual codex_local agent.");
  console.log("3. Confirm an Open in split button appears in the issue toolbar.");
  console.log("4. Click the main IntelliJ button or the dropdown item.");
  console.log("5. Confirm IntelliJ IDEA opens the realized isolated git worktree shown above, not the seeded project workspace.");
  console.log("");
  console.log("Press Ctrl+C when you are done to stop the manual Paperclip instance.");

  await shutdownPromise;
}

try {
  await main();
} finally {
  await cleanup();
}
