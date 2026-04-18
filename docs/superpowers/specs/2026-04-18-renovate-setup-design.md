# Dependency And Release Automation Design

## Summary

Add two repository-level automation pieces:

- a Renovate configuration so this package gets automated dependency update PRs for `pnpm` dependencies and GitHub Actions
- a GitHub Actions release workflow, aligned with the other Paperclip plugins under `~/Dev/alvarosanchez`, so published GitHub Releases can validate and publish the npm package from a semver tag

Low-risk dependency updates should merge automatically only after the existing CI workflow passes, while runtime dependency changes and all major version bumps should remain review-driven.

## Goals

- Keep routine dependency maintenance lightweight for this single-package repository.
- Reuse the existing GitHub Actions `CI` workflow and `pnpm verify` script as the safety gate for any automerge behavior.
- Limit silent runtime change risk by requiring manual review for `dependencies` updates, especially `@paperclipai/plugin-sdk`, `react`, and `react-dom`.
- Reduce configuration drift by validating the Renovate config locally before finishing the change.
- Add the same release trigger and publish shape used by the sibling Paperclip plugins: GitHub Release `published` event, semver tag parsing, package version stamping, npm publish with provenance, and syncing the checked-in version back to the release branch.

## Non-Goals

- Adding a self-hosted Renovate runner or GitHub Action to execute Renovate.
- Enabling blanket automerge for all non-major updates.
- Introducing a custom release tool or release orchestration outside GitHub Releases.

## Renovate Configuration

- Create a root `renovate.json` file with the Renovate JSON schema reference for editor validation.
- Extend from Renovate's recommended baseline and opt into config migration support so future Renovate deprecations are easier to absorb.
- Keep the Dependency Dashboard enabled through the baseline preset so ignored or deferred updates stay visible.
- Configure package rules for:
  - auto-merging `minor` and `patch` updates in `devDependencies` when the current version is not pre-`1.0.0`
  - keeping pre-`1.0.0` development packages manual, since those releases can still carry breaking changes
  - auto-merging GitHub Actions `digest`, `pin`, `patch`, and `minor` updates
  - keeping all `dependencies` updates manual, regardless of update type
- Use PR-based automerge so updates still go through the normal pull request and CI path instead of bypassing repository protections.
- Keep the initial setup scoped to the package managers already present in this repository: npm/pnpm manifests and GitHub Actions workflow files.

## Release Workflow

- Add `.github/workflows/release.yml` triggered on `release.published`.
- Follow the established sibling-plugin release model:
  - check out the repository with full history available for branch sync
  - set up `pnpm` and Node with npm registry publishing enabled
  - derive the release version from a `vX.Y.Z` or semver-compatible prerelease tag
  - stamp `package.json` from the release tag before build/publish steps
  - run repository verification before publishing
  - publish with `npm publish --access public --provenance`
  - sync the checked-in `package.json` version back to the release target branch after a successful publish
- Add a small `scripts/sync-release-version.mjs` helper plus a `package.json` `release:sync-version` script so both local commands and workflows use the same version parsing and stamping behavior.
- Prefer a two-job workflow:
  - `verify` runs `pnpm verify` against the stamped release version
  - `publish` depends on `verify`, rehydrates the stamped version in a fresh checkout, publishes to npm, and then syncs `package.json` back to the branch
- Align GitHub Action usage with the sibling repositories by pinning workflow actions to commit SHAs instead of floating tags. This change should cover both the new release workflow and the existing `ci.yml`.

## Workflow Impact

- Renovate will open PRs for dependency and action updates once the bot/app is enabled for the repository.
- Low-risk updates can merge themselves after the existing `CI` workflow succeeds.
- Runtime dependency changes and majors will still surface as normal PRs for review.
- A published GitHub Release with a valid semver tag becomes the release entry point for npm publication.
- The release workflow updates `package.json` to the published version on the release branch, matching the pattern used by the other maintained Paperclip plugins.
- Because GitHub Actions will be pinned to SHAs, Renovate should also manage workflow dependency updates so those digests stay current.
- The repository already runs CI for pull requests, so no extra branch protection logic is required for Renovate. If this repository later enables GitHub merge queue, the `CI` workflow should also listen to `merge_group`.

## Error Handling And Boundaries

- If Renovate proposes an update that breaks `pnpm verify`, automerge will stop at the failing PR and require manual intervention.
- If a dependency later proves too risky for automerge, it can be carved out with a package-specific override without restructuring the rest of the config.
- If the repository never enables the Renovate GitHub App or a self-hosted Renovate runner, the config file remains inert and harmless.
- If a GitHub Release tag is not valid semver, the release workflow should fail before any publish step runs.
- If the stamped `package.json` version does not match the parsed release tag, the workflow should fail before publishing.
- If the release target branch no longer exists on origin, the publish can still succeed, but the post-publish branch sync should skip cleanly.

## Verification

- Validate the config with Renovate's `renovate-config-validator`.
- Re-read the final config to ensure the automerge rules match the approved policy and do not accidentally cover runtime dependencies or major updates.
- Validate the release helper locally with representative semver and prerelease inputs.
- Re-read the final workflow to confirm it uses the intended release trigger, verification gate, provenance publish, and branch sync behavior.
