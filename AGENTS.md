# AGENTS.md

## Purpose

This repository provides a CLI and library that migrate pnpm settings from `package.json` and `.npmrc` into `pnpm-workspace.yaml`.

Read first:

- [README.md](README.md)
- [package.json](package.json)
- [src/core.ts](src/core.ts)
- [tests/core.test.ts](tests/core.test.ts)

## Runbook

Use pnpm for all tasks.

- Install: `pnpm install`
- Build: `pnpm run build`
- Lint: `pnpm run lint`
- Typecheck: `pnpm run typecheck`
- Test: `pnpm run test`
- Full pre-release check: `pnpm run release:check`

Before proposing release-related changes, run `pnpm run release:check`.

## Architecture Boundaries

- Core migration flow lives in [src/core.ts](src/core.ts).
- Option defaults and validation live in [src/options.ts](src/options.ts).
- Source-of-truth list of migratable settings is [src/constants.ts](src/constants.ts).
- CLI parsing and flags mapping live in [src/cli.ts](src/cli.ts).
- Merge behavior by strategy is in [src/utils/merge.ts](src/utils/merge.ts).

Keep CLI behavior aligned with core options and tests when changing flags or defaults.

## Project Conventions

- TypeScript is strict; keep ESM style and current import/export patterns.
- Key ordering matters in this repo (`perfectionist: { all: true }` in ESLint config).
- `PNPM_SETTINGS_FIELDS` in [src/constants.ts](src/constants.ts) is intentionally sorted (`@keep-sorted`, `@keep-unique`).
- Prefer small, composable utility changes under [src/utils](src/utils) instead of adding branching in unrelated files.

## Testing Expectations

- Add/adjust Vitest cases in [tests/core.test.ts](tests/core.test.ts) for behavior changes.
- Validate all merge strategies (`discard`, `merge`, `overwrite`) when changing merge logic.
- Validate cleanup toggles (`cleanNpmrc`, `cleanPackageJson`, `yarnResolutions`) when touching migration flow.

## CI And Release Notes

- CI runs lint + typecheck, then build + test across Ubuntu/Windows/macOS and Node 22/24/26: [.github/workflows/ci.yml](.github/workflows/ci.yml).
- Release is tag-driven (`v*`) and publishes from CI: [.github/workflows/release.yml](.github/workflows/release.yml).

Avoid changing release mechanics unless explicitly requested.
