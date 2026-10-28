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

## CLI Options

### `--cwd`

- **Type**: `string`
- **Default**: `process.cwd()`

Current working directory.

### `--sort-keys`

- **Type**: `boolean`
- **Default**: `false`

Sort keys in written workspace and local include YAML documents.

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

`forceIgnoresPlatform` requires pnpm 11.28.0+ or 12.7.0+. pnpm's defaults differ
between those majors; the migrator only moves explicit values. For v12,
`publishWaitTimeout` and `reporter` require 12.7.0+. The timeout is a nonnegative
safe integer in milliseconds (zero disables waiting); numeric `.npmrc` values
are converted to YAML numbers. Reporter values are `default`, `append-only`,
`ndjson`, and `silent`, or preserved environment placeholders.

From 11.28.0 / 12.7.0, dynamic `userAgent` values remain in their sources because
pnpm ignores project values containing environment placeholders. From 11.28.1,
invalid `patchedDependencies` maps and non-array `packages` values are retained
with diagnostics. From 12.8.2, `globalShims` belongs in trusted global
configuration and is retained with an incompatibility warning. Existing
workspaces containing these incompatible values fail validation before writes.

From 11.28.3, non-null `allowBuilds` values must be maps of booleans or strings.
From 11.28.4, non-null `allowUnusedPatches` must be boolean, and non-null
`ignoredOptionalDependencies` / `requiredScripts` must be string arrays.
From 11.28.5, `httpProxy` and `httpsProxy` must be strings, including when empty;
null is incompatible in 11.28.5. From 11.28.6, null is accepted again and leaves
the proxy unset. Invalid values remain in their sources with diagnostics.

For pnpm 12.9.0 and later stable v12 releases, URL-keyed `registries` entries
can set `networkConcurrency` to a positive safe integer, or null to leave it
unset. On older or unconfirmed targets, the entire registry setting stays in
its source when it contains this field.

For pnpm 12.10.0 and later stable v12 releases, `nodeLinker` additionally accepts
`loaded` or `{ type: 'loaded', excluded: ['package-name'] }`, and `lockfile`
accepts `{ includeResolutionSettings: true }` to record resolution settings in
the lockfile. Existing linker strings and boolean `lockfile` values still work.
`failIfNoMatch` also requires 12.10.0 for v12 targets, when pnpm first consumes
it from workspace configuration. Unsupported or invalid nested settings stay
intact in their source; the migrator does not add pnpm's defaults.

For pnpm 12.11.0 and later stable v12 releases, `permissions` maps dependency
names or package IDs to `build` and `skills` decisions. Boolean `build`
decisions override matching `allowBuilds` entries; strings are undecided prompts
and null leaves a capability unset. Both settings are preserved for pnpm to
apply its precedence. Unknown capabilities or invalid nested values keep the
entire source object intact.

`skills.dirs` accepts an array of workspace-relative agent skill directories;
an empty array disables linking. Workspace `provenance` also requires 12.11.0
for v12 targets and accepts boolean or null values. Its v11 support is unchanged.
For example, targeting 12.11.0 migrates
`{ "pnpm": { "permissions": { "example": { "build": false, "skills": true } }, "skills": { "dirs": [".agents/skills"] } } }`
to equivalent workspace YAML. Targeting 12.10.1 retains these settings with
diagnostics.

For pnpm 12.12.0 and later stable v12 releases, `addMissingPeerTypes` accepts
boolean or null values and `remoteCache` accepts the project organization:
`{ org: 'acme' }`. Empty and null remote-cache sections are preserved. Server,
team, signing, and publication fields belong in trusted global configuration
or environment variables. Objects containing those fields, unknown fields,
or invalid values remain intact in their source with diagnostics; existing
incompatible workspace values block migration before writes.

`remoteCache` and legacy `sideEffectsCache.remote` are kept independently so
pnpm applies its field-level precedence. The migrator does not insert defaults
or rewrite `allowBuilds`: pnpm 12.12 itself now honors explicit build denials
when `dangerouslyAllowAllBuilds` is true.

From 12.12.1, the registry prefix `tool` is reserved. Both `namedRegistries`
and URL-keyed `registries` using that exact prefix remain in their sources;
existing workspace declarations block migration. This restriction is
case-sensitive (`ToOl` remains valid), unlike the existing `pkg` restriction.

For pnpm 12.13.0 and later stable v12 releases, `nodePackageMap` accepts
`mode: off | write-only | load` and `type: standard | loose`. The section and
its fields may be null to leave them unset. New and legacy
`nodeExperimentalPackageMap` / `nodePackageMapType` values are preserved so pnpm
applies the new section's field-level precedence. `storeIndexFormat` accepts
`sqlite`, `files`, or null; `files` supports stores shared over network filesystems.
Enum values may use environment placeholders, which are preserved without expansion.
Older or unconfirmed targets retain these settings in their source.

For pnpm 12.14.0 and later stable v12 releases, `sideEffectsCache.exclude`
accepts package patterns such as `['java', '@native/*', 'example@1']`, an empty
array, or null. Excluded builds are neither restored nor saved in local or remote
caches. Cache `read` and `write` values may also use preserved environment
placeholders. On older targets, the complete cache section stays in its source.
Invalid nested values and unknown fields also preserve the complete source
section; existing incompatible workspace values block writes.

For pnpm 12.15.0 and later stable v12 releases, `bootConfig` accepts bootstrap
release-age and trust-policy settings: `minimumReleaseAge`,
`minimumReleaseAgeExclude`, `minimumReleaseAgeStrict`,
`minimumReleaseAgeIgnoreMissingTime`, `trustPolicy`, `trustPolicyExclude`, and
`trustPolicyIgnoreAfter`. The section and individual fields may be null.
Bootstrap policy stays separate from normal install policy; neither is copied
into the other. Unknown nested keys or invalid values preserve the entire section.

`maxTarballUnpackedSize` requires 11.28.7+ or 12.15.0+ and accepts a nonnegative
safe integer in bytes, or null to leave pnpm's default effective. Numeric
`.npmrc` values become YAML numbers. The migrator does not add pnpm's 4 GiB
default. From 11.28.7, v11 also accepts `autoInstallPeersFromHighestMatch`
(boolean or null) and `externalDependencies` (string array or null).

From 12.15.0, `lockfile.integrityTarget` accepts `resource`, `tar`, or null,
and npm `registries` declarations accept `serverType: pnpr` for tar registries.
Unsupported nested fields keep the complete lockfile or registry section in its
source. For example, `lockfile: { integrityTarget: tar }` migrates at 12.15.0
and remains in the source at 12.14.0.

pnpm 12.15's `include` delegates settings to local YAML files or declared
config dependencies. The migrator reads the effective workspace and writes
settings to their physical owners, preserving the include index, YAML comments,
and unchanged files. Explicit lists reserve settings even when absent;
`'*'` is allowed only for local files and owns the settings they already define.
`catalog` / `catalogs.default` refer to the default catalog, `catalogs.name`
selects one named catalog, and `catalogs` reserves every catalog.

```yaml
include:
  ./config/layout.yaml: [modulesDir, packages]
  ./config/catalogs.yaml: [catalogs.frontend]
  '@acme/policy': [minimumReleaseAge, trustPolicy]
configDependencies:
  '@acme/policy': 1.0.0
```

A legacy `modulesDir: ./node_modules` value is written as
`modulesDir: ../node_modules` in `config/layout.yaml`, keeping the same location.
Path settings, package globs, pnpmfiles, patch paths, and local catalog/override
specifiers use the owning file's directory. New settings without an owner stay
in the root. `discard`, `merge`, and `overwrite` apply inside local owners.
YAML merge keys participate in ownership checks and are expanded when removing
an inherited legacy key is necessary.

Config dependencies remain read-only. The migrator reads each installed
package's `pnpm.config` entry under `node_modules/.pnpm-config`. A source value
already represented by that policy can be cleaned; conflicting values remain
with diagnostics under every strategy. If a policy package is not installed or
its installed version differs from the proposed declaration, its delegated
source values remain until the matching version is installed and migration is
run again. Legacy workspace settings are also retained when conversion would
lose their values behind a read-only replacement. The migrator does not install
packages. Nested includes, overlapping
owners, undelegated fields, invalid entries, and paths escaping a config
dependency's package stop migration before writes. Included local files must
already exist; installed policy files cannot also be writable destinations,
including through symlinks or hard links. A merge that would define both
`catalog` and `catalogs.default` stops before writes; consolidate them into one
form first. All destinations are
validated and rendered before writing, and legacy sources are retained if any
destination write fails. Credentials and trusted global settings keep their
existing protections. Earlier or unconfirmed targets retain incoming include
indexes with diagnostics and reject existing included workspaces.

From pnpm 12.16.0, `strictSsl` and `runtime` accept booleans or null,
`localAddress` and `tag` accept strings or null, and `requiredScripts` accepts
string arrays or null. These settings remain in their sources for earlier or
unconfirmed v12 targets. `runtime: false` disables installing declared runtimes;
`tag: next` selects that distribution tag when adding a package without a version.
Invalid IP address strings stay unchanged because pnpm treats them as unset.
String placeholders are preserved without expansion. Invalid types keep the
complete setting in its source. For example, `required-scripts[]=build` becomes
`requiredScripts: [build]` at 12.16.0 and stays in `.npmrc` at 12.15.0.

From pnpm 11.28.9, v11 registry declarations also accept `serverType: pnpr`.
Earlier or unconfirmed v11 targets retain the complete registry map. The setting
does not enable v12-only registry fields such as `networkConcurrency` or `ecosystem`.

pnpm 12.16 no longer consumes `scriptsPrependNodePath`, so the migrator keeps
incoming values in their sources and rejects existing workspace values before
writes. Project `ci` values and the global-only `symlinkedLockfileTargetDirs`
also stay in their sources. Configure the latter in trusted global configuration
or through `PNPM_CONFIG_SYMLINKED_LOCKFILE_TARGET_DIRS`.

pnpm v12 reads `filter` and `filterProd` from CLI arguments or `updateConfig`
hooks, not workspace YAML. These settings remain in their source with
diagnostics for v12 targets; existing YAML containing them blocks migration.
The 12.11.2 hook fix does not add workspace support.

Other legacy fields ignored by the v12 workspace reader also stay in their
sources with diagnostics. These include `production`, `dev`, `recursive`,
`lockfileOnly`, `force`, `depth`, `saveDev`, `fetchingConcurrency`,
`requiredScripts`, `extraBinPaths`, `extraEnv`, and `workspacePackagePatterns`.
Existing YAML containing ignored fields blocks migration before writes.
For example, `production=true` cannot be moved into v12 YAML; use
`pnpm install --prod` to select production dependencies.

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
  to the same registry after the target pnpm version's URL normalization. From
  12.11.1, the exact HTTPS and protocol-relative npm `.com` registry roots are
  equivalent to `.org`; earlier or unconfirmed v12 targets compare them literally.
  Routing conflicts introduced by merging or deprecated-setting conversion stop
  migration before any destination writes
  or source cleanup, including when registries belong to an included YAML file.
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
- For v11 targets and v12 targets from 12.4.0, migrating `packageConfigs` or
  subproject settings requires `sharedWorkspaceLockfile: false` in the merged
  workspace. Otherwise source settings remain with a warning; existing
  `packageConfigs` blocks migration until the effective lockfile mode is
  compatible. The migrator does not change this mode automatically.
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
- Compatibility checks cover pnpm 11.28.9 and 12.16.1, including 11.28.0,
  11.28.1, 11.28.2, 11.28.3, 11.28.4, 11.28.5, 11.28.6, 12.7.0, 12.8.0,
  12.8.1, 12.8.2, 12.9.0, 12.9.1, 12.10.0, 12.10.1, 12.11.0, 12.11.1,
  12.11.2, 12.12.0, 12.12.1, 12.13.0, 12.14.0, 11.28.7, 11.28.8,
  12.15.0, and 12.16.0.
  Earlier regressions remain at 11.25.0,
  11.26.0, 11.27.1, 12.2.1, 12.3.4, 12.4.0, 12.4.2, 12.5.0, 12.5.1, and 12.6.0.
  As [audited on 2026-10-29](docs/research/pnpm-settings-bump-2026-10-29.md),
  npm `latest` and the highest confirmed stable release are 12.16.1, also on
  `latest-12` and `next-12`. The highest stable v11 release, 11.28.9, is on
  `latest-11` and `next-11`. GitHub marks both targets as non-prereleases.
  The project is pinned to 12.16.1. These checks verify the
  documented fixtures, not every setting in every release. Local and config
  dependency `include` consumption is verified on 12.15.0, with 12.14.0 as the
  preceding boundary. v10 has unit regressions and source review
  through 10.34.9; real v10 consumption remains unverified. The 12.16 fixtures
  verify TLS certificate handling against a temporary HTTPS registry, dist-tag
  selection, runtime suppression, required script enforcement, and frozen
  installs. They use OpenSSL to create a disposable certificate.
  Routing fixtures at 11.28.8, 11.28.9, 12.9.0, 12.10.0, 12.11.0, 12.11.1,
  12.11.2, 12.15.0, and 12.16.1 verify prefix/scope conflicts, mixed registry
  representations after conversion, and rejection before writes under all three
  strategies. They compare native URL normalization across the 12.11.1 boundary.
  The removed `pnpm install --resolution-only` CLI flag is outside this settings
  migrator's scope; replace it with `pnpm peers check` in scripts before upgrading.

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

For v10, replacing legacy build permissions with `allowBuilds` requires a
confirmed stable target of 10.26.0 or later. Older or unconfirmed targets keep
the legacy setting names and report a warning. Canonical `update` sections
and registry prefixes take precedence over their deprecated aliases, including
when they come from different configuration sources.

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
