# pnpm compatibility update — 2026-11-06

## Fresh channels and baseline

Queried the full npm packument again at **2026-11-06 10:44:39
Asia/Shanghai (02:44:39 UTC)**, including `dist-tags`, `versions`, and `time`.
Sorted all final SemVer versions by numeric major/minor/patch. The default
installation tag **`latest` is 12.18.0**, also the highest final SemVer and a
confirmed non-prerelease GitHub release. No newer major or new pnpm prerelease
was published. The most recent v12 prerelease remains 12.0.0-rc.11.
[npm metadata](https://registry.npmjs.org/pnpm),
[GitHub releases](https://github.com/pnpm/pnpm/releases).

| Major | Highest final SemVer | `latest-*` | `next-*` | npm publication (UTC) | GitHub publication (UTC) |
| ----- | -------------------- | ---------- | -------- | --------------------- | ------------------------ |
| v10   | 10.34.9              | 10.34.9    | 10.34.9  | 2026-10-25 17:54:00   | 2026-10-25 17:54:24      |
| v11   | 11.28.11             | 11.28.9    | 11.28.11 | 2026-11-05 00:56:08   | 2026-11-05 01:00:27      |
| v12   | 12.18.0              | 12.18.0    | 12.18.0  | 2026-11-05 00:56:16   | 2026-11-05 00:56:45      |

11.28.11 is on **`next-11`**, despite having a final SemVer and GitHub
`prerelease: false`. It is a compatibility target, not the development pin.
12.18.0 is on `latest`, `latest-12`, and `next-12`. Read both intervening
release notes in full. The first GitHub API page of 100 releases reached
v12.0.0-alpha.17 on July 20 and covered the complete interval; pagination was
unnecessary. Compared extracted exact-tag source archives, rather than relying
on GitHub's compare API, whose file list was truncated at 300 entries.
[Release metadata](https://api.github.com/repos/pnpm/pnpm/releases?per_page=100),
[11.28.11 notes](https://github.com/pnpm/pnpm/releases/tag/v11.28.11),
[12.18.0 notes](https://github.com/pnpm/pnpm/releases/tag/v12.18.0).

The repository started clean at `a0c84b1`. The development pin changes from
**pnpm@12.16.1 to pnpm@12.18.0**. Its npm wrapper declares Node `>=18`;
the repository's stricter `^22.19.0 || >=24.11.0` requirement remains suitable.
CI retains Node 22.19.0, 24.11.0, and 26.x for tests, and 24.18.0 for real
compatibility checks. Local checks used macOS and Node 24.22.1.
[Manifest](../../package.json), [CI](../../.github/workflows/ci.yml).

| Major | Implemented before this run                                                | Recorded verification before this run                                                                                                | Result of this run                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v10   | Legacy allowlist and selector validation; source reviewed through 10.34.9. | November 4 records CLI/config/install/frozen checks for two override cases on 10.34.9. General v10 migration is outside the harness. | No new release or v10 rule. Existing partial verification remains; not rerun here.                                                                                 |
| v11   | Last new capabilities at 11.28.9; source reviewed through 11.28.10.        | November 4 records the v11 harness through 11.28.10.                                                                                 | Exact source reviewed through 11.28.11; no new migration capability. Full applicable harness passes on 11.28.10 and 11.28.11.                                      |
| v12   | 12.17 fields, selector grammar and value validation.                       | November 4 records the v12 harness through 12.17.0.                                                                                  | Add exact 12.18 value boundaries, null protections, and empty skill-decision cleanup. Full applicable harness passes through 12.18.0 on the releases listed below. |

These baselines come separately from the major allowlists, capability minima,
target resolver, validators, and explicit prior verification results. A
capability minimum is an introduction boundary, not a claimed upper support
limit. [Previous audit](pnpm-settings-bump-2026-11-04.md),
[capabilities](../../src/constants/pnpm-capabilities.ts),
[target resolution](../../src/features/compatibility/target.ts),
[value validation](../../src/features/settings/versioned-values.ts).

## Exact-tag findings and decisions

Compared **11.28.10 → 11.28.11** and **12.17.0 → 12.18.0**.
In v11, the config reader and workspace manifest reader are byte-identical.
In v12, workspace field declarations, known/refused keys, project configuration
fields, workspace scope, registry declarations, and ordinary setting application
are byte-identical. Relevant changes are nested value shapes, platform parsing,
and YAML deserialization, rather than new top-level fields.
[v11 reader](https://github.com/pnpm/pnpm/tree/v11.28.11/pnpm11/config/reader/src),
[v12 workspace fields](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/config/src/workspace_yaml/settings.rs),
[project settings](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/config/src/workspace_yaml/package_configs.rs).

| Difference                            | Classification and migration decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chosen skills                         | **Implementation needed.** From 12.18, `permissions.<package>.skills` accepts boolean or string array. Lists name individual skills; `[]` denies every skill. Preserve each list exactly, including nested skill leaf names. `build` still accepts undecided strings.                                                                                                                                                                                                                                       |
| Skill string prompts                  | **Implementation needed.** 12.18 removes the string variant for `skills`. Keep the entire source `permissions` map if it contains a string prompt, while retaining pre-12.18 support. Null capability values still mean unset. Unknown capabilities remain incompatible.                                                                                                                                                                                                                                    |
| Null package permissions              | **Implementation needed.** `permissions: { example: null }` parses in 12.17 but fails in 12.18. Gate rejection at 12.18; do not confuse a null package entry with a null capability or null top-level section.                                                                                                                                                                                                                                                                                              |
| Platform lists                        | **Implementation needed.** 12.18 accepts additional Node.js OS/CPU names, OS floors, and N-API/Node/Electron ABI tags. Gate new forms at 12.18. Validate all entries, ordering, mutually exclusive ABI choices, libc scope, and unsigned 32-bit canonical floor/ABI numbers. Preserve legacy architecture aliases, Rust triples, and libc baselines from 12.5; `linux-x64-manylinux_2_28` already worked before 12.18. A single bad item retains the whole list. Axis objects keep their existing behavior. |
| YAML null mapping/list entries        | **Implementation needed in part.** The dependency moves from serde-saphyr 0.0.29 to 2.1.0. Real 12.17 accepts null task and pipeline entries, null package extensions, and null nested peer metadata; 12.18 rejects them. Preserve each affected source setting intact from 12.18, including null package configuration entries. Existing workspace validation already rejects null project configuration entries.                                                                                          |
| Null named catalogs                   | **Already covered.** pnpm 12.17 reads a null named catalog as an empty mapping; 12.18 rejects it. The migrator already retained this shape on both sides, so no additional catalog rule is needed.                                                                                                                                                                                                                                                                                                          |
| Optional nulls and empty documents    | **Already covered.** Top-level optional sections and optional fields still accept null. Empty/null YAML documents are explicitly handled by the new upstream reader. No default values need to be written.                                                                                                                                                                                                                                                                                                  |
| Skill linking names and discovery     | **Verification fixture update.** 12.18 uses the skill name alone when available, discovers nested category directories, and records linked names in `.gitignore`. Keep old link-path assertions on older releases. No configuration-key rename is required.                                                                                                                                                                                                                                                 |
| Default-registry prefix lockfile keys | **Verification fixture update.** Both new releases normalize a dependency whose named prefix points at the default registry to an ordinary lockfile package key. Assert the new keys at the exact v11/v12 boundaries, retaining older prefixed-key assertions and tar integrity/frozen checks. Source registry settings need no new transformation.                                                                                                                                                         |
| New environment overlays              | **Already covered.** 12.18 reads `PNPM_CONFIG_*` values for `linkWorkspacePackages`, `injectWorkspacePackages`, `extendNodePath`, `frozenStore`, and `optimisticRepeatInstall`; `--config.extend-node-path` also works. Existing YAML fields and dynamic-value protections remain appropriate.                                                                                                                                                                                                              |
| Other release changes                 | **Unrelated to migration rules.** Platform-variant publishing and metadata, release notes, pnpmfile fetchers, store commands, peer resolution, runtimes, local path fixes, repeat-install performance, Cargo/Python updates, linking, shims and deploy behavior do not require rewriting source settings. No defaults, credentials, machine-only settings, or user project pins are newly materialized or rewritten.                                                                                        |

Primary source references:

- [12.18 skill decision types](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/config/src/workspace_yaml/sections.rs),
  [permission application](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/config/src/workspace_yaml/permissions.rs),
  [12.17 comparison](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/crates/config/src/workspace_yaml/permissions.rs).
- [Supported platform aliases](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/package-is-installable/src/supported_architectures/platform/aliases.rs),
  [platform tag parser](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/platform-variants/src/tag.rs),
  [upstream platform tests](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/package-is-installable/src/tests/supported_platform_tags.rs),
  [previous platform parser](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/crates/package-is-installable/src/supported_architectures/platform.rs).
- [Deserializer dependency](https://github.com/pnpm/pnpm/blob/v12.18.0/Cargo.toml),
  [optional document parsing](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/config/src/workspace_yaml/parse_settings.rs).
  The null-boundary conclusion is based on observed exact-release CLI results;
  its connection to the dependency upgrade is an inference from the source diff.
- [Environment overlays](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/config/src/env_overlay/resolution.rs),
  [skill discovery](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/package-manager/src/agent_skills/discovery.rs),
  [v11 registry normalization](https://github.com/pnpm/pnpm/blob/v11.28.11/pnpm11/config/pick-registry-for-package/src/index.ts).

## Implementation

- Exact value introduction constant, with no empty top-level capability entry:
  [capabilities](../../src/constants/pnpm-capabilities.ts).
- Platform vocabulary data and validation:
  [constants](../../src/constants/supported-architectures.ts),
  [validator](../../src/features/settings/supported-architectures.ts).
- Skill and null shape validation:
  [permissions](../../src/features/settings/permissions.ts),
  [nested mappings](../../src/features/settings/pnpm-v12-mappings.ts),
  [validation integration](../../src/features/settings/versioned-values.ts).
- Public `PnpmPackagePermissions.skills` now includes `string[]`, with comments
  explaining version-specific strings and null package entries:
  [types](../../src/types/pnpm-v12.ts).
- Empty skill denial is not a subset of a nonempty approved skill list. The
  shared [cleanup comparison](../../src/utils/merge.ts) now retains an incoming
  empty decision when `discard` or `merge` keeps existing approved skills.
  `overwrite` applies the empty decision and permits source cleanup. Array
  merging otherwise retains the existing contract.
- [120 regression cases](../../tests/migration/compatibility/pnpm-12.18.test.ts)
  cover manifest and npmrc sources, exact predecessors, imprecise/prerelease and
  unknown-major declarations, explicit target precedence, invalid nested values,
  existing workspace validation, source cleanup and all three strategies.
- [Real 12.18 fixture](../../scripts/verify-pnpm-12.18.ts),
  [older permission fixture](../../scripts/verify-pnpm-permissions.ts),
  [registry key assertions](../../scripts/verify-pnpm-registry-declarations.ts),
  [tarball consumption](../../scripts/verify-pnpm-tarball-settings.ts),
  [harness](../../scripts/verify-pnpm-compatibility.ts), and
  [42-release default matrix](../../scripts/verify-pnpm-versions.ts).
- [CI matrix](../../.github/workflows/ci.yml), [README](../../README.md), and
  [toolchain pin](../../package.json) are updated. The
  [lockfile](../../pnpm-lock.yaml) changes only the pinned pnpm package and its
  native platform binary packages; no unrelated dependency upgrades.

For example, targeting 12.18 migrates this manifest section to equivalent YAML:

```json
{
  "pnpm": {
    "permissions": { "example": { "skills": ["guide", "migrate"] } },
    "supportedArchitectures": ["current", "freebsd-x64", "linux-x64-napi8"]
  }
}
```

Targeting 12.17 retains both settings with diagnostics. Conversely,
`permissions.example.skills: "review"` and `permissions.example: null` can
migrate at 12.17 and remain in their source at 12.18. Invalid existing workspace
values fail validation before any source writes.

## Verification results

| Command/check                                                                                     | Result                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                  | Passed with pnpm 12.18.0.                                                                                                                                        |
| `pnpm run release:check`                                                                          | Initial run before final diff review: lint without warnings, formatting, typechecking, and **2,486 tests in 51 files**. The feature test file then had 68 cases. |
| `pnpm run build`                                                                                  | Passed: ESM library, CLI and declarations. Existing tsdown experimental TypeScript 7 warning remains.                                                            |
| `pnpm run test:compatibility -- 11.28.10 11.28.11 12.5.0 12.10.1 12.11.0 12.16.1 12.17.0 12.18.0` | Passed for all **8 exact releases**, including every applicable fixture in the harness.                                                                          |
| `pnpm run test:compatibility`                                                                     | Follow-up passed for the complete **42-release default matrix**: 15 v11 releases and 27 v12 releases, with every applicable fixture awaited and exit code 0.     |
| `pnpm run format:check`                                                                           | Passed after the full-matrix audit and README updates.                                                                                                           |
| Direct exact-release probes                                                                       | Compared null mappings, optional section/field nulls, malformed skill values and platform tags on 12.17 and 12.18. These results drove the regression fixture.   |
| `git diff --check`                                                                                | Passed.                                                                                                                                                          |

After the final assertion refactor, separately rechecked tarball consumption
and frozen installs on 11.28.10, 11.28.11, 12.17.0 and 12.18.0; all passed.

The new fixture runs on 11.28.11, 12.17.0 and 12.18.0. It checks migration,
generated YAML, retained sources, `config list --json`, unknown-field warnings,
and parser rejection at the actual boundary. On 12.18 it packs local packages,
links only the approved nested `migrate` skill, leaves `guide` unlinked, and
installs a FreeBSD/x64 optional dependency despite a different host platform.
A frozen install preserves the lockfile. Changing the skill decision to `[]`
removes the linked skill; narrowing the platform list to `current` removes the
foreign-platform optional dependency without changing the lockfile.

Initial verification attempts exposed outdated skill-link names, null-entry
acceptance, default-registry lockfile-key expectations, and an overly broad
catalog migration assertion. These were corrected before the successful final
run. A local tarball fixture also needed its exact package ID as the permission
key. No unresolved check failures remain.

## Complete matrix follow-up

At the user's request, ran `pnpm run test:compatibility` without version
arguments on **2026-11-06, 10:52–10:59 Asia/Shanghai**. Successful completion
was observed at **10:59:01 (02:59:01 UTC)**. This used the repository's pnpm
12.18.0 pin, Node 24.22.1 and macOS, with the same implementation and fixtures
as the earlier representative run. All **42 versions passed**, and the command
exited with code **0** after all version promises and applicable fixtures
completed. The log contains exactly 42 distinct base-migration confirmations,
matching the default matrix and CI matrix with no missing or extra releases.

The executed v11 releases were **11.25.0, 11.26.0, 11.27.1, and every 11.28
patch from 11.28.0 through 11.28.11** (15 versions).

The executed v12 releases were **12.2.1, 12.3.4, 12.4.0, 12.4.2, 12.5.0,
12.5.1, 12.6.0, 12.7.0, 12.8.0, 12.8.1, 12.8.2, 12.9.0, 12.9.1,
12.10.0, 12.10.1, 12.11.0, 12.11.1, 12.11.2, 12.12.0, 12.12.1,
12.13.0, 12.14.0, 12.15.0, 12.16.0, 12.16.1, 12.17.0 and 12.18.0**
(27 versions).

This covers the harness's migration, YAML and cleanup assertions, real
configuration parsing, installation and frozen-install checks, plus each
release's applicable capabilities and boundary controls. Older releases skip
fixtures for features they do not support; a successful matrix entry means all
checks selected for that exact release completed successfully.

No new migration, fixture, network or environment failures occurred in the
full run, so no additional code fixes or compatibility rules were needed.
The follow-up changes only this audit and the README's verification statement.
The earlier release-check and build results above remain applicable to the
unchanged code; documentation formatting and `git diff --check` were checked
again after the follow-up edits.

The full local 42-release matrix is now verified for this implementation.
Hosted CI and other operating systems were not run locally. General v10
verification remains partial as described above. Verification does not include
a package release or publication.

## Final diff review and null-boundary correction

The pre-PR review found one additional defect class that the initial matrix
fixtures had not exercised: other non-optional collections also stopped
accepting null in the 12.18 YAML reader. Real 12.17/12.18 comparisons confirmed
these paths:

- Python `extras`, `groups`, `versions`, `overrides`, and `constraints`.
- `auditConfig.ignoreGhsas`.
- Versioning `fixed`, `epics`, `ignore`, and `lanes`; a null group in `fixed`;
  and `epics[].packages`.
- The legacy top-level `remoteSideEffectsCache.packages` spelling.

The migrator now retains the whole affected source setting on 12.18 rather
than generating an unreadable YAML document and deleting the source. Existing
workspace values fail before writes. These removed null forms require a
confirmed stable v12 target older than 12.18; unknown, imprecise, prerelease,
cross-major and unknown-major declarations use the conservative intersection of
the old and new reader shapes. v10/v11 behavior is unchanged. Empty arrays and
optional nulls remain valid.

The expanded [real-release fixture](../../scripts/verify-pnpm-12.18.ts) checks
each path on both sides. The unit test file now has **120 cases**, adding 52
regressions for these source-retention, preceding-release, existing-workspace,
unknown-target and empty-array cases. Both Standards review and Spec review
were repeated after the fixes and reported no remaining actionable findings.

Exact upstream types:
[Python collections](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/config/src/workspace_yaml/sections.rs),
[AuditConfig](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/config/src/setting_types.rs),
[versioning](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/versioning/src/settings.rs),
[legacy remote cache](https://github.com/pnpm/pnpm/blob/v12.18.0/pnpm/crates/config/src/workspace_yaml/sections/remote.rs).

The earlier 42-release run remains a record of its executed fixtures before
this review correction. Final checks and a fresh complete matrix run were
started after the correction; their results are recorded below.

| Final check after review fixes | Result                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run release:check`       | Passed: lint without warnings, formatting, typechecking, and **2,538 tests in 51 files**, including **120** pnpm 12.18 regression cases.                    |
| `pnpm run build`               | Passed for the library, CLI and declarations; the existing experimental TypeScript 7 warning remains.                                                       |
| `pnpm run test:compatibility`  | Passed again for **all 42 exact releases** and all applicable fixtures, with exit code **0**. This final run includes every null-boundary correction above. |

The final complete matrix ran on **2026-11-06, 11:37–11:43 Asia/Shanghai**;
successful completion was observed at **11:43:48 (03:43:48 UTC)**. It used the
same 15 v11 and 27 v12 releases listed above. The 42 distinct base-migration
confirmations match the declared matrix, and successful process completion
confirms every selected fixture finished, including the expanded 12.17 control
and 12.18 null checks. No failures remain. Documentation formatting and
`git diff --check` were also checked after updating these final results.
