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
URL credentials are hidden in diffs, warnings, and errors. Parser diagnostics
keep available locations but omit configuration source excerpts. For example,
`https://user:p@ssword@proxy.example/` is displayed as
`https://***@proxy.example/`; the stored setting is preserved.

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
contains `settingsChanges` (before/after effective workspace settings, including includes), `changedFiles`
(absolute paths, including created or removed files), `sourceSettingsCleaned`,
`packageJsonRuntimeChanged`, `hasConfigurationFiles`, and `warnings`. Errors are
thrown to the caller. Consumers that relied on console output should render the
returned changes and warnings themselves.

</details>

## Version field differences

See the [version notes](docs/versions/README.md) for field changes grouped by
[v10](docs/versions/README.md#v10),
[v11](docs/versions/README.md#v11), and
[v12](docs/versions/README.md#v12). Each minor file records differences
from the preceding minor, including exact patch boundaries and migration effects.

## CLI Options

### `--cwd`

- **Type**: `string`
- **Default**: `process.cwd()`

Current working directory.

### `--sort-keys`

- **Type**: `boolean`
- **Default**: `false`

Sort keys in written workspace and local include YAML documents. Override maps
with potentially overlapping selectors keep their declaration order so the same
dependency wins when two selectors are equally specific.

### `--compatibility`

- **Type**: `'auto' | 'v10' | 'v11' | 'v12'`
- **Default**: `'auto'`

Compatibility major for migrated settings:

- `auto`: infer from `targetVersion`, `packageManager`, or
  `devEngines.packageManager` (`pnpm@12+` => `v12`, `pnpm@11` => `v11`,
  otherwise `v10`).
- `v10`: keep legacy settings and migrate schema-aligned pnpm config keys from `.npmrc`.
- `v11`: normalize legacy settings to the v11 schema.
- `v12`: use the v12 schema and enable fields according to the confirmed target version.

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
- Invalid registry locations, including relative paths and object property names
  such as `__proto__`, remain in their sources with diagnostics. Registry
  conversion never uses inherited object properties as declarations.
- Registry maps are validated as a whole, including declarations without
  versioned fields. An invalid sibling
  declaration keeps every registry in its source under all merge strategies;
  existing incompatible maps block migration before any writes.
- A URL key must name a declaration object. String values are accepted only in
  the legacy scope map representation, whose keys cannot look like URLs.
  Invalid registry settings remain intact in `package.json` and `.npmrc`, while
  unrelated valid settings can still migrate and be cleaned from their sources.
- Legacy `<scope>: <url>` routes and URL-keyed declarations cannot be mixed,
  including when `replaceDeprecated` introduces the mixture. The structure is
  checked independently of versioned registry fields.
- Registry prefixes must be unique. A scope may be repeated only when it routes
  to the same registry after the target pnpm version's URL normalization.
  See the [registry normalization boundary](docs/versions/v12/12.11.md).
  Routing conflicts introduced by merging or deprecated-setting conversion stop
  migration before any destination writes
  or source cleanup, including when registries belong to an included YAML file.
- Dynamic `${...}` values in `httpProxy`, `httpsProxy`, `noProxy`, `proxy`, and
  `noproxy` stay in their source for every target. Project YAML does not expand
  these placeholders; configure them globally in trusted configuration or use
  environment variables. Existing dynamic proxy settings in YAML block migration.
  The migrator never expands and writes these values.
- Supported subproject settings can migrate to `packageConfigs` when the target
  version and effective lockfile mode allow it. See the
  [v11 baseline](docs/versions/v11/11.0.md) and [v12 support boundary](docs/versions/v12/12.4.md).
- Cleanup removes only source keys represented in the final workspace after
  applying the selected merge strategy.
  Each source is checked against its own values, including deprecated-key
  replacements. Conflicting values in `.npmrc`, `package.json#pnpm`, or Yarn
  resolutions remain in their original source.
  Unrecognized, refused, incompatible, or otherwise unsupported
  `package.json#pnpm` child keys remain in `package.json`.
  INI sections in `.npmrc` are retained conservatively; their child names are
  never treated as root keys during cleanup.
  Bare boolean flags such as `save-exact` and quoted keys such as
  `"save-exact"=true` are cleaned when migrated. Retained sections alone do not
  cause repeated cleanup reports or rewrites.
- Runtime migration writes `devEngines.runtime` before removing a workspace
  runtime declaration. A failed write preserves source settings for retry.
  If an existing runtime declaration conflicts with a workspace runtime, migration
  stops before writing any files. An identical Node.js declaration is reused.
- An `executionEnv` object containing fields besides `nodeVersion` remains
  intact in its source with a warning. Existing workspace declarations with
  such fields block migration before writes, so unmigrated values cannot be lost.
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
- See the [version notes](docs/versions/README.md) for field differences and
  historical verification coverage.

</details>

### `--replace-deprecated`

- **Type**: `boolean`
- **Default**: `false`

Force replacing deprecated pnpm settings with new keys and remove old keys during migration.

See the [version notes](docs/versions/README.md) for target-specific conversion
requirements. Canonical `update` sections and registry prefixes take precedence
over their deprecated aliases, including when they come from different sources.

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
For v11 targets, `filter` and `filterProd` use the same ordered merging: a repeated inclusion can
restore projects removed by an earlier exclusion. Cleanup verifies the combined
selector sequence. If package cleanup is disabled, later `.npmrc` selectors are
retained when needed to keep repeated migrations stable.

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
If an invalid pnpm override map stays in the source, a Yarn resolution for the
same explicit selector stays there as well.
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
