# pnpm compatibility update — 2026-10-22

This report records the initial version bump and the subsequent include
implementation on the same day. The initial phase below documents the temporary
include protection. The [include delegation follow-up](#include-delegation-follow-up)
supersedes that limitation and records the final implementation and verification.

## Query, channels, and targets

Fresh npm metadata (`dist-tags`, `versions`, and `time`) and GitHub releases
were queried at **2026-10-22 19:44:53 Asia/Shanghai (11:44:53 UTC)**.
Stable version candidates were sorted numerically by SemVer components, excluding
prerelease suffixes. npm `latest` and the highest confirmed stable release are
both **12.15.0**. GitHub marks both selected releases as neither drafts nor
prereleases.

| Major | Highest stable SemVer | npm `latest-*` | npm `next-*` | npm publication (UTC) | GitHub publication (UTC) |
| ----- | --------------------- | -------------- | ------------ | --------------------- | ------------------------ |
| 10    | 10.34.7               | 10.34.7        | 10.34.7      | October 12, 06:05:15  | October 12, 06:05:46     |
| 11    | 11.28.7               | 11.28.6        | 11.28.7      | October 21, 11:14:12  | October 21, 11:17:06     |
| 12    | 12.15.0               | 12.15.0        | 12.15.0      | October 21, 11:16:18  | October 21, 11:16:52     |

11.28.7 is a stable SemVer and a GitHub non-prerelease, but remains on npm's
**next-11** channel rather than `latest-11`. This audit targets it on that
explicit basis. The only new pnpm publications since the October 17 audit are
11.28.7 and 12.15.0. No newer pnpm prerelease or new major is published;
12.0.0-rc.11 remains the last v12 release candidate and is not targeted. The
separate pnpr alpha release is a registry server, not a pnpm release. The first
100-entry GitHub releases page extends back through v12.0.0-alpha.9 and covers
the entire interval; pagination was unnecessary.

Sources: [npm metadata](https://registry.npmjs.org/pnpm),
[GitHub release metadata](https://api.github.com/repos/pnpm/pnpm/releases?per_page=100),
[11.28.7 release notes](https://github.com/pnpm/pnpm/releases/tag/v11.28.7),
[12.15.0 release notes](https://github.com/pnpm/pnpm/releases/tag/v12.15.0).

## Baseline and toolchain

The package name is `pnpm-settings-migrator`; the starting working tree was
clean. Development `packageManager` changes from **12.14.0 to 12.15.0**,
following npm `latest`. The published wrapper declares Node `>=18`; the
repository keeps its stricter `^22.19.0 || >=24.11.0` requirement and ordinary
CI matrix. Compatibility CI retains Node 24.18.0 for the loaded linker.
Local work began under Node 24.21.0; final verification used Node 24.22.1 on
macOS. This workflow upgraded only the pnpm pin and its platform executables;
no application dependency or `@pnpm/types` upgrade was required for the rules.
During execution, separate concurrent edits upgraded `@pnpm/types` to 1102.1.2,
`npm-run-all2` to 9.0.4, Oxfmt to 0.74.0, Oxlint to 1.89.0, and Vitest to 5.0.5
(with corresponding lockfile updates). Those edits were preserved and are not
counted as compatibility work added by this workflow. Final checks use that
updated working tree.

| Major | Implemented before                                              | Verified before                                                   | After this run                                                                                                             |
| ----- | --------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| v10   | Legacy schema; source audit through 10.34.7                     | Unit regressions; real consumption unverified                     | Unchanged; no newer upstream release                                                                                       |
| v11   | Field and validation boundaries through 11.28.6                 | October 17 audit records successful real fixtures through 11.28.6 | Add 11.28.7 unpack limits and peer/external settings; extend real fixtures                                                 |
| v12   | Capabilities through 12.13 and nested cache exclusions at 12.14 | October 17 audit records real fixtures through 12.14.0            | Add 12.15 boot policy, tar integrity, pnpr server type, and unpack limits; delegated include migration remains unsupported |

Baseline evidence: `package.json`, `src/constants/pnpm-v*.ts`,
`pnpm-capabilities.ts`, target/version resolution, nested validation, tests,
`scripts/verify-pnpm-compatibility.ts`, CI, README, and the
[October 17 audit](pnpm-settings-bump-2026-10-17.md). Historical successful runs
apply to their recorded checkout. A capability minimum denotes introduction;
a matrix entry alone is not evidence that verification passed. There is no
claim of exhaustive compatibility for every setting within a major.

## Exact-tag review

Read all intervening release notes: 11.28.7 and 12.15.0; v10 has no intervening
release. Compared official tag archives for **11.28.6 → 11.28.7** and
**12.14.0 → 12.15.0**, including configuration schemas, reading, known/refused
keys, environment overlays, nested settings, defaults, ownership, and scope.
Also inspected workspace include parsing and lockfile registry/integrity enums.

| Difference                                                                                                                        | Classification and treatment                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 11.28.7 / 12.15.0 `maxTarballUnpackedSize`                                                                                        | Implement: exact introduction gates; nonnegative safe integer bytes or null; normalize decimal npmrc values; retain invalid/dynamic values       |
| 11.28.7 `externalDependencies`                                                                                                    | Implement v11 gate: pnpm now converts YAML arrays to a Set before passing to install; validate string arrays/null                                |
| 11.28.7 `autoInstallPeersFromHighestMatch`                                                                                        | Implement v11 gate and boolean/null validation; v12 support predates this run                                                                    |
| 12.15.0 `bootConfig`                                                                                                              | Implement exact gate and all seven nested fields; reject unknown/invalid fields as a whole; preserve independent bootstrap/install policy        |
| 12.15.0 `lockfile.integrityTarget`                                                                                                | Implement exact gate; `resource`, `tar`, or null, preserving enum placeholders; retain entire section on older targets                           |
| 12.15.0 registry `serverType: pnpr`                                                                                               | Implement exact gate, including declarations without concurrency; retain the whole registry map on unsupported or invalid values                 |
| 12.15.0 `include`, local paths, config dependency ownership                                                                       | Explicitly unsupported by root-only migration; retain incoming declarations with diagnostics and stop existing included workspaces before writes |
| New known-key annotations and v11 warning fixes                                                                                   | Covered by version gates; no unrelated schema expansion                                                                                          |
| Refused keys, credentials, trusted global settings                                                                                | Existing protections preserved; no new project permission granted                                                                                |
| Bootstrap pin decisions, lockfile directory fixes, invalid URL environment fallback                                               | Upstream reading/runtime fixes; no migration conversion or project-pin rewriting                                                                 |
| v11 registry revision removal / v12 tar and revision protocols                                                                    | Runtime protocol changes; only new configuration representation needs a rule                                                                     |
| Exclusion pruning for config dependencies, trust checks of pinned pnpm                                                            | Existing keys remain unchanged; defaults and behavior stay with pnpm                                                                             |
| Resolution, peer, workspace injection, filtered installs, pnpmfile, deployment, publishing, filesystem, performance, output fixes | Unrelated to settings conversion; no manufactured migration entries                                                                              |
| `SOURCE_DATE_EPOCH`, macOS link thread environment control, zstd responses                                                        | Runtime/environment behavior; no persisted project setting                                                                                       |

Primary source links:

- [11.28.7 config conversion and validation](https://github.com/pnpm/pnpm/blob/v11.28.7/pnpm11/config/reader/src/getOptionsFromRootManifest.ts)
- [11.28.7 numeric setting](https://github.com/pnpm/pnpm/blob/v11.28.7/pnpm11/config/reader/src/types.ts)
- [11.28.7 known setting checks](https://github.com/pnpm/pnpm/blob/v11.28.7/pnpm11/config/reader/src/unknownSettings.ts)
- [12.15.0 workspace fields](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/config/src/workspace_yaml/settings.rs)
- [12.15.0 bootstrap policy and precedence](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/config/src/boot_config.rs)
- [12.15.0 lockfile section](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/config/src/workspace_yaml/sections.rs)
- [12.15.0 integrity enum](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/lockfile/src/integrity_target.rs)
- [12.15.0 registry enum](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/lockfile/src/resolution/registry.rs)
- [12.15.0 include ownership and aliases](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/workspace/src/include/selector.rs)
- [12.15.0 include/config dependency reading](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/config/src/workspace_yaml/includes.rs)
- [Upstream tar integrity install tests](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/cli/tests/suite/lockfile_integrity_target.rs)
- [Upstream tar registry install tests](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/cli/tests/suite/tar_registry.rs)

`bootConfig` fields are `minimumReleaseAge`, `minimumReleaseAgeExclude`,
`minimumReleaseAgeStrict`, `minimumReleaseAgeIgnoreMissingTime`, `trustPolicy`,
`trustPolicyExclude`, and `trustPolicyIgnoreAfter`. Numeric fields are unsigned;
trust policy is `off` or `no-downgrade`. The section and fields may be null.
The migrator intentionally accepts only JavaScript safe integers, preserving
larger/invalid representations rather than rounding upstream u64 values.
No default is materialized and no bootstrap field is promoted to normal policy.

`include` is not an ordinary mergeable setting: listed slots are owned even
when absent, legacy aliases share ownership, catalog slots can be split, and
relative paths are resolved from the owning file. Config dependencies add
another read-only owner. Adding it to an allowlist would permit root settings
that pnpm rejects as ownership conflicts, or source cleanup without an applied
value. The migrator therefore does not claim full include compatibility.
Incoming declarations stay intact, and any existing `include` declaration,
including empty/null forms, blocks all writes with an actionable error. Users
must consolidate settings in the root before migration. No included file or
installed config dependency is changed.

## Implementation and example

- `src/constants/pnpm-capabilities.ts`: exact v11/v12 top-level gates; no empty
  release capability entries.
- `src/features/settings/boot-config.ts`: bootstrap and unpack-limit validation,
  v11 peer/external value checks, and include source retention.
- `src/features/settings/pnpm-v12-values.ts`: nested integrity and registry gates;
  whole-object retention rather than dropping unsupported children.
- `src/features/settings/schema.ts`: fail before writes for delegated workspaces.
- `src/features/sources/npmrc.ts`: numeric unpack-limit conversion.
- `src/types/pnpm-v12.ts`, `workspace.ts`, and `src/index.ts`: explicit public bootstrap type,
  integrity field, widened registry server type, nullable peer/external fields.
- `tests/migration/compatibility/pnpm-12.15.test.ts` and `pnpm-11.28.7.test.ts`:
  exact boundaries, preceding releases, imprecise/prerelease/unknown pins,
  explicit targets, nested validation, cleanup, existing workspace checks,
  public types, and all conflict strategies.
- `scripts/verify-pnpm-12.15.ts`, `verify-pnpm-tarball-settings.ts`,
  compatibility harness, and CI: real configuration
  and install consumption checks, retaining all earlier fixtures.
- `package.json`, `pnpm-lock.yaml`, README: current toolchain and compatibility.

For target 12.15.0, this source:

```json
{
  "pnpm": {
    "bootConfig": { "minimumReleaseAge": 0 },
    "maxTarballUnpackedSize": 1048576,
    "lockfile": { "integrityTarget": "tar" }
  }
}
```

becomes:

```yaml
bootConfig:
  minimumReleaseAge: 0
maxTarballUnpackedSize: 1048576
lockfile:
  integrityTarget: tar
```

Applied source keys are removed. At 12.14.0, all three remain in the source with
diagnostics. At 11.28.7, only the unpack limit migrates. Credentials, dynamic
values, source precedence, merge strategies, and user project pins retain their
existing contracts.

## Verification

Executed portable commands with the repository pin:

```sh
pnpm install --lockfile-only --ignore-scripts
pnpm install --frozen-lockfile --ignore-scripts
pnpm run release:check
pnpm run build
pnpm run test:compatibility
```

- Lockfile regeneration and frozen dependency validation passed with pnpm
  **12.15.0**. The concurrent dependency edits described above are preserved.
- Lint and formatting passed without diagnostics, strict typechecking passed,
  and **1173 tests across 42 files** passed (101 added cases).
- Library, CLI, and declaration builds passed. The existing tsdown warning
  about TypeScript 7's experimental API remains; it did not fail the build.
- The complete **34-release real-pnpm matrix passed**: **11.25.0, 11.26.0,
  11.27.1, 11.28.0, 11.28.1, 11.28.2, 11.28.3, 11.28.4, 11.28.5, 11.28.6,
  11.28.7, 12.2.1, 12.3.4, 12.4.0, 12.4.2, 12.5.0, 12.5.1, 12.6.0, 12.7.0,
  12.8.0, 12.8.1, 12.8.2, 12.9.0, 12.9.1, 12.10.0, 12.10.1, 12.11.0,
  12.11.1, 12.11.2, 12.12.0, 12.12.1, 12.13.0, 12.14.0, 12.15.0**.
  Each release completed the base migration/config/install/frozen-install
  scenario plus its applicable older capability fixtures. The harness only
  supports exact stable v11/v12 versions; no v10 real run is claimed.
- The new fixture ran for **11.28.6, 11.28.7, 12.14.0, 12.15.0**. It verifies
  migration output and source retention at actual predecessors; new-version
  `config list --json` checks confirm the fields without unknown-setting
  warnings. v11.28.7 runs a hoisted dependency installation with
  `externalDependencies` present, exercising the fixed Set conversion.
- A temporary loopback registry serves a deterministic compressible package.
  Both 11.28.7 and 12.15.0 reject a 1 KiB unpack limit, then install successfully
  at 1 MiB and pass frozen installation. The payload is 8 KiB, so this checks
  unpacked size rather than download size.
- 12.15.0's generated project lockfile records `settings.integrityTarget: tar`
  and the independently computed SHA-512 of the uncompressed tar. A second
  distinct registry URL serves raw tar metadata with `serverType: pnpr` and a
  named prefix. Fresh installation omits a redundant tarball URL, pins the same
  tar hash, and passes frozen installation after removing both store and
  `node_modules`. Registry declarations must be consumed without ignored-entry
  warnings.
- Boot policy is verified through nested unit cases, real configuration
  reporting, and exact-source precedence review. Actual trust/release-age
  bootstrap network decisions are not exhaustively exercised. Included-file
  ownership is protected by retention and fail-before-write regressions;
  migration into local/config-dependency owners remains unsupported.
- No prerelease, v13, live publication, commit, push, or PR was performed.

Initial fixture failures were corrected before the final successful matrix:
Node's process errors store pnpm output in `stdout`/`stderr`; v12.15 may report
an unpack-limit failure as descriptive tar-decoding text rather than v11's
`ERR_PNPM_TARBALL_TOO_LARGE`. Pin bootstrap can add a leading YAML document, so
tar assertions locate the project document by its settings, following the
existing config-shape harness. Reusing a registry URL while changing its bytes
reused cached gzip metadata and invalidated integrity checks; the raw-tar phase
now uses a distinct URL and explicit prefix route. All failures were verification
fixture assumptions, not unresolved migration failures. The final release checks
and full matrix passed after these corrections.

## Include delegation follow-up

On the user's request, completed local YAML and config dependency ownership
support instead of retaining the initial blanket protection. Requeried npm
metadata at **2026-10-22 20:21:09 Asia/Shanghai (12:21:09 UTC)**. The channel
values and highest stable releases are unchanged: latest/latest-12/next-12 are
12.15.0, latest-11 is 11.28.6, next-11 is 11.28.7, and latest-10/next-10 are
10.34.7. Fresh exact-tag selector source matches the previously extracted
v12.15.0 archive. The development pin remains 12.15.0.

### Behavior and ownership

- Enable `include` only for confirmed stable v12 releases from 12.15.0.
  Earlier versions, ranges, prereleases, and unknown majors retain incoming
  declarations with diagnostics; incompatible existing indexes stop before writes.
- Load root and local YAML with merge-key semantics. Explicit setting lists
  reserve slots even when omitted; local wildcards own only existing definitions.
  Aliases share pnpm's canonical ownership slots. Default catalogs, named
  catalogs, and reservations of every catalog are checked independently.
- Read effective configuration to discover packages and lockfile mode, apply the
  selected strategy, normalize writable aliases, and validate the proposed graph.
  Render settings back to their physical root/local owners rather than flattening
  borrowed configuration. Unowned new settings stay in the root.
- Rebase path settings, package globs, pnpmfiles, patch paths, path-like shells,
  catalog local dependencies, and local/workspace override specifiers between
  workspace-root coordinates and each local owner's directory. Preserve absolute,
  home, and environment spellings. Preserve unchanged file contents, comments,
  formatting metadata, and symlinked local owners.
- Read installed config dependencies from `node_modules/.pnpm-config/<name>`
  and their manifest's `pnpm.config` YAML entry. Enforce package-relative paths,
  canonical containment after following symlinks, declared dependency names,
  package-forbidden slots, no nested includes, and delegated-only contents.
- Config dependency owners are read-only under every strategy. Represented source
  values can be cleaned, including policy subsets; conflicting or unavailable
  values stay in their original sources with diagnostics. Missing packages are
  not installed by the migrator. A later run can clean matching values after an
  ordinary pnpm install. Empty/null catalog containers cannot overwrite borrowed
  policy, and an explicit empty skill directory list is not treated as represented
  by a nonempty policy list.
- Check all owners and serialize every destination before writing. Persist local
  owners and root/runtime destinations before pruning package/npmrc sources. A
  failed destination write leaves the legacy source values available for retry.
  As with the existing persistence contract, this is not an all-files rollback:
  an earlier successful destination write can remain if a later one fails.
- Reject missing or duplicate local files (including symlink/hardlink aliases),
  inclusion of the root itself, overlapping owners, undelegated keys, malformed
  catalog shapes, and invalid or escaping package entries before source cleanup.
  Nested includes are invalid in pnpm 12.15 and are intentionally rejected.
- Expand a root YAML merge only when removing an inherited legacy key requires
  it, preserving its leading comments. This prevents repeatedly reporting an
  alias deletion whose inherited value is still present on disk.
- `settingsChanges` compares the actual previous effective workspace with the
  final one, including newly adopted include values. `changedFiles` includes
  local physical destinations. Package-manager pins, credentials, trusted global
  settings, dynamic values, and cleanup flags retain their prior contracts.

For an existing root:

```yaml
include:
  ./config/layout.yaml: [modulesDir, saveExact]
```

and legacy source `modulesDir: ./node_modules` / `saveExact: true`, the result in
`config/layout.yaml` is:

```yaml
modulesDir: ../node_modules
saveExact: true
```

The root keeps the include declaration. A config dependency delegated `saveExact`
with a value of true can satisfy and clean an identical legacy source. A source
value of false stays in place under discard, merge, and overwrite, and no root
value is manufactured to shadow that package.

### Implementation files

- `src/features/sources/includes/{selectors,ownership,paths,load,migration,render}.ts`:
  validated ownership model, local/package loading, relative coordinates,
  read-only merge/normalization, diagnostics, and physical destination rendering.
- `src/features/migration/includes.ts`, `src/core.ts`, and
  `src/features/migration/persistence.ts`: effective source discovery, correct
  before/after results, and destination-before-cleanup orchestration.
- `src/features/sources/config.ts`, `src/utils/yaml-document.ts`, and
  `src/utils/merge.ts`: merge-aware parsing, inherited-key removal, and shared
  value-containment rules for cleanup and policy diagnostics.
- `src/features/settings/boot-config.ts` and capability data: exact include gate
  and whole-value retention for malformed default/named catalog containers.
- `src/types/includes.ts`, `config.ts`, `migration.ts`, `pnpm-v12.ts`, and explicit
  `src/index.ts` exports: internal owner/write metadata and public
  `PnpmIncludeSettings` without exposing internal graph types.
- `tests/migration/sources/includes.test.ts` and the existing 12.15 regression:
  ownership, source cleanup, failure behavior, strategies, type contracts,
  uncertain targets, comments, idempotence, package containment, and YAML merges.
- `scripts/verify-pnpm-includes.ts`, `verify-pnpm-include-packages.ts`, and the
  existing compatibility harness: real include boundaries and installation.
  Existing CI already includes 12.14.0 and 12.15.0, so both new branches execute
  in its matrix without another version-only entry.
- README: current include behavior, examples, API result semantics, and coverage.

Additional primary evidence:

- [Local include reading and package declarations](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/workspace/src/include.rs)
- [Reservations, definitions, and ownership conflicts](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/workspace/src/include/ownership.rs)
- [Alias and catalog slot selectors](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/workspace/src/include/selector.rs)
- [Relative path rebasing](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/workspace/src/include/rebase.rs)
- [Installed package entry containment and validation](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/workspace/src/include/package.rs)
- [Include and bootstrap configuration tests](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/config/src/tests/includes.rs)

### Follow-up verification

Executed `pnpm run release:check`, `pnpm run build`, and
`pnpm run test:compatibility`, followed by a targeted
`pnpm run test:compatibility -- 12.14.0 12.15.0` after the final include changes.
All final commands passed with pnpm 12.15.0 and Node 24.22.1 on macOS.

- **1278 tests in 43 files passed**, including **105 new include cases** added
  during this follow-up. The prior phase's 1173 cases remain covered; its four
  blanket include-protection expectations were updated to test supported
  migration and the actual preceding version instead. Lint, formatting, and
  strict typechecking pass. Library, CLI, and declaration builds pass; the
  existing TypeScript 7/tsdown experimental API warning remains non-fatal.
- The complete **34-version matrix listed in the initial verification passed**
  again with the include harness connected. All base, applicable historical,
  and new include checks completed. 12.14.0 verifies incoming include retention
  without reading missing sources; 12.15.0 verifies the new graph behavior.
  The targeted two-version run also passed after the final shared-helper changes.
- Real 12.15.0 local-file verification migrates package and npmrc values to
  `config/layout.yaml`, checks the root text remains unchanged, confirms source
  cleanup, lists actual pnpm configuration, and installs a dependency through
  a rebased `file:` catalog into a rebased custom `modulesDir`. Frozen install
  leaves the lockfile unchanged. A repeated migration is a no-op. Adding an
  illegal root definition of a delegated setting makes real pnpm reject the
  graph, confirming the ownership check is operational rather than decorative.
- Real config dependency verification uses a temporary loopback npm registry
  serving a policy package and a runtime package. Before the policy is installed,
  migration retains its unknown source values. `pnpm install` installs the
  actual package under `.pnpm-config`, reloads `pnpm.config`, and consumes its
  named catalog to install the runtime dependency. A second migration cleans
  matching source values. Every conflict strategy retains differing values,
  leaves root settings unmaterialized, and preserves the installed entry bytes.
  Frozen install passes before and after removing all `node_modules`, proving
  policy restoration and consumption from the lockfile.
- Missing/malformed/escaping policy entries, package-forbidden selectors, YAML
  merge ownership, shared catalog containers, source precedence, all strategies,
  disabled cleanup, failed writes, duplicate physical files, symlink preservation,
  unknown targets, and explicit empty skill disables have unit regressions.
  All nested-value failures preserve the complete source setting. v10 and
  unconfirmed targets have an explicit load-time gate even though the legacy
  root schema normally permits unrecognized fields.
- No live package publication, global configuration change, installed-policy
  modification, commit, push, or PR was performed. v10 real consumption remains
  unverified, as before. Nested includes are deliberately rejected because the
  selected pnpm release rejects them; missing config dependencies require an
  ordinary user-managed install and a later migration run.

The initial real package fixture failed because `pnpm pack` removes the `pnpm`
manifest section, including the fixture's `pnpm.config`. The fixture now uses
`npm pack --ignore-scripts` solely to produce local registry archives with that
entry intact; migration, configuration reading, dependency installation, and
frozen installation all run with the exact pnpm release. This packaging behavior
is outside the migrator's scope and does not justify rewriting a policy package.
A new unit fixture initially listed both `catalogs` and `catalog` in the same
reservation, which upstream correctly rejects as overlapping; it now delegates
`catalogs`, already covering the default catalog. Those fixture issues and
initial lint diagnostics were corrected before the successful final checks.

## Include review and fixes

The subsequent working-tree review focused on ownership, relative coordinates,
and source cleanup. It reused the exact 12.15.0 source already downloaded above;
it did not perform another release-channel update.

Five reproducible correctness problems were fixed:

- Rebasing an existing `../dependency` catalog entry could produce `dependency`,
  selecting a registry resolver instead of a local path. `workspace:` paths had
  the same problem, and dot-only paths and `file:/./dependency` normalization
  were missing. Dependency specifiers now follow the upstream normalization
  rules and retain a path-shaped prefix while moving between directories.
- Writable legacy settings could disappear when normalization generated a
  replacement owned by a read-only package. Generated canonical values could
  also falsely satisfy source cleanup when the package defined an alias such
  as `permissions`. Normalized values are partitioned by ownership again, and
  existing legacy values survive with diagnostics when the actual package does
  not represent their replacement.
- The two surface forms `catalog` and `catalogs.default` could be merged into
  one owner and accepted for source cleanup even though pnpm rejects that
  configuration. Existing and proposed effective include graphs now reject
  that collision before any destination or source writes.
- An installed policy from an older version could satisfy cleanup while the
  proposed workspace declared a newer version. Package values now require an
  installed manifest version matching the proposed declaration. Locally owned
  declarations use the selected conflict strategy when deciding which package
  is effective; before/after reporting reloads the original graph when the
  declaration changes.
- A writable local include could alias an empty read-only package entry through
  a symlink or hard link. Writable destination identities are now checked
  against installed package entry identities before normalization or writes.

Additional exact-tag evidence:

- [Local specifier normalization and resolver-preserving rendering](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/local-spec/src/lib.rs)
- [Default catalog mutual exclusion](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/catalogs-config/src/lib.rs)

Review regressions cover all three strategies for npmrc path cleanup, local
config dependency declarations, borrowed aliases, and default catalog
collisions. The real include fixture now merges into an existing bare relative
catalog entry, then installs and repeats a frozen install through that entry.
The real package fixture also verifies that proposing a newer policy version
retains source values matching only the old installed package.

Final review verification passed with pnpm 12.15.0 and Node 24.22.1:

- `pnpm run release:check`: **1296 tests in 43 files**, including **123 include
  cases**; lint, formatting, and strict typechecking pass without diagnostics.
  This review adds 18 regressions to the preceding 1278-case result.
- `pnpm run build`: library, CLI, and declarations pass; the existing
  TypeScript 7 experimental API notice remains non-fatal.
- `pnpm run test:compatibility -- 12.14.0 12.15.0`: both complete successfully,
  including real local/include-package installation, source cleanup, conflict
  strategies, and frozen installs. The broader 34-version matrix was not rerun
  during this review; its prior successful run is recorded above.
