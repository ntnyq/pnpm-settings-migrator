# Repository Guidelines

## Project Structure & Module Organization

This repository ships both an ESM library and a CLI for migrating pnpm settings
into `pnpm-workspace.yaml`. Source code lives in `src/`: `core.ts` coordinates
migration, `options.ts` defines defaults, `constants.ts` lists supported fields,
and `cli.ts` maps command-line flags. Keep reusable filesystem, npmrc, color, and
merge logic in `src/utils/`. Tests live in `tests/`; shared setup and workspace
helpers are in `tests/setup.ts` and `tests/helpers.ts`, while static sample data
belongs in `tests/fixtures/`. Build configuration is at the repository root and
generated output goes to `dist/`.

## Build, Test, and Development Commands

Use the pnpm version declared in `package.json`.

- `pnpm install --frozen-lockfile` installs the exact locked dependencies.
- `pnpm run dev` rebuilds with tsdown in watch mode.
- `pnpm run build` emits the library, CLI, and declarations to `dist/`.
- `pnpm run lint` checks source with Oxlint; add `--fix` for safe fixes.
- `pnpm run format:check` verifies Oxfmt formatting.
- `pnpm run typecheck` runs strict TypeScript checks without emitting files.
- `pnpm run test` runs the Vitest suite once.
- `pnpm run release:check` runs lint, formatting, typechecking, and tests.

## Coding Style & Naming Conventions

Follow `.editorconfig` and `.oxfmtrc.jsonc`: two-space indentation, LF endings,
single quotes, no semicolons, trailing commas, and an 80-column target. Keep ESM
imports and strict TypeScript types. Use `camelCase` for functions and variables,
`PascalCase` for types, and descriptive lower-case filenames such as
`utils/npmrc.ts`. Let Oxfmt sort imports and package scripts rather than ordering
them manually.

## Testing Guidelines

Vitest files follow `tests/<area>.<scenario>.test.ts`, for example
`core.strategy.test.ts`. Use `createTestWorkspace()` for isolated filesystem
cases and assert both generated YAML and cleanup behavior. Add regression tests
for every behavior change; merge changes should cover `discard`, `merge`, and
`overwrite`. No numeric coverage threshold is configured. Run
`pnpm run release:check` before opening a pull request.

## Commit & Pull Request Guidelines

Follow the repository's Conventional Commit style: `feat: ...`, `fix: ...`,
`test: ...`, or scoped maintenance such as `chore(deps): ...`. Keep each commit
focused. Pull requests should explain the behavior and compatibility impact,
link relevant issues, list verification commands, and update `README.md` when
flags or defaults change. For CLI-output changes, include a concise before/after
terminal or YAML example; screenshots are unnecessary.
