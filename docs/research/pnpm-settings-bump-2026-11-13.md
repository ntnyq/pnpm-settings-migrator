# pnpm compatibility update — 2026-11-13

## Query, channels and baseline

Fetched the full npm packument at **2026-11-13 09:41:21 Asia/Shanghai
(01:41:21 UTC)**, reading `dist-tags`, `versions`, and `time`. Sorted final
SemVer versions by numeric major/minor/patch. npm **`latest` remains 12.18.0**;
the highest final SemVer is **12.20.0 on `next-12`**. GitHub marks both newly
published releases, 12.19.0 and 12.20.0, `prerelease: false`. They are therefore
confirmed stable compatibility targets, despite the next channel. No new major
or pnpm prerelease appeared; the last v12 prerelease remains 12.0.0-rc.11.
[npm metadata](https://registry.npmjs.org/pnpm),
[GitHub release metadata](https://api.github.com/repos/pnpm/pnpm/releases?per_page=100).

| Major | Highest final SemVer | `latest-*` | `next-*` | Highest version npm publication (UTC) |
| ----- | -------------------- | ---------- | -------- | ------------------------------------- |
| v10   | 10.34.9              | 10.34.9    | 10.34.9  | 2026-10-25 17:54:00                   |
| v11   | 11.28.11             | 11.28.9    | 11.28.11 | 2026-11-05 00:56:08                   |
| v12   | 12.20.0              | 12.18.0    | 12.20.0  | 2026-11-12 00:23:01                   |

12.19.0 was published to npm on November 10 at 01:24:37 UTC and GitHub at
01:25:14 UTC. 12.20.0 reached GitHub on November 12 at 00:23:41 UTC. Read both
release notes in full. The 100-entry GitHub API page extends back to
`pnpr@0.1.0-alpha.5`, covering the entire interval; pagination was unnecessary.
Compared extracted exact-tag source archives for 12.18.0, 12.19.0 and 12.20.0,
including every changed file in the configuration crate, plus affected lockfile
and override consumers.
[12.19 notes](https://github.com/pnpm/pnpm/releases/tag/v12.19.0),
[12.20 notes](https://github.com/pnpm/pnpm/releases/tag/v12.20.0).

The working tree started clean at `cec89b515cb305e28c047f3e29874d9d8bacaed5`.
The development toolchain pin is **pnpm@12.18.0 → pnpm@12.18.0**, following
`latest`. No dependency or lockfile updates are needed. The v12 npm wrappers
declare Node `>=18`; the repository keeps its stricter
`^22.19.0 || >=24.11.0` requirement. CI retains Node 22.19.0, 24.11.0 and 26.x,
and 24.18.0 for the loaded-linker compatibility harness. Local checks use macOS
and Node 24.22.1.
[Manifest](../../package.json), [CI](../../.github/workflows/ci.yml).

| Major | Implemented and source-reviewed baseline                                          | Prior executed verification                                                                                                  | This update                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v10   | Legacy allowlist/override selector validation; reviewed through 10.34.9           | November 4 records CLI/config/install/frozen checks for two override cases on 10.34.9; full migration is outside the harness | No new release or migration rule; previous partial verification unchanged, not rerun                                                                       |
| v11   | Last capability additions at 11.28.9; reviewed through 11.28.11                   | November 6 records the 15-release v11 matrix through 11.28.11                                                                | No new release or rule; all 15 v11 matrix releases passed again in the follow-up run                                                                       |
| v12   | Exact value boundaries through 12.18.0, including skills/platform/null validation | November 6 records the 27-release v12 matrix through 12.18.0                                                                 | Implement exact 12.19 additions; source-reviewed through 12.20.0; verify all 29 v12 matrix releases, including the 12.18 predecessor and both new releases |

These are separate implementation and verification baselines. A capability
minimum is not an upper support limit, and a CI matrix entry alone does not
prove a passed run. Earlier releases remain covered only by their dated audit
results, not by an assertion that every published release has been executed.
[November 6 audit](pnpm-settings-bump-2026-11-06.md),
[capabilities](../../src/constants/pnpm-capabilities.ts),
[target resolution](../../src/features/compatibility/target.ts),
[validators](../../src/features/settings/pnpm-v12-values.ts).

## Exact-tag differences and decisions

| Difference                            | Classification and migration decision                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12.19 `projectScopedOptionalPeers`    | **Implementation needed.** Add the workspace-only field at exactly 12.19.0, boolean/null validation and public type. Default false is not inserted. Root dependencies still count when root peer resolution is enabled; `dedupePeerDependents: false` already implies scoping.                                                                       |
| 12.19 `lockfile.format`               | **Implementation needed.** Accept `v9`, experimental `v13`, null and ordinary deferred environment placeholders from 12.19.0. Older targets retain the entire lockfile object, including existing siblings. Validate unknown keys and sibling types. The migrator does not generate or convert lockfiles.                                            |
| Configuration reading and scope       | **Already covered.** The new peer field is cleared outside workspace scope. `packageConfigs`, permission schemas, known/refused key helpers, configuration types and nodeLinker options are otherwise byte-identical across the three tags. Keep new settings out of subproject migration.                                                           |
| Registry environment URLs             | **Already covered.** 12.19 changes workspace/project-npmrc/config-dependency placeholders from ignored URLs to `ERR_PNPM_REGISTRY_ENV_NOT_EXPANDED`. Dynamic proxy/pnprServer/userAgent values now warn when ignored. Existing source retention, unsafe existing-workspace rejection and credential protections stay effective.                      |
| Loaded linker/cache and architectures | **No new migration rule.** 12.19 automatically materializes builds/filesystem users, consumes cached builds, stores foreign-platform transitive archives and supports single-platform variant linking. Accepted configuration shapes remain unchanged.                                                                                               |
| 12.20 v13 directory specifiers        | **Verification needed, no new capability.** Record local directory dependency inputs and reject changed ranges during frozen installs. Add a fixture for 12.19.0 and 12.20.0; retain the existing 12.19 format boundary.                                                                                                                             |
| 12.20 overrides                       | **Already representable.** Catalog ranges are dereferenced during selector matching; workspace-path overrides reach transitive registry dependencies. Preserve selectors, values and precedence without a new rewrite.                                                                                                                               |
| 12.20 pnpr protocols                  | **No source-setting change.** Server capabilities must confirm requested policies; pnpr 0.1.0-alpha.19 and earlier no longer work for affected services. Do not rewrite server versions or invent protocol fields.                                                                                                                                   |
| Other fixes                           | **Unrelated to migration rules.** Fund/store commands, credential redaction, workspace engines/platform checks, hoisted/custom-module linking, deploy, runtime reinstalls, lockfile peer/cycle resolution, Windows import defaults/shims, network robustness, CI detection and bundled node-gyp changes do not alter source setting representations. |

The 12.19→12.20 configuration crate diff contains only CI detection additions,
the version constant and a Python registry closure cleanup. No new fields,
enums, deprecations, removals or scope changes occur there. No empty 12.20
capability entry was added.

Primary exact-tag evidence:

- [12.19 workspace fields](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/config/src/workspace_yaml/settings.rs),
  [lockfile section](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/config/src/workspace_yaml/sections.rs),
  [application](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/config/src/workspace_yaml/apply.rs),
  [scope](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/config/src/workspace_yaml/workspace_scope.rs).
- [Peer defaults and semantics](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/config/src/settings.rs),
  [effective policy](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/config/src/layout.rs),
  [upstream peer tests](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/cli/tests/suite/peers/workspace_root.rs).
- [v9/v13 enum](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/lockfile/src/next_format.rs),
  [12.20 directory input tests](https://github.com/pnpm/pnpm/blob/v12.20.0/pnpm/crates/cli/tests/suite/lockfile_format_v13.rs),
  [override consumption](https://github.com/pnpm/pnpm/blob/v12.20.0/pnpm/crates/package-manager/src/overrides/selectors.rs).
- [Workspace placeholder handling](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/config/src/workspace_yaml/env.rs),
  [project npmrc](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/config/src/auth_sources.rs),
  [config dependency includes](https://github.com/pnpm/pnpm/blob/v12.19.0/pnpm/crates/config/src/workspace_yaml/includes.rs).
- [12.20 configuration](https://github.com/pnpm/pnpm/tree/v12.20.0/pnpm/crates/config/src),
  [pnpr policy verification](https://github.com/pnpm/pnpm/blob/v12.20.0/pnpm/crates/pnpr-client/src/resolve/applied_policies.rs).

The target-tag source and observed exact-release CLI behavior agree. pnpm's YAML
reader can coerce some quoted boolean strings; this update follows the existing
migrator contract of retaining non-boolean scalar source values. Ordinary format
placeholders remain deferred, like other lockfile enum placeholders.

## Implementation and examples

- [Capability boundary](../../src/constants/pnpm-capabilities.ts),
  [nested validation](../../src/features/settings/pnpm-v12-values.ts),
  [public settings types](../../src/types/pnpm-v12.ts).
- [Migration regressions](../../tests/migration/compatibility/pnpm-12.19.test.ts)
  cover manifest/devEngines inference, explicit precedence, old majors, ranges,
  prereleases, unknown majors, nested invalid values, null/default forms,
  npmrc sections, subproject scope, validation before writes and all strategies.
- [12.19 real fixture](../../scripts/verify-pnpm-12.19.ts),
  [12.20 real fixture](../../scripts/verify-pnpm-12.20.ts),
  [harness](../../scripts/verify-pnpm-compatibility.ts),
  [default matrix](../../scripts/verify-pnpm-versions.ts),
  [CI matrix](../../.github/workflows/ci.yml).
- [12.19 notes](../versions/v12/12.19.md),
  [12.20 notes](../versions/v12/12.20.md),
  [version navigation](../versions/README.md).

For a project targeting 12.19.0 or 12.20.0, this manifest section migrates to
the equivalent YAML below and is removed from the manifest:

```json
{
  "pnpm": {
    "projectScopedOptionalPeers": true,
    "lockfile": { "format": "v13" }
  }
}
```

```yaml
projectScopedOptionalPeers: true
lockfile:
  format: v13
```

At 12.18.0 both settings stay intact in the manifest with diagnostics. A lockfile
object with an invalid format also stays whole, including valid siblings.
Conflicting values stay in the source under `discard` and `merge`; `overwrite`
replaces conflicting leaves while preserving nonconflicting destination
siblings. INI sections remain conservatively retained after migration, matching
the documented cleanup contract. No user project pin, credentials, global-only
setting or upstream default is rewritten.

## Verification results

| Command/check                                                                 | Result                                                                                                                                                         |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run release:check`                                                      | Passed: lint without warnings, formatting, strict typechecking, 2,580 tests in 52 files, including 42 new migration cases.                                     |
| `pnpm run build`                                                              | Passed: ESM library, CLI and declarations. Existing tsdown warning about the TypeScript 7.0 declaration generator remains.                                     |
| New exact-release fixtures, invoked directly with the harness runner contract | Passed for 12.18.0, 12.19.0 and 12.20.0. The 12.20 directory fixture runs on 12.19.0 and 12.20.0.                                                              |
| `pnpm run test:compatibility -- 11.28.11 12.18.0 12.19.0 12.20.0`             | Passed, exit code 0: all applicable fixtures on all four exact releases, including config parsing, migrations, source retention, installs and frozen installs. |
| `pnpm run test:compatibility`                                                 | Follow-up passed, exit code 0: the complete 44-release default matrix (15 v11, 29 v12), with every applicable fixture awaited.                                 |
| `git diff --check`                                                            | Passed after final source and documentation review.                                                                                                            |

The new consumption fixture packs local optional-peer packages, installs them in
two workspace projects, and verifies actual peer resolution with Node for both
v9 and v13. Hoisting is disabled to prevent phantom access from being mistaken
for a peer binding. It checks the policy recorded in the lockfile and unchanged
frozen installs. v13's `projects` representation and extra package-manager
lockfile documents are handled explicitly. Initial fixture assertions exposed
these two test assumptions and were corrected; no migration implementation
failure was found. The directory fixture proves 12.20 rejects a changed local
dependency range even when the existing version still matches, while 12.19
accepts it, and checks successful regeneration followed by frozen installation.

The default/CI matrix contains **44 releases** (15 v11, 29 v12). Following the
initial four-release verification, the complete matrix passed in the follow-up
run below. The older 42-release result remains dated November 6. v10 remains
only partially verified.
New pnpr server protocol interoperability, loaded-linker automatic materialization
and cross-platform variant behavior were source-reviewed, not independently
exercised as new features here; they need no new migration representation.
This report records local verification; remote CI results are tracked separately.

## Full-matrix follow-up — 2026-11-13

Ran `pnpm run test:compatibility` from **10:02:15 to 10:11:31 Asia/Shanghai**
using the existing pnpm 12.18.0 development pin on macOS with Node 24.22.1.
The unchanged harness selected its complete default matrix. Confirmed that the
CI and default version lists match exactly, and checked all 44 unique base
migration completion markers against that list. The process exited **0** after
every version and its applicable conditional fixtures completed; there were no
failed or skipped applicable checks. Version-inapplicable fixtures keep their
existing early-return behavior.

The log contains **283 completed fixture-group markers**. These are progress
groups, not a unit-test count. This follow-up changes verification records only;
it adds no migration behavior. The exact releases executed were:

| Major | Executed releases                                                                                                                                                                                                                                      | Result                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| v11   | 11.25.0, 11.26.0, 11.27.1, 11.28.0, 11.28.1, 11.28.2, 11.28.3, 11.28.4, 11.28.5, 11.28.6, 11.28.7, 11.28.8, 11.28.9, 11.28.10, 11.28.11                                                                                                                | All applicable fixtures passed |
| v12   | 12.2.1, 12.3.4, 12.4.0, 12.4.2, 12.5.0, 12.5.1, 12.6.0, 12.7.0, 12.8.0, 12.8.1, 12.8.2, 12.9.0, 12.9.1, 12.10.0, 12.10.1, 12.11.0, 12.11.1, 12.11.2, 12.12.0, 12.12.1, 12.13.0, 12.14.0, 12.15.0, 12.16.0, 12.16.1, 12.17.0, 12.18.0, 12.19.0, 12.20.0 | All applicable fixtures passed |

Log SHA-256 for this local run: `111dfd4c485bf549a270d19c7fff5c4bc56e61225194a8b46e58293f22f69be7`.
