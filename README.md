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

## CLI Options

### `--cwd`

- **Type**: `string`
- **Default**: `process.cwd()`

Current working directory.

### `--sort-keys`

- **Type**: `boolean`
- **Default**: `false`

Sort keys when write `pnpm-workspace.yaml`.

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
