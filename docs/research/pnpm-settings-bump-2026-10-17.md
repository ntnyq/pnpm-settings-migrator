# pnpm compatibility update — 2026-10-17

## Query and release channels

Fetched fresh npm `dist-tags`, `versions`, and `time` at **2026-10-17
04:06:40 Asia/Shanghai (2026-10-16 20:06:40 UTC)**. Stable SemVer candidates
were sorted by numeric major/minor/patch, independently of publication order.
The highest version without a prerelease suffix and npm's default `latest`
are both **12.14.0**. The GitHub releases API confirms the selected versions
are neither drafts nor prereleases.

| Major | Highest stable SemVer | `latest-*` | `next-*` | npm publication (UTC) | GitHub publication (UTC) |
| ----- | --------------------- | ---------- | -------- | --------------------- | ------------------------ |
| 10    | 10.34.7               | 10.34.7    | 10.34.7  | October 12, 06:05:15  | October 12, 06:05:46     |
| 11    | 11.28.6               | 11.28.6    | 11.28.6  | October 15, 13:39:30  | October 15, 13:45:17     |
| 12    | 12.14.0               | 12.14.0    | 12.14.0  | October 15, 13:39:41  | October 15, 13:42:33     |

The `next-*` labels remain relevant even though they currently point to the same
confirmed stable releases as `latest-*`. The intervening **12.13.0** was
published to npm on October 13 at 08:26:30 UTC and GitHub at 08:32:10 UTC.
No new pnpm prerelease or new major was published after the previous audit;
12.0.0-rc.11 remains the last published v12 release candidate and is not targeted.
The first 100-entry GitHub API page extends through v10.34.5 and covers every
release after all three baselines, so pagination was unnecessary.

Sources: [npm metadata](https://registry.npmjs.org/pnpm),
[official release metadata](https://api.github.com/repos/pnpm/pnpm/releases?per_page=100).

## Repository and baseline

Confirmed the package is `pnpm-settings-migrator`. The starting working tree was
clean. The toolchain pin changes from **12.11.2 to 12.14.0**, following `latest`.
The npm wrapper still declares Node `>=18.*`; the repository keeps its stricter
`^22.19.0 || >=24.11.0` engine and ordinary CI matrix. Compatibility CI retains
Node 24.18.0, needed by the already supported loaded linker. Local verification
used Node **24.21.0**, macOS, and pnpm **12.14.0**. Lockfile changes are confined
to the package-manager pin and platform executables; no application dependency
or `@pnpm/types` upgrade was necessary.

| Major | Implemented before                                                   | Verified before                                        | After this update                                                                       |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| v10   | Legacy schema; source reviewed through 10.34.7                       | Unit regressions; real consumption unverified          | Unchanged; no newer release or relevant rule                                            |
| v11   | Schema and validation boundaries through 11.28.5                     | October 13 audit records real fixtures through 11.28.5 | Restore null proxies at 11.28.6; real fixtures extended to 11.28.6                      |
| v12   | Capabilities through 12.12.0 and reserved registry prefix at 12.12.1 | October 13 audit records real fixtures through 12.12.1 | Add 12.13 settings and 12.14 nested cache exclusions; real fixtures extended to 12.14.0 |

Baseline evidence: `package.json`, `src/constants/pnpm-v*.ts`,
`pnpm-capabilities.ts`, compatibility target/version resolution, nested setting
validation, tests, the real-pnpm harness, `.github/workflows/ci.yml`, README, and
the [October 13 audit](pnpm-settings-bump-2026-10-13.md). Historical results belong
to their recorded checkout. Matrix membership alone is not a successful run;
capability minima mark introductions rather than overall support ceilings.
No new major support, target inference behavior, or project-pin rewriting is added.

## Release and exact-tag review

Read all release notes between each baseline and target: v10 has no intervening
release; v11 has 11.28.6; v12 has 12.13.0 and 12.14.0. Compared complete config
source extracted from official exact-tag archives for 11.28.5/11.28.6 and
12.12.1/12.13.0/12.14.0. This includes configuration types, known/refused keys,
workspace fields, nested sections, defaults, loading, precedence, environment
overlays, materialization, reporting, and package-config scope. No additional
top-level field removal or package-config allowlist change was found.

| Release / difference                                                                                           | Classification and migration treatment                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 11.28.6 null `httpProxy` / `httpsProxy`                                                                        | Implementation needed: accept null again from this exact patch; retain the 11.28.5 rejection boundary and invalid non-string rejection  |
| 11.28.6 unreadable-config bootstrap and `_auth` forward compatibility                                          | Unrelated to migration: preserve credential protections and source parsing contract                                                     |
| 11.28.6 publish identity-token checks, peers, catalogs, workspace/linking/deploy fixes, output handling        | Runtime behavior; no new configuration field or conversion                                                                              |
| 12.13.0 `nodePackageMap`                                                                                       | Implementation needed: exact gate, nested mode/type validation, public type, source retention                                           |
| 12.13.0 `storeIndexFormat`                                                                                     | Implementation needed: exact gate; `sqlite`, `files`, or null; no default insertion                                                     |
| 12.13.0 legacy package-map spellings                                                                           | Already supported: retain alongside the new section; let pnpm apply per-field precedence                                                |
| 12.13.0 profile/token commands, setup, Python resolution, filesystem/packing/audit/pipeline fixes              | Unrelated to settings migration; no additional field or conversion                                                                      |
| 12.14.0 `sideEffectsCache.exclude`                                                                             | Implementation needed: exact gate; string-array/null validation; preserve the entire section for older targets or invalid nested values |
| 12.14.0 `NetworkPolicy` refactor                                                                               | Already covered: derives from existing `offline` / `preferOffline`; no new field or representation                                      |
| 12.14.0 updater, registry bootstrap flags, install/linking, stdout, Windows toolchains, packing and publishing | Runtime fixes; no migration rule or materialized default                                                                                |

Exact-tag evidence:

- [12.13.0 workspace types and fields](https://github.com/pnpm/pnpm/blob/v12.13.0/pnpm/crates/config/src/workspace_yaml/settings.rs)
- [12.13.0 package-map enum values](https://github.com/pnpm/pnpm/blob/v12.13.0/pnpm/crates/config/src/setting_types.rs)
- [12.13.0 new-versus-legacy field precedence](https://github.com/pnpm/pnpm/blob/v12.13.0/pnpm/crates/config/src/workspace_yaml/apply.rs)
- [12.13.0 store-index parsing tests](https://github.com/pnpm/pnpm/blob/v12.13.0/pnpm/crates/config/src/workspace_yaml/tests/lockfile.rs)
- [12.14.0 cache section](https://github.com/pnpm/pnpm/blob/v12.14.0/pnpm/crates/config/src/workspace_yaml/sections.rs)
- [12.14.0 resolved cache behavior](https://github.com/pnpm/pnpm/blob/v12.14.0/pnpm/crates/config/src/workspace_yaml.rs)
- [12.14.0 exclusion semantics](https://github.com/pnpm/pnpm/blob/v12.14.0/pnpm/crates/config/src/settings.rs)
- [12.14.0 file-index storage](https://github.com/pnpm/pnpm/blob/v12.14.0/pnpm/crates/store-dir/src/store_index/files.rs)
- [11.28.6 proxy normalization](https://github.com/pnpm/pnpm/blob/v11.28.6/pnpm11/config/reader/src/getOptionsFromRootManifest.ts)
- [11.28.6 release](https://github.com/pnpm/pnpm/releases/tag/v11.28.6),
  [12.13.0 release](https://github.com/pnpm/pnpm/releases/tag/v12.13.0),
  [12.14.0 release](https://github.com/pnpm/pnpm/releases/tag/v12.14.0)

`nodePackageMap` supports modes `off`, `write-only`, and `load`, and types
`standard` and `loose`. Its section and optional fields accept null. The new
section wins only for fields it sets; omitted/null fields retain legacy or
default values. The migrator preserves both spellings instead of manufacturing
an alias conversion. Unknown nested keys are conservatively retained, even
where an upstream optional parser would ignore them.

Cache exclusions use package-name, scope, or name@version patterns. They disable
restoring and saving that package's build locally and remotely; upstream also
gives excluded packages and their dependents project-owned global-store slots.
The migrator validates read/write siblings and project-owned remote-cache fields
when the section opts into exclusions. It never drops an unsupported sibling to
make the remainder pass. Server/signing settings continue to belong in trusted
configuration. Defaults remain controlled by pnpm.

## Implementation and example

- `src/constants/pnpm-capabilities.ts`: one new top-level capability at 12.13.0;
  exact boundaries for 12.14 nested values and 11.28.6 proxy restoration. No empty
  capability entry was added for the nested-only release.
- `src/features/settings/pnpm-v12-values.ts` and `versioned-values.ts`: nested
  value checks, conservative whole-object retention, restored null proxies.
- `src/types/pnpm-v12.ts`, `workspace.ts`, and `src/index.ts`: explicit public
  package-map/cache types and nullable proxy declarations.
- `tests/migration/compatibility/pnpm-12.13.test.ts`, `pnpm-12.14.test.ts`, and
  `pnpm-11.28-validation.test.ts`: 74 added cases covering exact boundaries,
  uncertain pins, explicit targets, invalid nested values, existing workspace
  failures before writes, cleanup, optional shapes, precedence preservation,
  legacy cache normalization, public types, and all three conflict strategies.
- `scripts/verify-pnpm-12.13.ts`, the compatibility/config-shape harnesses, and CI:
  actual new-setting consumption and retained older regressions.
- `package.json`, `pnpm-lock.yaml`, and README: toolchain pin and current claims.

For target 12.14.0, this manifest section:

```json
{
  "pnpm": {
    "nodePackageMap": { "mode": "write-only", "type": "loose" },
    "storeIndexFormat": "files",
    "sideEffectsCache": { "exclude": ["java", "@native/*"] }
  }
}
```

becomes:

```yaml
nodePackageMap:
  mode: write-only
  type: loose
storeIndexFormat: files
sideEffectsCache:
  exclude:
    - java
    - '@native/*'
```

Applied keys are cleaned from the source. At 12.13.0 the entire cache section
stays in the source with diagnostics; at 12.12.1 all three settings stay there.
User project package-manager pins, credentials, dynamic values, and conflict
strategies keep their existing contracts.

## Verification

Portable commands executed with the pinned pnpm:

```sh
pnpm install --lockfile-only --ignore-scripts
pnpm install --frozen-lockfile --ignore-scripts
pnpm run release:check
pnpm run build
pnpm run test:compatibility -- 11.28.5 11.28.6 12.12.1 12.13.0 12.14.0
pnpm run test:compatibility
pnpm run test:compatibility -- 12.13.0 12.14.0
```

- Lockfile generation and frozen dependency installation passed with 12.14.0.
- Lint, formatting, strict typechecking, and **1072 tests in 40 files** passed.
- Library, CLI, and declaration builds passed. The existing tsdown warning about
  the experimental TypeScript 7 API remains.
- The targeted five-release compatibility run passed after fixture corrections.
  After extracting the build-cache assertions into a separate helper, the final
  12.13.0/12.14.0 targeted run also passed with all consumption controls.
- The complete **32-release matrix passed**: **11.25.0, 11.26.0, 11.27.1,
  11.28.0, 11.28.1, 11.28.2, 11.28.3, 11.28.4, 11.28.5, 11.28.6,
  12.2.1, 12.3.4, 12.4.0, 12.4.2, 12.5.0, 12.5.1, 12.6.0, 12.7.0,
  12.8.0, 12.8.1, 12.8.2, 12.9.0, 12.9.1, 12.10.0, 12.10.1,
  12.11.0, 12.11.1, 12.11.2, 12.12.0, 12.12.1, 12.13.0, 12.14.0**.
  Every release passed its base migration/config/install/frozen-install fixture
  and all applicable version-specific branches. The latest v12 checks also
  passed the file-index directory/SQLite-absence assertions and same-version
  excluded-versus-cache-reuse control.

The new real fixtures verify migration output and cleanup, JSON config reporting,
invalid enum rejection, nullable options, actual package-map generation, legacy
field precedence, write-only execution without a Node loader flag, and map-off
behavior on a fresh dependency tree. File-index consumption checks for a store
`index` directory and the absence of `index.db`. Cache fixtures use local tarballs
whose lifecycle build produces a random marker: excluded packages rebuild in a
fresh dependency tree; removing exclusions restores cache reuse. Frozen installs
must leave the lockfile unchanged. All installs use temporary workspaces with
cleanup in `finally` blocks.

Initial failures introduced during this work were corrected: a new value check
was placed in the wrong helper; a legacy-alias test omitted `replaceDeprecated`;
and a fixture expected a no-op frozen install to remove an existing package map.
Observed pnpm behavior keeps that map on the no-op path, so the off-mode control
now tests a fresh dependency tree. Initial lint warnings were also addressed.

Coverage limits: checks are fixture-specific, not exhaustive guarantees for all
settings. Real v10 consumption remains unverified because the harness explicitly
supports v11/v12. Remote artifact transfer, shared network filesystems,
cross-project global-store isolation, and actual Node package-map loader mode
are not exercised; their semantics are established from exact source and release
notes. No remote CI execution on other platforms was dispatched.
