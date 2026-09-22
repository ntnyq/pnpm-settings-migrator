# Repository Guidelines

## Project Structure & Module Organization

This repository ships both an ESM library and a CLI for migrating pnpm settings
into `pnpm-workspace.yaml`. Source code lives in `src/`: `core.ts` coordinates
migration and `index.ts` exposes the public library API. Group static constants
in `src/constants/` and named types in `src/types/`, each with an `index.ts`
that aggregates its modules. Keep the package's public type exports explicit in
`src/index.ts`; internal types are not automatically part of the public API.
Organize migration logic under `src/features/`: `compatibility/` handles version
conversion, `sources/` reads and cleans configuration sources, `migration/`
collects sources and persists results, and `settings/` validates settings and
collects changes. `features/options.ts` resolves migration options. CLI parsing,
execution, and terminal rendering belong in `src/cli/`; its entry is
`src/cli/index.ts`, built as `dist/cli.mjs`. Keep reusable filesystem, color,
merge, and YAML document helpers in `src/utils/`. Tests live in `tests/`:
`migration/` covers complete migration behavior, `features/` tests internal
modules directly, `cli/` covers CLI parsing and rendering, and `utils/` tests
reusable helpers. Shared setup and workspace helpers are in `tests/setup.ts` and
`tests/helpers.ts`, while static sample data belongs in `tests/fixtures/`. Build configuration is at
the repository root and generated output goes to `dist/`.

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
them manually. Use multiline JSDoc for documentation comments; single-line block
comments are forbidden in JavaScript and TypeScript files. Document every
exported function with meaningful `@param` and `@returns` tags where applicable.

## Testing Guidelines

Vitest files follow `tests/<area>/<scenario>.test.ts`, for example
`tests/migration/strategy.test.ts`. Group migration source handling under
`tests/migration/sources/` and version conversion and schema compatibility under
`tests/migration/compatibility/`. Use explicit version names such as
`pnpm-12.5.test.ts` for release boundaries instead of `recent` or `latest`.
Keep regression cases with the feature they cover rather than in catch-all
regression files. CLI build and execution helpers live in `tests/cli/helpers.ts`.
Use `createTestWorkspace()` with a unique scope per test file for isolated
filesystem cases and assert both generated YAML and cleanup behavior. Add
regression tests for every behavior change; merge changes should cover `discard`, `merge`, and
`overwrite`. No numeric coverage threshold is configured. Run
`pnpm run release:check` before opening a pull request.

## Commit & Pull Request Guidelines

Follow the repository's Conventional Commit style: `feat: ...`, `fix: ...`,
`test: ...`, or scoped maintenance such as `chore(deps): ...`. Keep each commit
focused. Pull requests should explain the behavior and compatibility impact,
link relevant issues, list verification commands, and update `README.md` when
flags or defaults change. For CLI-output changes, include a concise before/after
terminal or YAML example; screenshots are unnecessary.
