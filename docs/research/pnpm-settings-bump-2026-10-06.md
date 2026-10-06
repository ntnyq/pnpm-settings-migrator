# pnpm compatibility update — 2026-10-06

## Query and targets

Fetched the full npm packument at **2026-10-06 15:51:34 Asia/Shanghai
(07:51:34 UTC)**, with an independent check at 15:51:55 Asia/Shanghai.
Read `dist-tags`, `versions`, and `time`, and sorted stable SemVer components
numerically. The GitHub 100-release page spans v12.10.0 through v11.5.2 and
covers the complete interval after all three baselines; no pagination was needed.

| Major | Highest published SemVer without prerelease | `latest-*` | `next-*` | npm publication (UTC) |
| ----- | ------------------------------------------- | ---------- | -------- | --------------------- |
| 10    | 10.34.6                                     | 10.34.6    | 10.34.6  | 2026-09-28 19:46:40   |
| 11    | 11.28.5                                     | 11.28.2    | 11.28.5  | 2026-10-06 05:23:58   |
| 12    | 12.10.0                                     | 12.9.1     | 12.10.0  | 2026-10-06 05:24:13   |

The default installation tag `latest` is **12.9.1**. The highest confirmed
stable release is **12.10.0**, currently on `next-12`; the v11 target is
**11.28.5**, on `next-11`. GitHub marks both `prerelease: false`, `draft: false`,
so their channel labels do not exclude them from stable compatibility targets.
No new pnpm prerelease follows the baselines. Historical v12 RCs and separate
pnpr alpha releases are not new stable targets.

Sources: [npm metadata](https://registry.npmjs.org/pnpm),
[GitHub release API](https://api.github.com/repos/pnpm/pnpm/releases?per_page=100).

## Baselines

Confirmed package identity: `pnpm-settings-migrator`. The initial working tree
was clean. The development pin changes from **12.8.1 to 12.9.1**, following
`latest`. Regenerated the lockfile with the user-managed pnpm; only the pinned
pnpm and its native executable package records changed. No application
dependencies were upgraded, and the migrator still does not rewrite user pins.

Node requirements remain `^22.19.0 || >=24.11.0`; CI covers 22.19.0, 24.11.0,
and 26.x. This run uses Node **24.21.0**. Registry requirements are `>=22.13`
for pnpm 11.28.5 and `>=18.*` for the pnpm 12.9.1/12.10.0 wrapper packages;
the development environment and existing CI meet these requirements.

| Major | Implemented before                           | Verified before                                                     | Implemented / verified after                                                                                          |
| ----- | -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| v10   | Legacy schema, source review through 10.34.6 | Unit regressions; no recorded real v10 run                          | Unchanged; no newer v10 release; unit regressions pass, real v10 unverified                                           |
| v11   | Schema and value boundaries through 11.28.2  | September 30 audit records successful real fixtures through 11.28.2 | Adds exact .3/.4/.5 validation boundaries; real fixtures pass through 11.28.5                                         |
| v12   | Schema and value boundaries through 12.8.2   | September 30 audit records successful real fixtures through 12.8.2  | Adds 12.9 registry limit, 12.10 linker/lockfile shapes and failIfNoMatch boundary; real fixtures pass through 12.10.0 |

Evidence: `package.json`, `.github/workflows/ci.yml`, capability constants,
target resolution, value validators, regression tests, compatibility scripts,
and the [September 30 audit](pnpm-settings-bump-2026-09-30.md). Capability minima
mark introduction dates, not upper support limits. A test matrix entry alone
does not establish a passed check; executed results are recorded below.

## Release and exact-tag source review

Read all six intervening release notes and compared configuration source at
11.28.2, 11.28.3, 11.28.4, 11.28.5, 12.8.2, 12.9.0, 12.9.1, and 12.10.0.
Reviewed typed schemas and nested shapes, known/refused settings, loading,
scope, defaults, precedence, environment handling, and upstream tests.

| Release                                                       | GitHub publication (UTC) | Result                                                                   |
| ------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| [11.28.3](https://github.com/pnpm/pnpm/releases/tag/v11.28.3) | September 30 15:28:07    | Validates allowBuilds; prototype-name and configuration helper fixes     |
| [11.28.4](https://github.com/pnpm/pnpm/releases/tag/v11.28.4) | October 3 20:48:54       | Validates patch flag and two string-array settings                       |
| [11.28.5](https://github.com/pnpm/pnpm/releases/tag/v11.28.5) | October 6 05:27:13       | Validates proxy strings; global config reporting and dlx mirror behavior |
| [12.9.0](https://github.com/pnpm/pnpm/releases/tag/v12.9.0)   | October 2 22:28:05       | Per-registry networkConcurrency; no new top-level field                  |
| [12.9.1](https://github.com/pnpm/pnpm/releases/tag/v12.9.1)   | October 3 20:48:42       | Configuration crate differs only in PNPM_VERSION; no new rule            |
| [12.10.0](https://github.com/pnpm/pnpm/releases/tag/v12.10.0) | October 6 05:24:45       | Loaded linker, lockfile resolution settings, workspace failIfNoMatch     |

| Difference                                                                                    | Classification                              | Migration decision                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11.28.3 allowBuilds                                                                           | Implementation needed                       | Non-null values must be non-array maps of booleans or strings; preserve the whole invalid map. Empty strings and null match upstream acceptance.           |
| 11.28.4 allowUnusedPatches                                                                    | Implementation needed                       | Require boolean when non-null; also check the legacy allowNonAppliedPatches alias before conversion.                                                       |
| 11.28.4 ignoredOptionalDependencies / requiredScripts                                         | Implementation needed                       | Require string arrays when non-null. Existing scalar npmrc list normalization remains valid.                                                               |
| 11.28.5 httpProxy / httpsProxy                                                                | Implementation needed                       | Require strings when present; null is invalid, empty strings valid. Existing dynamic proxy protections remain.                                             |
| 12.9 registries networkConcurrency                                                            | Implementation needed                       | Require positive safe integer or null; preserve the entire registries object for unsupported versions or invalid values.                                   |
| 12.10 nodeLinker                                                                              | Implementation needed                       | Accept loaded string or strict object with type: loaded and optional string-array excluded. Reject unknown fields and null excluded without dropping them. |
| 12.10 lockfile                                                                                | Implementation needed                       | Preserve existing booleans; accept strict object with optional boolean/null includeResolutionSettings. Empty objects are valid.                            |
| 12.10 failIfNoMatch                                                                           | Existing allowlist too broad                | Gate v12 workspace consumption at 12.10.0, retaining v11 behavior. Known-settings metadata alone did not prove earlier consumption.                        |
| Loaded linker defaults                                                                        | Already covered by explicit-value migration | Do not emit global store or modules directory defaults.                                                                                                    |
| CLI/environment precedence and global config listing                                          | Outside source migration                    | Preserve existing merge/discard/overwrite semantics.                                                                                                       |
| dlx release mirrors                                                                           | Existing behavior preserved                 | Keep explicit nodeDownloadMirrors; pnpm chooses its signed release channel at runtime.                                                                     |
| Registry credentials/redaction and request destinations                                       | Existing protections preserved              | Keep credential, dynamic URL/proxy, and machine-only settings in their source.                                                                             |
| Archive/security, install/frozen-lockfile, store, self-update, scripts, and performance fixes | Outside migration scope                     | Source-reviewed; no speculative configuration conversions.                                                                                                 |

No settings were newly renamed or removed, and no refused-field classification
needed changing. No unresolved discrepancy between release notes and exact-tag
configuration source was found.

Exact source references:

- [11.28.3 allowBuilds validation](https://github.com/pnpm/pnpm/blob/v11.28.3/pnpm11/config/reader/src/getOptionsFromRootManifest.ts)
- [11.28.4 value assertions](https://github.com/pnpm/pnpm/blob/v11.28.4/pnpm11/config/reader/src/settingAssertions.ts)
- [11.28.4 settings reader](https://github.com/pnpm/pnpm/blob/v11.28.4/pnpm11/config/reader/src/getOptionsFromRootManifest.ts)
- [11.28.5 proxy checks](https://github.com/pnpm/pnpm/blob/v11.28.5/pnpm11/config/reader/src/getOptionsFromRootManifest.ts)
- [12.9 registry schema](https://github.com/pnpm/pnpm/blob/v12.9.0/pnpm/crates/config/src/workspace_yaml/registries.rs)
- [12.9 registry limit tests](https://github.com/pnpm/pnpm/blob/v12.9.0/pnpm/crates/config/src/workspace_yaml/tests/registry_network_concurrency.rs)
- [12.10 node linker schema](https://github.com/pnpm/pnpm/blob/v12.10.0/pnpm/crates/config/src/node_linker.rs)
- [12.10 lockfile shape](https://github.com/pnpm/pnpm/blob/v12.10.0/pnpm/crates/config/src/workspace_yaml/sections.rs)
- [12.10 workspace fields](https://github.com/pnpm/pnpm/blob/v12.10.0/pnpm/crates/config/src/workspace_yaml/settings.rs)
- [12.10 setting application](https://github.com/pnpm/pnpm/blob/v12.10.0/pnpm/crates/config/src/workspace_yaml/apply.rs)

## Implementation

Updated capability constants, the v12 allowlist, public v12 types and explicit
exports, and versioned value validation. Added a dedicated v12 shape validator.
Regression tests cover exact first/preceding releases, unknown/imprecise targets,
invalid nested values, source cleanup, existing workspaces, and merge strategies.
The real-pnpm runner and CI retain earlier regressions and add all six releases.

Implementation files: `src/constants/pnpm-capabilities.ts`,
`src/constants/pnpm-v12.ts`, `src/features/settings/versioned-values.ts`,
`src/features/settings/pnpm-v12-values.ts`, `src/types/pnpm-v12.ts`,
`src/types/workspace.ts`, and `src/index.ts`. Tests live in
`tests/migration/compatibility/pnpm-11.28-validation.test.ts`,
`pnpm-12.9.test.ts`, and `pnpm-12.10.test.ts`. Real-release fixtures are in
`scripts/verify-pnpm-config-shapes.ts` and
`scripts/verify-pnpm-registry-concurrency.ts`, called by
`scripts/verify-pnpm-compatibility.ts`. Updated README, CI, development pin,
and lockfile alongside these changes.

For a confirmed 12.10.0 target, this legacy manifest field:

```json
{
  "pnpm": {
    "nodeLinker": { "type": "loaded", "excluded": ["native-addon"] },
    "lockfile": { "includeResolutionSettings": true },
    "failIfNoMatch": true
  }
}
```

migrates to:

```yaml
nodeLinker:
  type: loaded
  excluded: [native-addon]
lockfile:
  includeResolutionSettings: true
failIfNoMatch: true
```

On 12.9.1, those three settings stay intact in their source with diagnostics.

## Verification

Commands use the user-managed launcher, preserving the active Node and PATH:

```sh
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm --version
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm install --lockfile-only --ignore-scripts
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm install --frozen-lockfile --ignore-scripts
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run release:check
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run build
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run test:compatibility
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run test:compatibility -- 12.9.0 12.9.1 12.10.0
```

- User-managed pnpm reports **12.9.1**; lockfile generation and frozen dependency
  installation passed without unrelated dependency changes.
- All **23** releases in the default real-pnpm matrix passed: **11.25.0,
  11.26.0, 11.27.1, 11.28.0, 11.28.1, 11.28.2, 11.28.3, 11.28.4, 11.28.5,
  12.2.1, 12.3.4, 12.4.0, 12.4.2, 12.5.0, 12.5.1, 12.6.0, 12.7.0,
  12.8.0, 12.8.1, 12.8.2, 12.9.0, 12.9.1, 12.10.0**.
- Every release ran base migration, source retention, `config list --json`,
  install, and frozen-install checks. Earlier conditional pipeline, ecosystem,
  packageConfigs, autoDedupe, saveTypes, task, force/platform, reporter, and
  globalShims fixtures remain active where supported.
- New v11 fixtures verify source retention and pnpm's own config rejection at
  each .3/.4/.5 validation boundary, with actual preceding releases.
- New v12 fixtures verify registry config reading without unknown-setting
  warnings plus install/frozen install; unsupported values stay in their source
  on 12.8.2. The loaded linker runs both loaded and excluded dependencies.
  Resolution settings are recorded in the lockfile; unchanged frozen installs
  preserve it, and changing autoDedupe causes a frozen-install rejection.
  An unmatched filter fails with failIfNoMatch and succeeds with its CLI override.
  12.9.1 rejects the new linker/lockfile objects as the preceding release.

- The strengthened loopback registry fixture passed subsequent runs on
  **12.9.0, 12.9.1, and 12.10.0**. With global concurrency four, migrated
  per-registry caps one and two produced exactly one and two concurrent
  metadata requests respectively. Each frozen lockfile-only rerun preserved
  the lockfile and made no additional metadata requests.
- Initial development checks caught a missing public failIfNoMatch type, audit
  formatting, and a fixture error-message regex that expected an error code
  absent from pnpm's default reporter. These were corrected and reverified.

- Final `release:check` passed: lint, formatting, strict TypeScript, and
  **664 tests in 32 files**. Final build passed for the library, CLI, and public
  declarations. tsdown emitted its existing experimental TypeScript 7 API
  warning. No unresolved check failure remains.

Limits: real v10 consumption remains unverified; its unchanged 10.34.6 schema
has unit regressions and source review. Tests cover the documented fixtures,
not every setting or all upstream runtime fixes. The typed union and unknown
field checks added here focus on settings changed by these releases; other
existing schema validation is not claimed to be exhaustive. No CI job was
dispatched: local checks ran on macOS/Node 24.21.0; the saved CI matrix covers
additional environments. No commit, push, PR, or publication was performed.
