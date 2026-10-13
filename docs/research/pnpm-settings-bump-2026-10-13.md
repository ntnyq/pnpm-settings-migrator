# pnpm compatibility update — 2026-10-13

## Query and release channels

Fetched fresh npm metadata and GitHub release data during this run. The final
registry query was **2026-10-13 12:42:33 Asia/Shanghai (04:42:33 UTC)** and
confirmed the same channels as the initial query. Read `dist-tags`, `versions`,
and `time`; sorted numeric SemVer components, independently of publication time.
The 100-release GitHub page spans v12.12.1 through v11.9.0 and contains all
releases after the supported-major baselines, so no pagination was necessary.

| Major | Highest version without prerelease suffix | `latest-*` | `next-*` | npm publication of highest (UTC) |
| ----- | ----------------------------------------- | ---------- | -------- | -------------------------------- |
| 10    | 10.34.7                                   | 10.34.6    | 10.34.7  | October 12, 06:05:15             |
| 11    | 11.28.5                                   | 11.28.2    | 11.28.5  | October 6, 05:23:58              |
| 12    | 12.12.1                                   | 12.11.2    | 12.12.1  | October 11, 11:28:23             |

The default installation tag `latest` is **12.11.2**, published October 9 at
17:35:58 UTC. The highest confirmed stable release is **12.12.1**, on
`next-12`. GitHub marks all three major targets and the intervening 12.12.0
release `prerelease: false`, `draft: false`. The `next-*` channel labels are
retained here even though these versions have stable SemVer and GitHub status.
No new prerelease-suffixed version was published after the October 10 audit.

Sources: [npm metadata](https://registry.npmjs.org/pnpm),
[official releases API](https://api.github.com/repos/pnpm/pnpm/releases?per_page=100).

## Repository and baselines

Confirmed `package.json#name` is `pnpm-settings-migrator` and the initial working
tree was clean. The development pin changes from **12.10.1 to 12.11.2**, following
`latest`. The user-managed executable was already 12.11.2 and initially warned
about the older project pin. All subsequent package operations used the matching
user-managed pnpm, with its executable directory prepended to the existing PATH
and the active Node version preserved.

The package engine requirement stays `^22.19.0 || >=24.11.0`, and normal CI stays
on 22.19.0, 24.11.0, and 26.x. The pnpm npm wrapper declares `node: >=18.*`;
compatibility CI already uses 24.18.0 for the loaded linker introduced earlier.
Local checks used Node **24.21.0** on macOS. The lockfile changes only pnpm's
package-manager dependency and platform executable records. No application or
library dependency upgrade, including `@pnpm/types`, was needed.

| Major | Implemented before                                            | Verified before                                                   | Result of this run                                                                               |
| ----- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| v10   | Legacy schema; source reviewed through 10.34.6                | Unit regressions; real v10 consumption unverified                 | Source review extends to 10.34.7; no new migration rules; real consumption remains unverified    |
| v11   | Schema and exact validation boundaries through 11.28.5        | October 10 audit records successful real fixtures through 11.28.5 | Unchanged implementation; existing real fixtures rechecked                                       |
| v12   | Capabilities through 12.11.0 and patch review through 12.11.2 | October 10 audit records successful real fixtures through 12.11.2 | Adds 12.12.0 fields and 12.12.1 registry boundary; real fixture coverage extends through 12.12.1 |

Baseline evidence: `package.json`, `.github/workflows/ci.yml`,
`src/constants/pnpm-v*.ts`, `pnpm-capabilities.ts`, target/version resolution,
settings validators, tests, compatibility scripts, and the
[October 10 audit](pnpm-settings-bump-2026-10-10.md). Historical test results
belong to their recorded checkout; matrix membership alone is not a successful
run, and capability minima describe introductions rather than support ceilings.
No new major was published. Existing handling of ranges, prereleases, missing
versions, explicit major conflicts, and unknown majors is unchanged.

## Release and exact-tag review

Read every release note after each major's baseline. Compared the full config
crate from exact-tag archives at 12.11.2, 12.12.0, and 12.12.1, including typed
settings, nested sections, loading, environment overlays, validation, scope,
resolved reporting, known/refused settings, and package configuration. The
12.11.2-to-12.12.0 GitHub compare response reached its 300-file limit; complete
archive comparison avoids relying on that truncated list. The 12.12.0-to-12.12.1
config crate is identical except for the version constant; its new reserved
prefix lives in the deps-path crate instead.

The complete 10.34.6-to-10.34.7 compare has 77 files and no configuration reader,
workspace schema, or type changes. Runtime engine-signature verification and
update-notification changes need no migration rule. The v11 target is unchanged.

| Release                                                       | GitHub publication (UTC) | Classification and decision                                                                                                     |
| ------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [10.34.7](https://github.com/pnpm/pnpm/releases/tag/v10.34.7) | October 12, 06:05:46     | Mirror-signature fallback and updater guidance: unrelated to settings migration                                                 |
| [12.12.0](https://github.com/pnpm/pnpm/releases/tag/v12.12.0) | October 10, 19:52:45     | New remote-cache and peer-type settings: implementation needed; config-dependency updates and runtime fixes need no conversion  |
| [12.12.1](https://github.com/pnpm/pnpm/releases/tag/v12.12.1) | October 11, 11:30:09     | Exact `tool` registry alias becomes reserved: implementation needed; OIDC and tool-protocol operations remain upstream behavior |

| Difference                                                                                               | Migration treatment                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `addMissingPeerTypes`                                                                                    | Gate at 12.12.0; accept boolean/null; preserve malformed values with diagnostics; do not materialize its false default                     |
| `remoteCache`                                                                                            | Gate at 12.12.0; accept `{ org: string or null }`, empty object, or null                                                                   |
| Remote server, team, signing, trust, and publish fields                                                  | Retain the whole source object; project YAML is not the trusted machine configuration where these fields belong                            |
| Unknown remote-cache fields, including `organization`                                                    | Retain intact; no unverified alias conversion or dropped nested fields                                                                     |
| `remoteCache` versus `sideEffectsCache.remote`                                                           | Preserve both; upstream gives new fields precedence and fills missing fields from the legacy section                                       |
| `allowBuilds` with `dangerouslyAllowAllBuilds`                                                           | Preserve explicit values; pnpm 12.12 fixes actual build denial itself                                                                      |
| Exact lowercase `tool` alias                                                                             | Retain both legacy `namedRegistries` and URL-keyed `registries` at 12.12.1+; reject existing incompatible workspace settings before writes |
| Mixed-case `ToOl` alias                                                                                  | Already valid: preserve it. Source and observed behavior confirm case sensitivity; only `pkg` has the case-insensitive exception           |
| Configuration dependency range/update handling                                                           | Already represented by existing settings; no new fields or value conversion                                                                |
| Bootstrap tolerance, `_auth` unknown-field handling, OIDC, deploy, peer resolution, task-cache transport | Runtime/auth behavior; preserve credential protections and leave operations to pnpm                                                        |

Exact-tag evidence:

- [12.12.0 workspace fields](https://github.com/pnpm/pnpm/blob/v12.12.0/pnpm/crates/config/src/workspace_yaml/settings.rs)
- [12.12.0 remote-cache shapes and machine-only fields](https://github.com/pnpm/pnpm/blob/v12.12.0/pnpm/crates/config/src/workspace_yaml/sections/remote.rs)
- [12.12.0 workspace trust validation](https://github.com/pnpm/pnpm/blob/v12.12.0/pnpm/crates/config/src/workspace_yaml/validation.rs)
- [12.12.0 remote-cache precedence and environment overlay](https://github.com/pnpm/pnpm/blob/v12.12.0/pnpm/crates/config/src/settings/cache.rs)
- [12.12.0 missing peer type transformation](https://github.com/pnpm/pnpm/blob/v12.12.0/pnpm/crates/package-manager/src/missing_peer_types.rs)
- [12.12.1 reserved prefixes and case sensitivity](https://github.com/pnpm/pnpm/blob/v12.12.1/pnpm/crates/deps-path/src/registry_qualified.rs)
- [12.12.1 registry resolver validation](https://github.com/pnpm/pnpm/blob/v12.12.1/pnpm/crates/resolving-npm-resolver/src/named_registry.rs)
- [10.34.6 to 10.34.7 complete comparison](https://github.com/pnpm/pnpm/compare/v10.34.6...v10.34.7)

The migrator deliberately accepts canonical boolean and string types, preserving
noncanonical scalar coercions in their source. It also retains objects naming
machine-only remote-cache fields even when such a field is null; pnpm's optional
parser may treat that null as unset. This is conservative retention, not a claim
that every retained representation fails pnpm parsing.

## Implementation

- `src/constants/pnpm-capabilities.ts`: 12.12.0 field capability and the exact
  12.12.1 prefix boundary; no empty patch capability entry.
- `src/features/settings/remote-cache.ts` and `versioned-values.ts`: nested
  project-only validation, boolean/null validation, and reserved-prefix checks.
- `src/types/pnpm-v12.ts` and `src/index.ts`: explicit public remote-cache type
  and new workspace settings.
- `tests/migration/compatibility/pnpm-12.12.test.ts`: 64 regressions covering
  introduction/predecessor, inferred and explicit targets, uncertain versions,
  invalid nested values, cleanup, unchanged project pins, existing workspaces,
  all three merge strategies, precedence preservation, and prefix case.
- `scripts/verify-pnpm-12.12.ts`: real migration/config parsing, machine-field
  rejection, prefix validation, optional shapes, actual peer-type linking with
  enabled/disabled controls, build denial, and frozen installs in temporary
  workspaces. Integrated into the harness and CI, retaining older releases.
- `package.json`, `pnpm-lock.yaml`, and `README.md`: toolchain and current claims.

For target 12.12.0, this manifest section:

```json
{ "pnpm": { "addMissingPeerTypes": true, "remoteCache": { "org": "acme" } } }
```

becomes:

```yaml
addMissingPeerTypes: true
remoteCache:
  org: acme
```

The applied source keys are removed. For target 12.11.2 they remain in their
source with diagnostics. Adding `remoteCache.url` preserves the complete
`remoteCache` source object even on 12.12.1. User project package-manager pins,
credentials, dynamic proxy/registry protections, and merge/cleanup contracts
remain unchanged.

## Verification

Verification used Node **24.21.0** on macOS and user-managed pnpm **12.11.2**,
matching the repository's package-manager pin. To reproduce the checks, use the
pinned pnpm version and a Node version supported by the package. Equivalent
commands without local environment wrappers are shown below:

```sh
pnpm install --lockfile-only --ignore-scripts
pnpm install --frozen-lockfile --ignore-scripts
pnpm run release:check
pnpm run build
pnpm run test:compatibility -- 12.11.2 12.12.0 12.12.1
pnpm run test:compatibility
```

- Lockfile generation and frozen dependency installation passed with pnpm
  **12.11.2**, without unrelated dependency changes.
- Final `release:check` passed: zero lint warnings, formatting, strict TypeScript,
  and **915 tests in 37 files**. The new 12.12 file contains 64 tests.
- Library, CLI, and declaration builds passed. tsdown emits its existing
  experimental TypeScript 7 API warning.
- The targeted **12.11.2, 12.12.0, 12.12.1** run passed, followed by the complete
  **29-release** real-pnpm matrix: **11.25.0, 11.26.0, 11.27.1, 11.28.0,
  11.28.1, 11.28.2, 11.28.3, 11.28.4, 11.28.5, 12.2.1, 12.3.4, 12.4.0,
  12.4.2, 12.5.0, 12.5.1, 12.6.0, 12.7.0, 12.8.0, 12.8.1, 12.8.2,
  12.9.0, 12.9.1, 12.10.0, 12.10.1, 12.11.0, 12.11.1, 12.11.2,
  12.12.0, 12.12.1**. Each release passed the base migration, config, install,
  and frozen-install fixture plus applicable version-specific branches.
- New real fixtures verify source cleanup/retention, config reporting, rejected
  machine settings, optional shapes, case-sensitive registry rejection, actual
  linking of an available peer's types, a disabled-setting control, build denial,
  and an unchanged lockfile after frozen install. All installs use temporary
  workspaces, which the harness removes after completion.
- An initial targeted run failed because the new fixture incorrectly expected
  mixed-case `ToOl` to be reserved. Exact source review confirmed only lowercase
  `tool` is reserved. The rule and tests were corrected; subsequent targeted
  and full-matrix runs passed. Initial lint warnings were also fixed before the
  final clean release check. No unresolved check failure remains.

Coverage limits: these are fixture-specific checks, not exhaustive verification
of every pnpm setting. The harness explicitly supports v11/v12, so real v10
consumption remains unverified; 10.34.7 received complete release/source-diff
review and existing v10 unit regressions. Remote-cache configuration parsing,
project trust restrictions, coexistence, and install acceptance were tested;
remote artifact upload/download and signed task-cache exchange were not exercised
because the fixtures configure no remote server or signing credentials. Remote
field precedence is established from the exact-tag implementation and source
retention tests, not claimed as an end-to-end cache-transfer result. No CI run
on other operating systems was dispatched in this local update.
