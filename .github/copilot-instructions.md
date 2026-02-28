# Copilot Instructions for pnpm-settings-migrator

## Big Picture

- Single-purpose Node CLI: migrate pnpm settings from `package.json` (`pnpm`, optional `resolutions`) and `.npmrc` into `pnpm-workspace.yaml`.
- Main flow lives in `src/core.ts` (`migratePnpmSettings`); CLI wiring is in `src/cli.ts`; public API exports are in `src/index.ts`.
- Keep this tool deterministic and one-shot: read files, merge settings, write outputs, optionally clean source files.

## Architecture and Data Flow

- File paths are resolved from `options.cwd` in `src/core.ts` using `pathe/resolve`.
- Input existence checks happen first (`fsExists`), with early returns for “nothing to migrate”.
- Incoming settings are composed from:
  1.  `.npmrc` pnpm-related keys only (`pick(readNpmrc(), PNPM_SETTINGS_FIELDS)`)
  2.  `package.json.pnpm`
  3.  `package.json.resolutions` mapped into `pnpm.overrides` when `yarnResolutions=true`
- Final workspace config is `mergeByStrategy(existingWorkspace, incomingSettings, strategy)` from `src/utils/merge.ts`.
- YAML write uses `yaml` `Document` API; JSON/YAML indent is preserved via `detect-indent`; all writes go through `fsWriteFile` (always trailing newline).

## Merge/Behavior Rules (Do Not Break)

- Strategies are contract-tested in `tests/utils/merge.test.ts` and integration-tested in `tests/core.test.ts`:
  - `discard`: keep existing conflicting values, add missing incoming keys.
  - `merge` (default): deep merge + array dedupe with existing values preserved for primitives.
  - `overwrite`: prefer incoming conflicting values while retaining existing keys not present in incoming.
- `.npmrc` parsing converts kebab-case to camelCase (`readNpmrc`), and cleanup removes only pnpm-related keys listed in `src/constants.ts`.
- Cleanup flags are opt-out via negative CLI flags (`--no-clean-npmrc`, `--no-clean-package-json`, `--no-yarn-resolutions`, `--no-newline-between`).

## Project Conventions

- Prefer editing `src/core.ts` for migration semantics, `src/options.ts` for defaults, and `src/constants.ts` for allowed `.npmrc` fields.
- Preserve current utility boundaries (`src/utils/fs.ts`, `src/utils/npmrc.ts`, `src/utils/merge.ts`) rather than inlining logic into CLI/core.
- Use named exports; avoid introducing default exports in source modules.
- Keep path handling with `pathe` (`resolve`, `join`) for cross-platform behavior.

## Developer Workflows

- Install deps: `pnpm install`
- Run tests: `pnpm test` (Vitest)
- Typecheck: `pnpm typecheck` (uses `tsgo --noEmit`, not plain `tsc`)
- Lint/format checks: `pnpm lint` and `pnpm format:check`
- Build: `pnpm build` (tsdown dual build for lib + CLI)
- Release gate parity: `pnpm run release:check`

## Agent Tips

- When changing merge semantics, update both unit tests (`tests/utils/merge.test.ts`) and migration integration tests (`tests/core.test.ts`).
- If you add a migratable `.npmrc` key, update `PNPM_SETTINGS_FIELDS` and ensure prune/read behavior remains symmetric.
- Keep CLI option names aligned with `src/options.ts` defaults and README documentation.
