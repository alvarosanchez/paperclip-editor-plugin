import assert from "node:assert/strict";
import test from "node:test";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";

import manifest from "../src/manifest.ts";
import plugin, { buildEditorLaunchCommand, type EditorAvailability } from "../src/worker.ts";
import { pinToolbarSlotToEnd } from "../src/ui/host-toolbar-alignment.ts";
import { ensureIsolatedWorkspacesEnabled } from "../scripts/e2e/manual-paperclip-verify-lib.js";

async function withMockPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T> | T): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  if (!descriptor?.configurable) {
    throw new Error("process.platform is not configurable in this runtime.");
  }

  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform
  });

  try {
    return await run();
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
}

test("declares the issue toolbar slot and required capabilities", () => {
  assert.ok(manifest.capabilities.includes("ui.action.register"));
  assert.ok(manifest.capabilities.includes("issues.read"));
  assert.ok(manifest.capabilities.includes("project.workspaces.read"));

  const toolbarSlot = manifest.ui?.slots?.find((slot) => slot.type === "toolbarButton");
  assert.ok(toolbarSlot);
  assert.deepEqual(toolbarSlot.entityTypes, ["issue"]);
  assert.equal(toolbarSlot.exportName, "EditorIssueToolbarButton");
});

test("reports availability for localhost issue workspaces", async () => {
  const harness = createTestHarness({ manifest });
  await plugin.definition.setup(harness.ctx);

  harness.seed({
    issues: [
      {
        id: "issue-1",
        companyId: "company-1",
        projectId: "project-1",
        title: "Test issue"
      } as never
    ]
  });

  harness.ctx.projects.getWorkspaceForIssue = async () => ({
    id: "workspace-1",
    companyId: "company-1",
    projectId: "project-1",
    name: "Main workspace",
    path: "/tmp/example-project",
    isPrimary: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const response = await withMockPlatform("darwin", () =>
    harness.getData<EditorAvailability>("editor.availability", {
      companyId: "company-1",
      issueId: "issue-1",
      hostOrigin: "http://localhost:3000"
    })
  );

  assert.equal(response.available, true);
  assert.deepEqual(response.editors, [{ id: "intellij-idea", label: "IntelliJ IDEA" }]);
  assert.equal(response.workspacePath, "/tmp/example-project");
});

test("hides availability when the Paperclip host is not localhost", async () => {
  const harness = createTestHarness({ manifest });
  await plugin.definition.setup(harness.ctx);

  harness.seed({
    issues: [
      {
        id: "issue-1",
        companyId: "company-1",
        projectId: "project-1",
        title: "Test issue"
      } as never
    ]
  });

  harness.ctx.projects.getWorkspaceForIssue = async () => ({
    id: "workspace-1",
    companyId: "company-1",
    projectId: "project-1",
    name: "Main workspace",
    path: "/tmp/example-project",
    isPrimary: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const response = await harness.getData<EditorAvailability>("editor.availability", {
    companyId: "company-1",
    issueId: "issue-1",
    hostOrigin: "https://paperclip.example.com"
  });

  assert.equal(response.available, false);
  assert.match(response.reason ?? "", /localhost/i);
});

test("builds the IntelliJ launch command for macOS", () => {
  assert.deepEqual(buildEditorLaunchCommand("intellij-idea", "/tmp/example-project", "darwin"), {
    command: "open",
    args: ["-a", "IntelliJ IDEA", "/tmp/example-project"]
  });
});

test("prefers an issue's current execution workspace path when present", async () => {
  const harness = createTestHarness({ manifest });
  await plugin.definition.setup(harness.ctx);

  harness.seed({
    issues: [
      {
        id: "issue-1",
        companyId: "company-1",
        projectId: "project-1",
        title: "Isolated workspace issue",
        currentExecutionWorkspace: {
          id: "execution-workspace-1",
          cwd: "/tmp/example-project-issue-1"
        }
      } as never
    ]
  });

  harness.ctx.projects.getWorkspaceForIssue = async () => ({
    id: "workspace-1",
    companyId: "company-1",
    projectId: "project-1",
    name: "Primary workspace",
    path: "/tmp/example-project",
    isPrimary: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const response = await withMockPlatform("darwin", () =>
    harness.getData<EditorAvailability>("editor.availability", {
      companyId: "company-1",
      issueId: "issue-1",
      hostOrigin: "http://127.0.0.1:3000"
    })
  );

  assert.equal(response.available, true);
  assert.equal(response.workspacePath, "/tmp/example-project-issue-1");
});

test("pins the host toolbar wrapper to the end of the row", () => {
  const hostWrapper = {
    parentElement: null,
    style: {
      marginInlineStart: ""
    }
  };
  const rootElement = {
    parentElement: hostWrapper,
    style: {
      marginInlineStart: ""
    }
  };

  const restore = pinToolbarSlotToEnd(rootElement);

  assert.equal(hostWrapper.style.marginInlineStart, "auto");

  restore();

  assert.equal(hostWrapper.style.marginInlineStart, "");
});

test("enables isolated workspaces for the manual verification instance when needed", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const result = await ensureIsolatedWorkspacesEnabled({
    baseUrl: "http://127.0.0.1:3000",
    fetchJson: async (url: string, init?: RequestInit) => {
      calls.push({ url, init });

      if (!init?.method || init.method === "GET") {
        return { enableIsolatedWorkspaces: false };
      }

      assert.equal(init.method, "PATCH");
      assert.deepEqual(JSON.parse(String(init.body)), {
        enableIsolatedWorkspaces: true
      });

      return { enableIsolatedWorkspaces: true };
    }
  });

  assert.equal(result.enableIsolatedWorkspaces, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "http://127.0.0.1:3000/api/instance/settings/experimental");
  assert.equal(calls[1]?.url, "http://127.0.0.1:3000/api/instance/settings/experimental");
});
