# pnpm-settings-migrator

[![CI](https://github.com/ntnyq/pnpm-settings-migrator/workflows/CI/badge.svg)](https://github.com/ntnyq/pnpm-settings-migrator/actions)
[![NPM VERSION](https://img.shields.io/npm/v/pnpm-settings-migrator.svg)](https://www.npmjs.com/package/pnpm-settings-migrator)
[![NPM DOWNLOADS](https://img.shields.io/npm/dy/pnpm-settings-migrator.svg)](https://www.npmjs.com/package/pnpm-settings-migrator)
[![LICENSE](https://img.shields.io/github/license/ntnyq/pnpm-settings-migrator.svg)](https://github.com/ntnyq/pnpm-settings-migrator/blob/main/LICENSE)

Move pnpm settings from `pnpm` field in `package.json` and `.npmrc` file to `pnpm-workspace.yaml`.

## Usage

Run in your workspace root:

```shell
pnpm dlx pnpm-settings-migrator
```

<details>
<summary>CLI output and migration outcomes</summary>

After migration, the CLI reports how many root settings changed and shows a
GitHub-style YAML diff. Removed lines are red and added lines are green:

```text
✔ 2 settings changed

  packages:
    - packages/*
+   - apps/*

  overrides:
    foo: 1.0.0
+   bar: 2.0.0
```

When nothing needs updating, the only output is:

```text
ℹ No changes needed.
```

The CLI no longer prints a startup banner, missing optional files, a zero-change
count, or a duplicate completion message. Use `--version` to see the version.
Warnings are reserved for settings requiring attention. Information blocks have
one blank line between them, with no extra blank lines at the start or end.

Other outcomes are reported according to the files actually changed:

- No configuration files: `ℹ No configuration files found.`
- Source cleanup with no settings diff: `✔ Migration completed. Source settings cleaned up.`
- Runtime migration with no settings diff: `✔ Migration completed. Node.js runtime updated in package.json.`
- File formatting changes with no settings diff: `✔ Migration completed. Configuration files updated.`
- Failure: one error report and exit code `1`.

</details>

## Library usage

```ts
import { migratePnpmSettings } from 'pnpm-settings-migrator'

const result = await migratePnpmSettings({ cwd: '/path/to/workspace' })
```

<details>
<summary>Library results and error handling</summary>

Library calls now return a `MigrationResult` and do not print logs. The result
contains `settingsChanges` (before/after root workspace settings), `changedFiles`
(absolute paths, including created or removed files), `sourceSettingsCleaned`,
`packageJsonRuntimeChanged`, `hasConfigurationFiles`, and `warnings`. Errors are
thrown to the caller. Consumers that relied on console output should render the
returned changes and warnings themselves.

</details>

## CLI Options

### `--cwd`

- **Type**: `string`
- **Default**: `process.cwd()`

Current working directory.

### `--sort-keys`

- **Type**: `boolean`
- **Default**: `false`

Sort keys when write `pnpm-workspace.yaml`.

### `--compatibility`

- **Type**: `'auto' | 'v10' | 'v11' | 'v12'`
- **Default**: `'auto'`

Compatibility major for migrated settings:

- `auto`: infer from `targetVersion`, `packageManager`, or
  `devEngines.packageManager` (`pnpm@12+` => `v12`, `pnpm@11` => `v11`,
  otherwise `v10`).
- `v10`: keep legacy settings and migrate schema-aligned pnpm config keys from `.npmrc`.
- `v11`: normalize to v11-compatible settings (`allowBuilds`, `allowUnusedPatches`, etc.).
- `v12`: use the v12 schema, including `globalShims`, and enable additional
  fields according to the confirmed target version.

<details>
<summary>Compatibility resolution and validation</summary>

An explicit major still uses a matching version from the project declarations.
For example, `--compatibility v12` with `packageManager: "pnpm@12.4.0"` enables
12.4 capabilities. A pin to another major supplies no minor capabilities for
the selected major; use `--target-version` to state the intended release.

In `v11` and `v12` modes, the migrator validates existing workspace keys,
filters incoming settings against the resolved capabilities, and applies
required normalization to legacy files and `pnpm-workspace.yaml`.

</details>

### `--target-version`

- **Type**: `string` (an exact version such as `'12.4.0'`)
- **Default**: inferred from the project when possible

Override the target pnpm version without changing the project's package manager
pin. Resolution order is explicit `targetVersion`, then `packageManager`, then
`devEngines.packageManager`. An explicit `compatibility` major must agree with
`targetVersion`; conflicts fail before any files are written.

```ts
await migratePnpmSettings() // Infer the target from the project
await migratePnpmSettings({ compatibility: 'v12' }) // Infer a matching minor
await migratePnpmSettings({ targetVersion: '12.4.0' }) // Target this exact release
```

<details>
<summary>Version inference and supported version formats</summary>

Version ranges are not accepted by `targetVersion`. Project ranges, conflicting
`devEngines` entries, prereleases, and declarations without a confirmed matching
version retain the base major schema. Build metadata on exact stable versions
is accepted. Later stable minors automatically inherit known capabilities;
there are no minor-specific compatibility options.

</details>

<details>
<summary>Version-specific settings and requirements</summary>

For pnpm 12.4.0 and later stable v12 releases, the migrator additionally accepts
`trustPolicyExcludePrune`, `python`, `cargo`, `pipelines`, `pipelineBase`, and
`packageConfigs`, plus task fields `outputs`, `inputs`, `env`, `cache`, and
`cargoTargetDir`. On older or unconfirmed targets, a `tasks` object containing
these fields stays in its source as a whole.

For pnpm 12.5.0 and later stable v12 releases, the migrator also accepts
`concurrencyGroups`, task `concurrencyGroup`, platform lists in
`supportedArchitectures`, Python `versions` / `overrides` / `constraints`, and
`registries` declarations with `ecosystem`. Python registry `packages` routes
require 12.5.1. Unsupported nested settings stay in their source as a whole.
The legacy OS/CPU/libc architecture mapping continues to work.

pnpm 12.5 removes `python.indexUrl` and `cargo.indexUrl`. Settings containing
these fields are retained with an incompatibility warning; existing workspaces
containing them fail validation before any files are written. Replace them with
URL-keyed `registries` entries using `ecosystem: pypi` or `ecosystem: cargo`.
The registry prefix `pkg` is reserved from 12.5 onward. Tool download mirrors
under `tools` belong in global `config.yaml` or `PNPM_CONFIG_TOOLS` and are
never migrated into the project workspace.

On the v11 line, `trustPolicyExcludePrune` requires a confirmed stable version
from 11.27.0 onward; v12 support still starts at 12.4.0.

For pnpm 12.6.0 and later stable v12 releases, the migrator accepts `autoDedupe`,
`saveTypes`, `tagVersionPrefix`, and signed 32-bit `tasks.*.priority` values.
`progress` and `loglevel` also require 12.6.0 for v12 targets, when pnpm first
consumes them from workspace configuration; their v11 support is unchanged.
Invalid values and fields unsupported by the target remain in their sources.
The global-only `macosBackup` setting is preserved with a project-refused warning.

</details>

<details>
<summary>Automated v10 to v11 conversions</summary>

Automated v10 to v11 conversions include:

- `managePackageManagerVersions`, `packageManagerStrict`, and
  `packageManagerStrictVersion` -> `pmOnFail`
- `onlyBuiltDependencies`, `onlyBuiltDependenciesFile`,
  `neverBuiltDependencies`, and `ignoredBuiltDependencies` -> `allowBuilds`
- `allowNonAppliedPatches` -> `allowUnusedPatches`
- `auditConfig.ignoreCves` -> `auditConfig.ignoreGhsas`
- `useNodeVersion` and root `executionEnv.nodeVersion` ->
  `package.json#devEngines.runtime`
- `.npmrc` entries such as `node-mirror:release` -> `nodeDownloadMirrors`
- removal of `ignoreDepScripts` and `ignorePatchFailures`, which have no v11
  equivalent

</details>

<details>
<summary>Migration rules, limitations, and compatibility coverage</summary>

Notes:

- `.npmrc` migration is aligned with the target pnpm workspace schema. Unknown
  keys and settings supported only by a different pnpm version stay in `.npmrc`
  with a warning.
- Scalar list settings such as `public-hoist-pattern=*eslint*` become YAML
  arrays (`publicHoistPattern: ['*eslint*']`). Existing arrays and patterns
  containing commas are preserved without splitting their values.
- In `v11` and `v12`, auth/registry keys and project-refused machine settings
  such as `globalDir`, `stateDir`, `configDir`, and `scope` stay in `.npmrc`.
- Registry declarations containing embedded credentials or dynamic `${...}`
  URLs stay in their source with a warning.
- Dynamic `${...}` values in `httpProxy`, `httpsProxy`, `noProxy`, `proxy`, and
  `noproxy` stay in their source for every target. Project YAML does not expand
  these placeholders; configure them globally in trusted configuration or use
  environment variables. Existing dynamic proxy settings in YAML block migration.
  The migrator never expands and writes these values.
- pnpm v11 and confirmed stable v12 targets from 12.4.0 accept `packageConfigs`
  as package-name maps or matcher arrays, with `hoist`, `modulesDir`,
  `overrides`, `saveExact`, and `savePrefix`. Supported subproject `.npmrc`
  fields are moved there by package name. pnpm 12.0–12.3 does not support
  `packageConfigs`.
- For v12 targets from 12.4.0, migrating `packageConfigs` or subproject settings
  requires `sharedWorkspaceLockfile: false` in the merged workspace. Otherwise
  source settings remain with a warning; existing `packageConfigs` blocks
  migration until the effective lockfile mode is compatible. This restriction
  does not apply to v11. The migrator does not change this mode automatically.
- Cleanup removes only source keys represented in the final workspace after
  applying the selected merge strategy.
  Each source is checked against its own values, including deprecated-key
  replacements. Conflicting values in `.npmrc`, `package.json#pnpm`, or Yarn
  resolutions remain in their original source.
  Unrecognized, refused, incompatible, or otherwise unsupported
  `package.json#pnpm` child keys remain in `package.json`.
  INI sections in `.npmrc` are retained conservatively; their child names are
  never treated as root keys during cleanup.
- Runtime migration writes `devEngines.runtime` before removing a workspace
  runtime declaration. A failed write preserves source settings for retry.
  If an existing runtime declaration conflicts with a workspace runtime, migration
  stops before writing any files. An identical Node.js declaration is reused.
- YAML aliases remain when their anchors are unchanged and precede them.
  If replacement, removal, or sorting would invalidate an alias, its original
  value is written explicitly so unrelated settings keep their values.
- If no auth/registry lines remain after a v11 or v12 migration, the empty
  `.npmrc` is removed.
- Values moved from `auditConfig.ignoreCves` still contain CVE IDs. Replace them
  manually with the corresponding GHSA IDs after migration.
- The migrator does not update the `packageManager` version, CI environment variables,
  shell setup, or pnpm commands in scripts. When `packageManager` still pins pnpm 10,
  pass `--compatibility v11` explicitly and update the pin separately.
- Compatibility checks cover pnpm 11.27.1 and 12.6.0, retaining 11.25.0,
  11.26.0, 12.2.1, 12.3.4, 12.4.0, 12.4.2, 12.5.0, and 12.5.1 regressions.
  As [audited on 2026-09-24](docs/research/pnpm-settings-bump-2026-09-24.md),
  npm `latest` and the highest stable release are 12.6.0; `latest-11` is 11.27.1.
  The project is pinned to 12.6.0. The removed `pnpm install --resolution-only` CLI
  flag is outside this settings migrator's scope; replace it with
  `pnpm peers check` in scripts before upgrading.

</details>

<details>
<summary>Target version migration example</summary>

For example, `--target-version 12.4.0` migrates this legacy configuration:

```json
{ "pnpm": { "pipelines": { "ci": ["build", "test"] }, "pipelineBase": "main" } }
```

into `pnpm-workspace.yaml` and removes the applied `pnpm` keys:

```yaml
pipelines:
  ci: [build, test]
pipelineBase: main
```

With `--target-version 12.3.4`, these settings remain in `package.json` with an
incompatibility warning. See the [version audit](docs/research/pnpm-recent-settings-audit-2026-09-10.md)
for the upstream release and schema references.

</details>

### `--replace-deprecated`

- **Type**: `boolean`
- **Default**: `false`

Force replacing deprecated pnpm settings with new keys and remove old keys during migration.

<details>
<summary>Deprecated setting conversion examples</summary>

Example conversions:

- `allowNonAppliedPatches` -> `allowUnusedPatches`
- `onlyBuiltDependencies` / `ignoredBuiltDependencies` / `neverBuiltDependencies` -> `allowBuilds`
- `auditLevel` / `auditConfig` -> `audit`
- `updateConfig` -> `update`
- `cleanupUnusedCatalogs` -> `catalogPrune`
- `enableGlobalVirtualStore` -> `virtualStoreType`
- `sideEffectsCacheReadonly` / `remoteSideEffectsCache` -> structured
  `sideEffectsCache`
- non-conflicting `namedRegistries` aliases -> URL-keyed `registries`

</details>

### `--strategy`

- **Type**: `'discard' | 'merge' | 'overwrite'`
- **Default**: `'merge'`

Strategy to handle conflicts when merging settings with existing `pnpm-workspace.yaml`:

- `discard`: Keep existing values, only add new keys from incoming settings. For nested objects, merges keys from both.
- `merge`: Deep merge with array deduplication. Arrays are combined and deduplicated, objects are recursively merged, primitives keep existing values.
- `overwrite`: Use incoming values, only keep existing keys not present in incoming settings. For nested objects, merges keys from both.

`packageConfigs` matcher arrays preserve order and repeated entries because the
last matching entry wins. With `merge`, incoming matchers follow existing ones;
an overlapping end/start sequence is reused to keep repeated migrations stable.

### `--no-yarn-resolutions`

- **Type**: `boolean`
- **Default behavior**: `yarnResolutions=true` (use this flag to disable)

Disable migrating `resolutions` field in `package.json`.

<details>
<summary>Yarn selector translation and warnings</summary>

By default, plain package names are copied to pnpm overrides and global Yarn
selectors are translated: `**/foo` becomes `foo`, and `**/@scope/foo` becomes
`@scope/foo`. Path-specific selectors such as `parent/child` and
`parent/**/child` remain in `resolutions` with a warning. Conflicting selectors
that translate to the same pnpm key also remain for manual resolution.
Only individual resolutions whose values reach the final workspace are removed.

For example, an unsupported selector is now reported and retained instead of
being copied into an override that prevents pnpm from installing:

```text
WARN Kept Yarn resolution "parent/**/child" in package.json: its selector cannot be translated safely to pnpm overrides.

ℹ No changes needed.
```

</details>

### `--no-show-changes`

- **Type**: `boolean`
- **Default behavior**: `showChanges=true` (use this flag to disable)

Hide the settings diff while keeping the outcome summary and warnings. This is a
CLI display preference; library results always include settings changes.

### `--no-clean-npmrc`

- **Type**: `boolean`
- **Default behavior**: `cleanNpmrc=true` (use this flag to disable)

Disable removing pnpm settings in `.npmrc` file.

### `--no-clean-package-json`

- **Type**: `boolean`
- **Default behavior**: `cleanPackageJson=true` (use this flag to disable)

Disable removing migrated child keys from the `pnpm` field in `package.json`.

### `--no-newline-between`

- **Type**: `boolean`
- **Default behavior**: `newlineBetween=true` (use this flag to disable)

Disable adding newlines between each root keys.

## Merge Strategy Examples

This document demonstrates how different merge strategies work when migrating pnpm settings.

<details>
<summary>Compare merge strategies with configuration examples</summary>

### Scenario

Existing `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*

overrides:
  foo: 1.0.0
```

Settings from `package.json`:

```json
{
  "pnpm": {
    "packages": ["apps/*"],
    "overrides": {
      "bar": "2.0.0"
    }
  }
}
```

### Strategy: `discard` (Keep Existing)

```bash
pnpm dlx pnpm-settings-migrator --strategy discard
```

**Result:**

```yaml
packages:
  - packages/* # Kept existing array value

overrides:
  foo: 1.0.0 # Kept existing key
  bar: 2.0.0 # Added new key from package.json
```

Use this when you want to preserve your existing configuration and only add new settings.

### Strategy: `merge` (Smart Merge - Default)

```bash
pnpm dlx pnpm-settings-migrator --strategy merge
```

**Result:**

```yaml
packages:
  - packages/* # From existing
  - apps/* # From package.json (deduplicated)

overrides:
  foo: 1.0.0 # From existing
  bar: 2.0.0 # From package.json
```

Use this for intelligent merging that combines arrays and deeply merges objects.

### Strategy: `overwrite` (Use Incoming)

```bash
pnpm dlx pnpm-settings-migrator --strategy overwrite
```

**Result:**

```yaml
packages:
  - apps/* # Replaced with incoming array value

overrides:
  foo: 1.0.0 # Kept existing key (not in incoming)
  bar: 2.0.0 # Added new key from package.json
```

Use this when you want to prioritize settings from `package.json` and `.npmrc`.

### Advanced Example

Existing `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - common

overrides:
  react: 18.0.0

peerDependencyRules:
  ignoreMissing:
    - react-dom
```

Settings from `package.json`:

```json
{
  "pnpm": {
    "packages": ["apps/*", "common"],
    "overrides": {
      "vue": "3.0.0"
    },
    "peerDependencyRules": {
      "ignoreMissing": ["vue-router"]
    }
  }
}
```

#### With `--strategy merge`:

```yaml
packages:
  - packages/*
  - common # Deduplicated
  - apps/*

overrides:
  react: 18.0.0
  vue: 3.0.0

peerDependencyRules:
  ignoreMissing:
    - react-dom
    - vue-router # Arrays merged and deduplicated
```

</details>

## Context

- [Moving settings to pnpm-workspace.yaml](https://github.com/orgs/pnpm/discussions/9037)

## License

[MIT](./LICENSE) License © 2025-PRESENT [ntnyq](https://github.com/ntnyq)
