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

After migration, the CLI reports how many root settings changed and shows a
GitHub-style YAML diff. Removed lines are red and added lines are green:

```text
ℹ 2 settings changed
  packages:
    - packages/*
+   - apps/*

  overrides:
    foo: 1.0.0
+   bar: 2.0.0
```

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

Compatibility target for migrated settings:

- `auto`: infer from `packageManager` or `devEngines.packageManager`
  (`pnpm@12+` => `v12`, `pnpm@11` => `v11`, otherwise `v10`)
- `v10`: keep legacy settings as-is and migrate schema-aligned pnpm config keys from `.npmrc`
- `v11`: normalize to v11-compatible settings (`allowBuilds`, `allowUnusedPatches`, etc.)
  and migrate all non auth/registry `.npmrc` entries to `pnpm-workspace.yaml`
- `v12`: use the same settings-key migration as `v11`. Lockfile migration and
  validation are outside this tool's scope.

In `v11` and `v12` modes, normalization is applied both to settings read from
legacy files and to deprecated settings already present in
`pnpm-workspace.yaml`.

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

Notes:

- `.npmrc` migration is aligned with pnpm workspace config fields such as `node-linker`,
  hoist settings, lockfile settings, store settings, proxy settings, and other pnpm
  runtime/install options.
- Workspace manifest-only fields such as `packages`, `catalog`, and `catalogs` are not
  migrated from `.npmrc`.
- In `v11` and `v12`, auth/registry-related keys still stay in `.npmrc`.
- If no auth/registry lines remain after a v11 or v12 migration, the empty
  `.npmrc` is removed.
- Values moved from `auditConfig.ignoreCves` still contain CVE IDs. Replace them
  manually with the corresponding GHSA IDs after migration.
- The migrator does not update the `packageManager` version, CI environment variables,
  shell setup, or pnpm commands in scripts. When `packageManager` still pins pnpm 10,
  pass `--compatibility v11` explicitly and update the pin separately.
- pnpm 12 is currently a release candidate. Its removed
  `pnpm install --resolution-only` CLI flag is outside this settings migrator's
  scope; replace it with `pnpm peers check` in scripts before upgrading.

### `--replace-deprecated`

- **Type**: `boolean`
- **Default**: `false`

Force replacing deprecated pnpm settings with new keys and remove old keys during migration.

Example conversions:

- `allowNonAppliedPatches` -> `allowUnusedPatches`
- `onlyBuiltDependencies` / `ignoredBuiltDependencies` / `neverBuiltDependencies` -> `allowBuilds`

### `--strategy`

- **Type**: `'discard' | 'merge' | 'overwrite'`
- **Default**: `'merge'`

Strategy to handle conflicts when merging settings with existing `pnpm-workspace.yaml`:

- `discard`: Keep existing values, only add new keys from incoming settings. For nested objects, merges keys from both.
- `merge`: Deep merge with array deduplication. Arrays are combined and deduplicated, objects are recursively merged, primitives keep existing values.
- `overwrite`: Use incoming values, only keep existing keys not present in incoming settings. For nested objects, merges keys from both.

### `--no-yarn-resolutions`

- **Type**: `boolean`
- **Default behavior**: `yarnResolutions=true` (use this flag to disable)

Disable migrating `resolutions` field in `package.json`.

### `--no-show-changes`

- **Type**: `boolean`
- **Default behavior**: `showChanges=true` (use this flag to disable)

Disable showing the settings diff after migration. Library consumers can set
`showChanges: false`.

### `--no-clean-npmrc`

- **Type**: `boolean`
- **Default behavior**: `cleanNpmrc=true` (use this flag to disable)

Disable removing pnpm settings in `.npmrc` file.

### `--no-clean-package-json`

- **Type**: `boolean`
- **Default behavior**: `cleanPackageJson=true` (use this flag to disable)

Disable removing `pnpm` field in `package.json`.

### `--no-newline-between`

- **Type**: `boolean`
- **Default behavior**: `newlineBetween=true` (use this flag to disable)

Disable adding newlines between each root keys.

## Merge Strategy Examples

This document demonstrates how different merge strategies work when migrating pnpm settings.

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

## Context

- [Moving settings to pnpm-workspace.yaml](https://github.com/orgs/pnpm/discussions/9037)

## License

[MIT](./LICENSE) License © 2025-PRESENT [ntnyq](https://github.com/ntnyq)
