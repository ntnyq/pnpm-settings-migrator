# pnpm compatibility update — 2026-11-04

## Release channels and baselines

At **2026-11-04 14:28:53 Asia/Shanghai (06:28:53 UTC)**, npm’s default
`latest` was **12.16.1**. The highest published SemVer without a prerelease
suffix was **12.17.0** on `next-12`. The two new pnpm releases since the
previous audit are both final releases on GitHub. The first page of 60 GitHub
releases reached v11.25.0 and covered the interval. Versions were sorted by
numeric SemVer components from the full npm packument and dated using its
`time` entries. [npm metadata](https://registry.npmjs.org/pnpm),
[GitHub release metadata](https://api.github.com/repos/pnpm/pnpm/releases?per_page=60).

| Major | Highest stable | npm channel       | `latest-*` | `next-*` | npm publication (UTC) | GitHub publication (UTC) |
| ----- | -------------- | ----------------- | ---------- | -------- | --------------------- | ------------------------ |
| v10   | 10.34.9        | Both v10 channels | 10.34.9    | 10.34.9  | Oct 25 17:54:00       | Oct 25 17:54:24          |
| v11   | 11.28.10       | `next-11`         | 11.28.9    | 11.28.10 | Oct 30 15:30:50       | Oct 30 21:18:23          |
| v12   | 12.17.0        | `next-12`         | 12.16.1    | 12.17.0  | Oct 30 14:23:51       | Oct 30 14:24:43          |

There was no newer major or new pnpm prerelease. The most recently published
v12 prerelease was 12.0.0-rc.11. The repository started clean at `a431223`.
The development pin remains **pnpm@12.16.1**. The repository requires Node
`^22.19.0 || >=24.11.0` and uses Node 24.18.0 for compatibility CI. Local
checks used Node 24.22.1. The dependency versions and lockfile did not need
updating. [Package manifest](../../package.json), [CI](../../.github/workflows/ci.yml).

| Major | Implementation and recorded verification before this audit                                                                       | Result of this audit                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v10   | Legacy allowlist and unit tests, source reviewed through 10.34.9. No recorded real migration check.                              | Same release. Guard unsupported override selectors. Real 10.34.9 CLI, config and install checks cover two override cases. General v10 coverage remains outside the harness. |
| v11   | Last new rule at 11.28.9. The October audit records real fixtures through that release.                                          | Reviewed 11.28.10. Its project schema and override matcher have no additions. Older targets now retain v12.17-only override maps.                                           |
| v12   | 12.16.0 fields and validation, source and real fixtures through 12.16.1. Override selectors previously passed through unchecked. | 12.17.0 adds two workspace fields and extends override selectors. The preceding release and concurrent v11 release serve as controls.                                       |

The October audit records passes for its 38-release checkout. The baseline
also comes from the major allowlists, target resolver, nested value checks,
migration tests and the real-release harness. Capability minima identify the
first supporting release. [October 29 audit](pnpm-settings-bump-2026-10-29.md),
[capabilities](../../src/constants/pnpm-capabilities.ts),
[version resolution](../../src/features/compatibility/target.ts).

## Exact-tag findings

Read both intervening release notes and compared the source archives for
11.28.9 → 11.28.10 and 12.16.1 → 12.17.0. For 10.34.9, additionally checked
the override parser and read-package hook against real installation results.
[11.28.10 notes](https://github.com/pnpm/pnpm/releases/tag/v11.28.10),
[12.17.0 notes](https://github.com/pnpm/pnpm/releases/tag/v12.17.0),
[v10 overrider](https://github.com/pnpm/pnpm/blob/v10.34.9/hooks/read-package-hook/src/createVersionsOverrider.ts).

| Difference                            | Migration decision and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12.17 `gitTagVersion`                 | Migrate explicit booleans or null. False disables the version commit and tag. The upstream default is true. v11 already consumes the field. [Workspace reader](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/crates/config/src/workspace_yaml/settings.rs), [version command](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/crates/cli/src/cli_args/version.rs).                                                                                                                                                                                                                                                                                                                                                                                                           |
| 12.17 `publishBranch`                 | Migrate a string or null from root project settings. The CLI flag overrides the environment setting, which overrides workspace YAML. When unset, pnpm allows main or master. The 12.16.1 publish documentation already showed this key in an example, but its workspace reader ignored it. [12.16.1 documentation](https://github.com/pnpm/pnpm/blob/v12.16.1/pnpm/docs/cli/publish.md), [12.17 application](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/crates/config/src/workspace_yaml/apply.rs), [12.17 scope](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/crates/config/src/workspace_yaml/workspace_scope.rs), [publish precedence](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/docs/cli/publish.md#publishbranch).                                          |
| New `overrides` selectors             | Gate parent and target name globs and target-only `:prod`, `:optional`, `:peer` at 12.17.0. Retain the complete map on unsupported targets or invalid inputs, including malformed groups, wildcard convergence selectors and non-string replacements. Ordinary `foo@*` ranges work on both sides. 12.17 rejects a colon in the remaining version specifier, so `foo@link:./old` stays in its source at 12.17 and can migrate on 12.16.1. Protocols in replacement values are preserved. The same parser applies to project overrides. [Parser and its tests](https://github.com/pnpm/pnpm/tree/v12.17.0/pnpm/crates/config-parse-overrides/src), [project configuration](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/crates/config/src/workspace_yaml/package_configs.rs). |
| Overlapping overrides                 | pnpm prefers parent-qualified rules, exact names, a matching dependency group and more specific ranges. For ties, declaration order decides. Preserve that order during YAML sorting, Yarn resolution merging, conflict handling and include writes. A source whose order loses a conflict stays available on rerun. [Selector matching and precedence](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/crates/package-manager/src/overrides/selectors.rs).                                                                                                                                                                                                                                                                                                                    |
| Peer and optional dependency behavior | pnpm now leaves a peer range alone for non-range replacements. Removing an optional dependency also removes a duplicate regular declaration. These are resolver changes. Preserve user replacement values. `ignoredOptionalDependencies` and `peerDependencyRules` are deprecated but still consumed. Keep them alongside explicit overrides, including with `replaceDeprecated`. Rewriting ignore patterns can change precedence, and replacing a peer warning rule can change the installed graph. [Dependency resolution](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/docs/settings/dependency-resolution.md), [peer policies](https://github.com/pnpm/pnpm/blob/v12.17.0/pnpm/docs/settings/peer-dependencies.md#peerdependencyrules).                                 |
| Other 12.17 changes                   | New CLI spellings for TLS/local address use the existing 12.16 workspace fields. The YAML error code, env-file handling, catalog tag selection, runtime/Cargo/Python updates, file modes, linking, local dependency freshness and store fixes require no new rules. The Mac backup type moved. Refused keys, machine trust, config includes and per-project field lists retain their scope. [Config diff](https://github.com/pnpm/pnpm/compare/v12.16.1...v12.17.0), [12.17 release](https://github.com/pnpm/pnpm/releases/tag/v12.17.0).                                                                                                                                                                                                                                      |
| 11.28.10                              | Bootstrap can recover readable pin-related settings from workspace and global YAML, and CLI settings and `lockfileDir` reach version switching consistently. The ordinary workspace schema is unchanged. Keep full migration validation and project pins. Store pruning, lockfile freshness, catalog preservation, package packing, shims and runtime downloads need no transformation. [Config reader](https://github.com/pnpm/pnpm/tree/v11.28.10/pnpm11/config/reader/src/getConfig), [workspace reader](https://github.com/pnpm/pnpm/blob/v11.28.10/pnpm11/workspace/workspace-manifest-reader/src/index.ts), [11.28.10 release](https://github.com/pnpm/pnpm/releases/tag/v11.28.10).                                                                                     |

## Implementation and verification

The gate, public field types and source selection are in the
[capability table](../../src/constants/pnpm-capabilities.ts),
[workspace types](../../src/types/pnpm-v12.ts),
[scalar validation](../../src/features/settings/versioned-values.ts) and
[override validation](../../src/features/settings/overrides.ts).
Order-sensitive comparisons feed [merge and cleanup](../../src/utils/merge.ts)
and [YAML rendering](../../src/utils/yaml-document.ts), including local and
read-only include ownership. [Regression tests](../../tests/migration/compatibility/pnpm-12.17.test.ts),
[release fixture](../../scripts/verify-pnpm-12.17.ts), [CI matrix](../../.github/workflows/ci.yml).

Target resolution still respects an explicit version over the project pin.
When a v12 target has no confirmed stable version, selectors must work with
both parsers. For example, `foo@*:optional` and `foo@link:./old` both stay in
their sources, while `foo@*` with a `link:./new` replacement migrates.

Local verification used macOS, Node 24.22.1 and the repository's pnpm 12.16.1.

| Check                                       | Result                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run release:check`                    | Lint, formatting, typechecking and all 2,418 tests in 50 files passed, including 61 new regression cases.                                                                                                                                                                                                              |
| `pnpm run build`                            | Built the ESM library, CLI and declarations. tsdown emitted its experimental TypeScript 7 warning.                                                                                                                                                                                                                     |
| `pnpm run test:compatibility -- <versions>` | Ran the 40 exact releases below in batches. All applicable real-release fixtures passed. The 12.17 fixture ran on 11.28.10, 12.16.1 and 12.17.0.                                                                                                                                                                       |
| Standalone 10.34.9 CLI checks               | Ran the built CLI, `pnpm config list --json`, install and frozen install in two temporary projects. An exact override migrated and changed the lockfile target. A package-name glob stayed in the manifest and the original dependency remained in the lockfile. General v10 migration is outside the v11/v12 harness. |

The v11 runs covered **11.25.0, 11.26.0, 11.27.1, and every 11.28 patch from
11.28.0 through 11.28.10**. The v12 runs covered **12.2.1, 12.3.4, 12.4.0,
12.4.2, 12.5.0, 12.5.1, 12.6.0, 12.7.0, 12.8.0, 12.8.1, 12.8.2, 12.9.0,
12.9.1, 12.10.0, 12.10.1, 12.11.0, 12.11.1, 12.11.2, 12.12.0, 12.12.1,
12.13.0, 12.14.0, 12.15.0, 12.16.0, 12.16.1 and 12.17.0**.

On 12.17.0, `pnpm version patch` changed the manifest version while leaving
the Git commit and tag list intact. `pnpm publish --dry-run` accepted the
configured branch and rejected an explicit conflicting CLI flag. The install
fixture checked config output, the dependency selected by tied globs, a
parent-name glob, all three dependency groups, and an unchanged lockfile on
frozen install. On 11.28.10 and 12.16.1, a directly written name glob had no
effect and a literal `link:` selector matched. On 12.17.0, pnpm rejected
that literal selector with `ERR_PNPM_INVALID_SELECTOR`.
