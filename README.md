# paperclip-editor-plugin

[![CI](https://github.com/alvarosanchez/paperclip-editor-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/alvarosanchez/paperclip-editor-plugin/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/alvarosanchez/paperclip-editor-plugin)](./LICENSE)
[![Paperclip Plugin](https://img.shields.io/badge/Paperclip-plugin-111827)](https://github.com/paperclipai/paperclip)
[![Host](https://img.shields.io/badge/host-localhost_only-0ea5e9)](#security--scope)
[![Platform](https://img.shields.io/badge/platform-macOS-111827)](#current-scope)

Paperclip plugin that adds a generic `Open in` split button to the issue detail toolbar for local workspace actions.

This plugin is intentionally local-first. It only activates when Paperclip is running on `localhost` or `127.0.0.1`, and it only acts on workspaces that resolve to a local path on the same machine.

## What it does

- Adds a right-aligned `Open in` split button to the issue toolbar.
- Uses the issue's realized execution workspace when one exists.
- Falls back to the project's configured workspace when no execution workspace is active.
- Offers local actions for the selected workspace path.
- Keeps the launcher hidden for non-local Paperclip instances.

## Current scope

The current implementation is intentionally narrow:

- Current actions: `IntelliJ IDEA`, `VS Code`, `Copy path to clipboard`
- Supported launch platform: macOS
- Host requirement: Paperclip served from `localhost` or `127.0.0.1`
- Workspace requirement: the issue workspace must resolve to a local path on the same computer as the Paperclip instance

## Security & scope

This plugin does not try to open remote or cloud-hosted workspaces.

That restriction is deliberate:

- opening a local IDE only makes sense when the workspace path is on the current machine
- hiding the control on non-local hosts avoids presenting an action that cannot succeed
- editor launchers use curated local commands instead of arbitrary shell input
- non-launch actions operate only on the resolved local workspace path

## Installation

If you want to try the plugin from source, install it from a local checkout:

```bash
npx -p node@20 -p paperclipai paperclipai plugin install --local /absolute/path/to/paperclip-editor-plugin
```

After installation, open a local Paperclip issue page on `localhost` and look for the `Open in` split button in the issue toolbar.

This repository is prepared for npm publication. After the package is published, you can install it through the standard Paperclip plugin flow using the published package name.

## Development

```bash
pnpm install
pnpm verify
```

Useful scripts:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm pack:check`
- `pnpm verify`
- `pnpm verify:manual`

## Manual verification

`pnpm verify:manual` builds the plugin, starts a local Paperclip instance, enables isolated workspaces, seeds a localhost project and issue, installs the plugin, and prints the issue URL plus the realized execution workspace path.

The manual harness currently prepares:

- a local Paperclip instance bound to loopback
- a project configured for isolated issue workspaces via `git_worktree`
- a `codex_local` agent using `gpt-5.4`
- a seeded issue whose toolbar can be tested against a real isolated workspace

## Packaging notes

The repository is prepared for public npm publishing:

- package metadata includes `homepage`, `repository`, and `bugs`
- `prepublishOnly` runs the full verification suite before `npm publish`
- CI validates typecheck, tests, build, and package contents
- `npm pack --dry-run` is part of the verification path
