# pnpm compatibility update — 2026-09-30

## Query and targets

Fresh full npm packument snapshot saved at **2026-09-30 09:28:25 Asia/Shanghai
(01:28:25 UTC)**. Read `dist-tags`, `versions`, and `time`, and sorted stable
SemVer components numerically. GitHub's 100-release page reaches v11.3.0 and
covers every release after all three baselines; no additional page was needed.

| Major | Highest published SemVer without prerelease | `latest-*` | `next-*` | npm publication (UTC) |
| ----- | ------------------------------------------- | ---------- | -------- | --------------------- |
| 10    | 10.34.6                                     | 10.34.6    | 10.34.6  | 2026-09-28 19:46:40   |
| 11    | 11.28.2                                     | 11.28.2    | 11.28.2  | 2026-09-28 17:38:08   |
| 12    | 12.8.2                                      | 12.8.1     | 12.8.2   | 2026-09-30 01:15:12   |

The default installation tag `latest` is **12.8.1**. The highest confirmed
stable release overall is **12.8.2**, currently on `next-12`, not `latest-12`.
GitHub explicitly marks it `prerelease: false`, `draft: false`, published at
01:08:47 UTC on September 30. It is therefore a compatibility target despite
its next-channel placement. Historical 12.0.0 RCs (through rc.11) and separate
`pnpr` alpha releases are not new stable targets.

Sources: [npm packument](https://registry.npmjs.org/pnpm),
[GitHub release API](https://api.github.com/repos/pnpm/pnpm/releases?per_page=100),
[12.8.2 release](https://github.com/pnpm/pnpm/releases/tag/v12.8.2).

## Baselines and existing changes

Confirmed package identity: `pnpm-settings-migrator`. The initial working tree
already modified `package.json` and `pnpm-lock.yaml`, including a development
pin upgrade from HEAD's 12.6.0 to **12.8.1** and dependency updates. Those are
user changes, not work introduced by this run. The pin before/after this run
is **12.8.1 → 12.8.1**; no dependency or lockfile edits were needed.

Node requirements remain `^22.19.0 || >=24.11.0`; CI covers 22.19.0, 24.11.0,
and 26.x. This run used Node **24.21.0** and the user-managed pnpm **12.8.1**.
Registry engine requirements are `>=22.13` for 11.28.2 and `>=18.*` for the
12.8.1/12.8.2 native wrapper packages. The existing development environment and
CI meet them.

| Major | Implemented before                                                         | Verified before                                      | Implemented / verified after                                                                                                                  |
| ----- | -------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| v10   | Legacy allowlist; source review through 10.34.5                            | Unit regressions; no real v10 run recorded           | No new migration rule required for 10.34.6; unit regressions pass; real v10 consumption remains unverified                                    |
| v11   | Major schema, trust exclusion pruning from 11.27.0                         | September 24 audit records 11.25.0, 11.26.0, 11.27.1 | Adds 11.28.0 field and user-agent boundary, 11.28.1 shape validation; real fixtures pass through 11.28.2, including both intervening releases |
| v12   | Capabilities through 12.6.0; reporter was accepted before pnpm consumed it | September 24 audit records releases through 12.6.0   | Adds 12.7.0 settings, fixes reporter boundary, retains ignored globalShims from 12.8.2; real fixtures pass for 12.7.0, 12.8.0, 12.8.1, 12.8.2 |

Evidence: `package.json`, `.github/workflows/ci.yml`,
`src/constants/pnpm-capabilities.ts`, `src/constants/pnpm-v*.ts`, target/version
resolution, settings validation, tests, and the
[September 24 audit](pnpm-settings-bump-2026-09-24.md). A capability minimum is
its introduction, not an upper support bound. These results cover the tested
fixtures and reviewed changes, not every setting in every intervening version.

## Release and source review

Examined releases after 10.34.5, 11.27.1, and 12.6.0:

| Release                                                       | GitHub publication (UTC) | Relevant result                                                                     |
| ------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| [10.34.6](https://github.com/pnpm/pnpm/releases/tag/v10.34.6) | September 29 15:44:40    | Trusted self-update configuration and signing keys; no new project setting          |
| [11.28.0](https://github.com/pnpm/pnpm/releases/tag/v11.28.0) | September 25 10:39:54    | forceIgnoresPlatform; dynamic userAgent ignored                                     |
| [11.28.1](https://github.com/pnpm/pnpm/releases/tag/v11.28.1) | September 28 07:31:11    | Validates patchedDependencies and falsy non-array packages; configuration/CLI fixes |
| [11.28.2](https://github.com/pnpm/pnpm/releases/tag/v11.28.2) | September 28 17:40:47    | Workspace installation and verifyDepsBeforeRun fixes; no additional field           |
| [12.7.0](https://github.com/pnpm/pnpm/releases/tag/v12.7.0)   | September 25 10:39:37    | forceIgnoresPlatform, publishWaitTimeout, reporter; dynamic userAgent ignored       |
| [12.8.0](https://github.com/pnpm/pnpm/releases/tag/v12.8.0)   | September 28 07:35:50    | CLI setting/precedence fixes and environment handling; no additional project field  |
| [12.8.1](https://github.com/pnpm/pnpm/releases/tag/v12.8.1)   | September 28 17:40:12    | Install/dedupe fixes; configuration crate differs only in version constant          |
| [12.8.2](https://github.com/pnpm/pnpm/releases/tag/v12.8.2)   | September 30 01:08:47    | Project globalShims ignored; childConcurrency default corrected to 5                |

Compared exact-tag source archives for the configuration crate at v12.6.0,
v12.7.0, v12.8.0, v12.8.1, and v12.8.2; v11 config readers and workspace readers
at v11.27.1, v11.28.0, and v11.28.2, with v11.28.1 source confirming the patch
validation boundary; and v10 configuration at v10.34.5/v10.34.6. Reviewed
allowlists, refused keys, nested settings, typed enums, environment processing,
configuration scope, defaults, and precedence. Upstream implementation determines
version boundaries rather than current unversioned documentation.

| Difference                                                                            | Classification                          | Migration decision                                                                                                                              |
| ------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| forceIgnoresPlatform: boolean, 11.28.0 / 12.7.0                                       | Implementation needed                   | Gate each major independently; move explicit values only. v11 defaults true and v12 defaults false.                                             |
| publishWaitTimeout: u64, 12.7.0                                                       | Implementation needed                   | Accept nonnegative safe integers; parse decimal npmrc strings. Preserve out-of-range/invalid inputs instead of losing precision. Zero is valid. |
| reporter enum consumed from workspace, 12.7.0                                         | Existing allowlist too broad            | v12 requires 12.7.0; accept default, append-only, ndjson, silent, and literal environment expressions. Preserve v11 behavior.                   |
| userAgent containing environment placeholders                                         | Implementation needed                   | From 11.28.0 / 12.7.0, retain source with incompatibility diagnostics because project configuration is ignored. Literal values still migrate.   |
| patchedDependencies object with string paths, 11.28.1                                 | Implementation needed                   | Validate whole map and retain it intact when any entry is invalid.                                                                              |
| packages rejects falsy non-arrays, 11.28.1                                            | Implementation needed                   | Require arrays of nonempty strings when non-null; reject incompatible existing workspaces before writes.                                        |
| globalShims project scope, 12.8.2                                                     | Implementation needed                   | Retain source values with incompatibility warnings; reject existing project YAML before writes. Older releases retain their behavior.           |
| childConcurrency default 5 in 12.8.2                                                  | Already covered                         | Do not emit a default into user configuration.                                                                                                  |
| packageConfigs modulesDir resolution, nested workspace warnings, package globs        | Already covered / pnpm runtime behavior | Existing values and project scope restrictions remain; no nested schema additions.                                                              |
| CLI --config values and precedence over updateConfig hooks                            | Unrelated to source migration           | Existing migration source precedence and all three strategies remain unchanged.                                                                 |
| Registry/auth precedence, self-update trust, environment syntax                       | Existing protections preserved          | Keep auth, dynamic proxies/registry destinations, and machine settings in their original locations; do not evaluate placeholders.               |
| pnpm auto-creating workspaces and refusing ignored lockfile-related manifest settings | Already covered                         | Existing migrator moves recognized manifest settings and workspaces; user package-manager pins remain untouched.                                |
| Install, lockfile, patch application, shims, performance, alternate manifest support  | Outside this migrator's source contract | No speculative conversions or unrelated dependency upgrades. Alternate package.json5/package.yaml source migration is not introduced.           |

Exact source references:

- [v12.7 workspace schema](https://github.com/pnpm/pnpm/blob/v12.7.0/pnpm/crates/config/src/workspace_yaml/settings.rs)
- [v12.7 reporter enum](https://github.com/pnpm/pnpm/blob/v12.7.0/pnpm/crates/config/src/setting_types.rs)
- [v12.7 user-agent filtering](https://github.com/pnpm/pnpm/blob/v12.7.0/pnpm/crates/config/src/workspace_yaml/env.rs)
- [v12.7 timeout tests](https://github.com/pnpm/pnpm/blob/v12.7.0/pnpm/crates/config/src/workspace_yaml/tests/publish_wait_timeout.rs)
- [v11.28 field types](https://github.com/pnpm/pnpm/blob/v11.28.0/pnpm11/config/reader/src/types.ts)
- [v11.28 user-agent handling](https://github.com/pnpm/pnpm/blob/v11.28.0/pnpm11/config/reader/src/getOptionsFromRootManifest.ts)
- [v11.28.1 patch validation](https://github.com/pnpm/pnpm/blob/v11.28.1/pnpm11/config/reader/src/getOptionsFromRootManifest.ts)
- [v11.28.1 packages validation](https://github.com/pnpm/pnpm/blob/v11.28.1/pnpm11/workspace/workspace-manifest-reader/src/index.ts)
- [v12.8.2 shim scope](https://github.com/pnpm/pnpm/blob/v12.8.2/pnpm/crates/config/src/workspace_settings.rs)
- [v12.8.2 defaults](https://github.com/pnpm/pnpm/blob/v12.8.2/pnpm/crates/config/src/defaults.rs)
- [v10.34.6 bootstrap configuration](https://github.com/pnpm/pnpm/blob/v10.34.6/config/src/packageManagerRegistries.ts)

## Implementation

Changed capability constants and the v12 baseline allowlist; added release value
validation and npmrc timeout parsing; documented public types. Added regression
files `pnpm-11.28.test.ts`, `pnpm-12.7.test.ts`, and `pnpm-12.8.test.ts` covering
exact boundaries, unsupported/imprecise targets, explicit target precedence,
source cleanup, invalid nested values, existing workspace validation, and
`discard`, `merge`, and `overwrite` conflicts.

For a confirmed 12.7+ target, these npmrc lines:

```ini
force-ignores-platform=true
publish-wait-timeout=0
reporter=silent
```

move to:

```yaml
forceIgnoresPlatform: true
publishWaitTimeout: 0
reporter: silent
```

On 12.6.0 they stay in their source with diagnostics. On 12.8.2, a source
`globalShims` value also stays in its source, with a warning; it is never deleted
as though it had migrated successfully.

The compatibility runner now explicitly rejects unsupported majors instead of
silently selecting the v12 fixture. The default matrix and CI retain all ten
older releases and add all seven new v11/v12 releases. The new
`scripts/verify-pnpm-release-settings.ts` tests actual consumption rather than
only adding version arguments. README claims now distinguish stable next-channel
support from the development pin.

## Verification

Commands used the user-managed launcher with the existing Node and PATH:

```sh
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run release:check
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run build
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run test:compatibility -- 11.28.0 11.28.1 11.28.2 12.7.0 12.8.0 12.8.1 12.8.2
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run test:compatibility -- 11.25.0 11.26.0 11.27.1 12.2.1 12.3.4 12.4.0 12.4.2 12.5.0 12.5.1 12.6.0
```

- Release checks passed: lint, formatting, strict TypeScript, **531 tests in 29 files**.
- Build passed, including declarations and CLI. tsdown emits its existing warning
  that TypeScript 7's API is experimental.
- All **17** listed real releases passed base migration, source retention,
  `config list --json`, install, and frozen-install checks in temporary workspaces.
- New release fixtures passed for all seven new versions. A packed local optional
  dependency declares an unsupported OS: `--force` skips it with
  `forceIgnoresPlatform: false`, installs it with `true`, and completes a frozen
  install without changing the lockfile. This verifies consumption, not just echo.
- All four new v12 releases passed silent-reporter output and CLI reporter
  precedence checks, plus the existing pipeline, ecosystem, autoDedupe, saveTypes,
  and task fixtures. Config listing reported each new setting without unknown-key
  warnings. The 12.8.2 fixture verifies project globalShims does not change the
  resolved configuration.
- 11.28.1 and 11.28.2 were rerun after adding real-pnpm assertions for rejection
  of malformed patch maps and `packages: false`.
- Initial checks exposed npmrc numeric-string conversion and test newline/lint
  issues; these were fixed before the passing checks. No unresolved check failure.

Limits: no real v10 execution; the runner intentionally supports v11/v12 only.
No publishing was performed: publishWaitTimeout is verified through migration,
typed config consumption, and upstream timeout validation, not a registry upload.
No CI job was dispatched; local checks ran on macOS/Node 24.21.0, while the saved
CI matrix defines the additional platforms. Broader upstream fixes outside the
fixtures are source-reviewed, not claimed as independently exercised.
