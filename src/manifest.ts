import { createRequire } from "node:module";
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: unknown };

const MANIFEST_VERSION =
  (typeof process.env.PLUGIN_VERSION === "string" && process.env.PLUGIN_VERSION.trim())
  || (typeof packageJson.version === "string" && packageJson.version.trim())
  || "0.0.0-dev";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-editor-plugin",
  apiVersion: 1,
  version: MANIFEST_VERSION,
  displayName: "Editor Launcher",
  description: "Open issue workspaces in local editors from the Paperclip issue toolbar.",
  author: "Alvaro Sanchez",
  categories: ["workspace", "ui"],
  capabilities: [
    "ui.action.register",
    "issues.read",
    "project.workspaces.read"
  ],
  ui: {
    slots: [
      {
        type: "toolbarButton",
        id: "paperclip-editor-plugin-issue-toolbar-button",
        displayName: "Open in",
        exportName: "EditorIssueToolbarButton",
        entityTypes: ["issue"]
      }
    ]
  },
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui/"
  }
};

export default manifest;
