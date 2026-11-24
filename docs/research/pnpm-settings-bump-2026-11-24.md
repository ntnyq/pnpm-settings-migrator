# pnpm compatibility update — 2026-11-24

## Releases and toolchain

Fetched the full [npm packument](https://registry.npmjs.org/pnpm) at
**2026-11-24 09:36:45 Asia/Shanghai (UTC+08:00)**. Read `dist-tags`, `versions`,
and `time`, and sorted final SemVer releases by major, minor, and patch.
**12.23.0** is both npm `latest` and the highest stable release. Its channels
are `latest`, `latest-12`, and `next-12`. GitHub marks each row below as a
release with `prerelease: false`.

| Major | Highest final SemVer | `latest-*` | `next-*` | npm publication (UTC)   | GitHub publication (UTC) |
| ----- | -------------------- | ---------- | -------- | ----------------------- | ------------------------ |
| v10   | 10.34.9              | 10.34.9    | 10.34.9  | 2026-10-25 17:54:00.645 | 2026-10-25 17:54:24      |
| v11   | 11.29.0              | 11.29.0    | 11.29.0  | 2026-11-22 13:58:03.882 | 2026-11-22 13:58:26      |
| v12   | 12.23.0              | 12.23.0    | 12.23.0  | 2026-11-22 13:21:28.438 | 2026-11-22 13:22:32      |

The only new releases beyond the reviewed baselines were 11.29.0 and
12.23.0. No new major or prerelease appeared. The most recently published
prereleases on the two active lines remain 11.0.0-rc.5 and 12.0.0-rc.11.
[10.34.9 release](https://github.com/pnpm/pnpm/releases/tag/v10.34.9),
[11.29.0 release](https://github.com/pnpm/pnpm/releases/tag/v11.29.0),
[12.23.0 release](https://github.com/pnpm/pnpm/releases/tag/v12.23.0).

The checkout started clean at `adef082669996967754af92804b7cd4e0a921f29`
(migrator version 0.22.0). The development pin advances from **12.21.0 to
12.23.0**. The 12.23.0 npm package requires Node `>=18`. The project's Node
range of `^22.19.0 || >=24.11.0` and CI's compatibility runtime of 24.18.0
satisfy it. Regenerated the lockfile with pnpm 12.23.0. The diff is confined to
the managed pnpm dependency and its platform packages, including the new
Linux loong64 artifact. No dependency manifest entries were upgraded.
[Manifest](../../package.json), [lockfile](../../pnpm-lock.yaml),
[CI](../../.github/workflows/ci.yml).

## Baseline and implementation

| Major | Before                                                                                                          | After                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v10   | Source reviewed through 10.34.9. Prior native checks cover exact and wildcard override cases at that release.   | 10.34.9 remains the source baseline. Both override cases passed again. Verification remains partial.                                                     |
| v11   | Source reviewed through 11.28.13. Prior audits record executed checks for 17 releases from 11.25.0 to 11.28.13. | 11.29.0 adds stricter validation and the per-run OTP diagnostic. The applicable native harness passed at 11.28.13 and 11.29.0.                           |
| v12   | Source reviewed through 12.22.0. Prior audits record executed checks for 31 releases from 12.2.1 to 12.22.0.    | 12.23.0 adds workspace capabilities, linker and versioning shapes, and stricter validation. The applicable native harness passed at 12.22.0 and 12.23.0. |

The dated results describe representative migration coverage. Fields are
enabled at their own first supporting releases. Range, missing, prerelease,
and unknown-major targets retain the conservative schema. The migrator
keeps the target resolution and project pin behavior used by existing callers.
[November 4 v10 checks](pnpm-settings-bump-2026-11-04.md),
[November 13 verification matrix](pnpm-settings-bump-2026-11-13.md),
[November 16 verification](pnpm-settings-bump-2026-11-16.md),
[November 21 verification](pnpm-settings-bump-2026-11-21.md).

## Exact-tag review

Read the two new release notes in the GitHub API. Compared the configuration
trees in the exact source archives, then followed the setting consumers for
cache policy, linking, publishing, change intents, and release age.
The comparisons include workspace and machine settings, known and refused
keys, default values, environment and CLI precedence, and per-project
configuration. Package configuration fields retain their prior schema.
[TypeScript reader comparison](https://github.com/pnpm/pnpm/compare/v11.28.13...v11.29.0),
[Rust reader comparison](https://github.com/pnpm/pnpm/compare/v12.22.0...v12.23.0).

| Area                                  | Classification and result                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v11 field validation                  | Implemented type checks for `noProxy`, `strictSsl`, and `localAddress`, and retention of task maps containing null entries. The install policy rejects invalid `minimumReleaseAge` literals. Valid decimal strings from `.npmrc` survive migration and the new reader interprets them as numbers.                                                                                                          |
| v11 cache exclusions                  | Already covered by retaining the section. Both tags can display `sideEffectsCache.exclude` and 11.29.0 adds string-array validation. Its cache resolver still reads the read, write, and remote options. Native build cache exclusions remain a v12 feature.                                                                                                                                               |
| OTP and machine scope                 | Implemented a versioned project refusal in both releases. The migrator continues preserving auth, TLS keys, and token helpers in `.npmrc`. Global and temporary command isolation, credential forwarding and display, and TLS path changes are native behavior.                                                                                                                                            |
| v12 linker objects                    | Implemented the new isolated, hoisted, and PnP objects, checking nested keys and types. The linker applies its nested settings after corresponding flat settings. The migrator preserves both spellings when valid. `discard` and `merge` keep the existing linker type on a conflict. `overwrite` selects the incoming type and options. Options of the same type follow the existing recursive strategy. |
| v12 release time                      | Implemented project `referenceTime` with literal RFC 3339 validation and the native ten-minute allowance. Native probing confirmed that YAML timestamp validation precedes ordinary environment substitution, so an interpolated timestamp is retained instead of migrated. The environment override is read by pnpm separately.                                                                           |
| v12 release management                | Implemented `versioning.includePrivatePackages`, validating sibling fields when the new option is present. A false value excludes private packages from `pnpm change`. Other release operations continue to use their existing package selection.                                                                                                                                                          |
| v12 override diagnostics              | Implemented `warnUnusedOverrides`. The native default is true and migration only writes an explicitly supplied setting. The native warning applies to workspace overrides.                                                                                                                                                                                                                                 |
| v12 publishing and editing            | Implemented workspace `access` and `editor: null`. Publish uses the configured access before `publishConfig.access`. Explicit publish flags take precedence. The source lets workspace access strings reach the registry verbatim. `tag` was already migrated starting at 12.16. Project YAML may clear an inherited editor using null. A command string is reserved for trusted configuration.            |
| v12 proxy bypass                      | Implemented the new string or boolean validation for `noProxy`. Null leaves the setting unset. The existing policy for dynamic proxy values applies.                                                                                                                                                                                                                                                       |
| Existing setting consumers            | Already covered. pnpr, lockfile policy enforcement, peer selectors, nested hoisted layouts, runtimes, `nodeVersion` cache identity, build approvals, and publish branch interpretation change how pnpm uses existing settings. The migrator preserves the declarations.                                                                                                                                    |
| Platform variants and command options | Outside workspace field migration. The platform-variant removal affects publication manifests and lockfiles. New per-command flags and command output changes require no field conversion.                                                                                                                                                                                                                 |

Primary evidence includes the [v11 workspace reader](https://github.com/pnpm/pnpm/blob/v11.29.0/pnpm11/config/reader/src/getOptionsFromRootManifest.ts),
[v11 cache resolver](https://github.com/pnpm/pnpm/blob/v11.29.0/pnpm11/config/reader/src/getConfig/sideEffectsCache.ts),
[v12 linker options](https://github.com/pnpm/pnpm/blob/v12.23.0/pnpm/crates/config/src/node_linker.rs),
[v12 workspace validation](https://github.com/pnpm/pnpm/blob/v12.23.0/pnpm/crates/config/src/workspace_yaml/validation.rs),
[v12 publish precedence](https://github.com/pnpm/pnpm/blob/v12.23.0/pnpm/crates/cli/src/cli_args/publish/options.rs),
and [v12 versioning settings](https://github.com/pnpm/pnpm/blob/v12.23.0/pnpm/crates/versioning/src/settings.rs).
See [11.29 settings](../versions/v11/11.29.md) and
[12.23 settings](../versions/v12/12.23.md) for details.

## Updated files

- [Capability table](../../src/constants/pnpm-capabilities.ts),
  [v11 validation](../../src/features/settings/pnpm-v11-values.ts),
  [v12 linker and scalar validation](../../src/features/settings/pnpm-v12-values.ts),
  [versioning validation](../../src/features/settings/pnpm-v12-mappings.ts),
  [timestamp validation](../../src/features/settings/reference-time.ts),
  and [project scope](../../src/features/settings/project-scope.ts).
- [Workspace types](../../src/types/pnpm-v12.ts),
  [public exports](../../src/index.ts),
  and [linker merge](../../src/utils/merge.ts).
- [11.29 regressions](../../tests/migration/compatibility/pnpm-11.29.test.ts),
  [12.23 regressions](../../tests/migration/compatibility/pnpm-12.23.test.ts),
  [11.29 native fixture](../../scripts/verify-pnpm-11.29.ts),
  and [12.23 native fixture](../../scripts/verify-pnpm-12.23.ts).

## Verification

Local verification used macOS arm64, Node 26.13.1, and the declared pnpm
12.23.0. All install fixtures ran in disposable workspaces.

- `pnpm install --frozen-lockfile` passed after lockfile regeneration. pnpm
  reported the existing pending tsdown skill approval.
- `pnpm run build` built the ESM library, CLI, and declarations. tsdown emitted
  its existing warning about TypeScript 7.0 declaration generation.
- `pnpm run release:check` passed lint, formatting, typechecking, and
  **2,648 tests in 55 files**.
- A standalone 10.34.9 check ran the built CLI with
  `--target-version 10.34.9`, then `pnpm config list --json`,
  `pnpm install --no-frozen-lockfile --ignore-scripts`, and
  `pnpm install --frozen-lockfile --ignore-scripts` for each selector. The
  exact `is-number` override moved and installed 6.0.0. The unsupported
  `is-num*` selector stayed in the manifest and installed 7.0.0. Both frozen
  installs preserved their respective lockfiles.
- `pnpm run test:compatibility -- 11.28.13 11.29.0 12.22.0 12.23.0`
  passed after every applicable fixture completed.
- The 11.29 native fixture compares 11.28.13 and 11.29.0. It checks the
  release-age number reported by `config list --json`, validation failures,
  OTP scope, and a frozen install with a valid decimal age.
- The 12.23 native fixture compares 12.22.0 and 12.23.0. It checks migration
  and cleanup, config reporting without unknown-setting warnings, both linker
  forms and nested precedence, install and frozen install, an environment
  reference-time override that blocks frozen verification, private and public
  change intents, the unused override warning default, and config refusal or
  validation for OTP, editor commands, and invalid proxy bypass values.

During fixture development, pnpm 11.29.0 wrote its install error to stdout,
the private-package exclusion case needed a public package to distinguish
the package-specific error, and pnpm 12.23.0 reused its installed lockfile
after removal of the root copy. The fixture assertions now check the correct
output channel and run the warning check without either lockfile.

The [default matrix](../../scripts/verify-pnpm-versions.ts) and
[CI matrix](../../.github/workflows/ci.yml) have the same 50 unique entries.
The other 46 entries retain their dated historical results. Local native
checks cover the reported boundaries and representative installs. Publishing
precedence was reviewed in tagged source and workspace access was checked in
config reporting. No registry publication or Linux and Windows CI run was
part of this update.

## Follow-up removal of the pnpm 10 target

A second [npm registry query](https://registry.npmjs.org/pnpm) at **11:54:17
Asia/Shanghai (UTC+08:00)** confirmed that `latest` and the highest stable
release were still **12.23.0**. The `latest-*` and `next-*` tags for v10, v11,
and v12 still matched the table above. The development pin stays at 12.23.0.

- **v10** previously had partial native verification at 10.34.9. The CLI and
  library now reject the v10 selector, explicit versions below 11, and detected
  majors below 11 in auto mode. Projects pinned to pnpm 10 can select an
  explicit supported target to migrate legacy settings for an upgrade.
- **v11 and v12** retain their base setting names and exact-version capability
  gates. With no detected major, auto mode uses the base v11 schema.

`pnpm install --frozen-lockfile`, `pnpm run release:check` (2,621 tests in 54
files), and `pnpm run build` passed. The native harness passed for **11.25.0,
11.29.0, 12.2.1, and 12.23.0** with `XDG_CONFIG_HOME` set to a temporary
directory. The first native run picked up the host's `globalPackagesConfig`,
which pnpm 11 warned it could not read. The 50-release default and CI matrices
retain their existing entries. This follow-up ran the four releases listed
above and their applicable fixtures.
