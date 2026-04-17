# Paperclip Editor Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Paperclip plugin that adds a local-only `Open in...` issue toolbar control and launches the issue workspace in IntelliJ IDEA.

**Architecture:** The manifest exposes one issue toolbar slot. The worker resolves issue workspaces and launches a curated IntelliJ command. The hosted UI renders a split button with a one-item dropdown and hides itself unless the host is local and the issue has a workspace.

**Tech Stack:** TypeScript, React, `@paperclipai/plugin-sdk`, esbuild, Vitest.

---

### Task 1: Worker availability and launcher behavior

**Files:**
- Modify: `src/worker.ts`
- Test: `tests/plugin.spec.ts`

- [ ] Implement workspace resolution through `ctx.issues.get(...)` and `ctx.projects.listWorkspaces(...)`.
- [ ] Implement localhost-only eligibility checks.
- [ ] Implement the curated IntelliJ launch command and launch action.
- [ ] Make `tests/plugin.spec.ts` pass for availability and command generation.

### Task 2: Toolbar split button UI

**Files:**
- Modify: `src/ui/index.tsx`

- [ ] Render the split button UI for issue pages only.
- [ ] Load worker availability data and hide the control when unavailable.
- [ ] Trigger the default IntelliJ action from the primary button.
- [ ] Show a dropdown with `IntelliJ IDEA` and launch it from the menu.

### Task 3: Manual verification and packaging

**Files:**
- Modify: `README.md`
- Modify: `SPEC.md`
- Modify: `scripts/manual-verify.mjs`

- [ ] Document the localhost-only behavior and manual test flow.
- [ ] Ensure `pnpm verify:manual` prints actionable local test instructions.
