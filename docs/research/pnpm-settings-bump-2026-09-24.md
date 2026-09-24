# pnpm compatibility update — 2026-09-24

## Query and release channels

Fresh npm registry query: **2026-09-24 09:36:36 Asia/Shanghai
(01:36:36 UTC)**. Read the full packument's `dist-tags`, `versions`, and `time`;
sorted numeric SemVer components rather than publication dates or strings.

| Major | Highest published non-prerelease SemVer | `latest-*` | `next-*` | npm publication (UTC) |
| ----- | --------------------------------------- | ---------- | -------- | --------------------- |
| 10    | 10.34.5                                 | 10.34.5    | 10.34.5  | 2026-07-10 11:32:36   |
| 11    | 11.27.1                                 | 11.27.1    | 11.27.1  | 2026-09-20 21:38:06   |
| 12    | 12.6.0                                  | 12.6.0     | 12.6.0   | 2026-09-22 17:08:08   |

The default installation tag `latest` and highest stable release overall are
both **12.6.0**. Although it is also tagged `next-12`, GitHub explicitly marks
v12.6.0 as `prerelease: false` and `draft: false`; it was published there at
2026-09-22 17:08:42 UTC. There is no newer candidate on the supported majors'
next channels. Older v12 RCs and the separate `pnpr` alpha releases were not
selected as targets.

Sources: [npm packument](https://registry.npmjs.org/pnpm),
[official release list](https://api.github.com/repos/pnpm/pnpm/releases?per_page=30),
[12.6.0 release](https://github.com/pnpm/pnpm/releases/tag/v12.6.0).
The first unauthenticated GitHub request hit a rate limit; authenticated `gh api`
succeeded. The first 30 releases cover the entire interval after the v11/v12
baselines, so pagination was unnecessary. npm metadata contains exactly one
v12 stable release after 12.5.1: 12.6.0. There are no newer v10/v11 releases.

## Repository baseline

The working tree was clean. `package.json#name` is `pnpm-settings-migrator`.
The development pin was already **pnpm@12.6.0** at HEAD and remains unchanged.
Node requirements remain `^22.19.0 || >=24.11.0`; CI covers 22.19.0, 24.11.0,
and 26.x. This run used Node 24.21.0 and pnpm 12.6.0. No dependency or lockfile
updates were necessary. The existing `@pnpm/types` dependency lacks the newly
added public fields, which are supplemented locally.

| Major | Implementation before                                                                                                              | Verification before                                                                    | Result of this run                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| v10   | Legacy allowlist in `src/constants/pnpm-v10.ts`; 10.34.5 was inspected in the September 10 audit                                   | Unit regressions; no recorded real 10.34.5 install verification in the current harness | Unchanged implementation; unit regressions pass. Real v10 consumption remains unverified           |
| v11   | Major schema plus `trustPolicyExcludePrune` from 11.27.0                                                                           | September 22 audit records successful runs of 11.25.0, 11.26.0, 11.27.1                | Same implementation; all three real releases reverified                                            |
| v12   | Capabilities through 12.5.1; a unit case using 12.6.0 only exercised older shapes. `progress`/`loglevel` were accepted too broadly | September 22 audit records successful runs through 12.5.1                              | Adds the 12.6.0 changes below, fixes older v12 boundaries, and extends real verification to 12.6.0 |

Evidence: `package.json`, `.github/workflows/ci.yml`,
`src/constants/pnpm-capabilities.ts`, `src/features/compatibility/target.ts`,
`src/features/settings/versioned-values.ts`, the compatibility scripts,
and [the prior verification record](pnpm-latest-settings-audit-2026-09-22.md).
The README's 12.5.1 development-pin claim was stale and has been corrected.
These are tested releases and audited capabilities, not proof of every setting
in every older minor. The unchanged real verification harness supports v11/v12;
passing it a v10 argument would incorrectly select the v12 fixture.

## Source comparison and decisions

Read the complete 12.6.0 release notes and diffed the complete configuration
crate from the exact **v12.5.1** and **v12.6.0** source archives. GitHub's compare
API returned its 300-file limit, so it was not used as an exhaustive diff.
The archive comparison includes workspace schemas, nested sections,
`packageConfigs`, refused keys, typed enums, environment overlays, resolved
configuration, precedence, and validation.

| Change                                                                                                       | Classification                   | Migrator behavior                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `autoDedupe: boolean`                                                                                        | Implementation needed            | Migrates only with a confirmed stable v12 target >=12.6.0                                                                               |
| `saveTypes: boolean`                                                                                         | Implementation needed            | Same boundary; retains invalid values                                                                                                   |
| `tasks.*.priority`                                                                                           | Implementation needed            | Adds the task field at 12.6.0 and validates a signed 32-bit integer; retains the entire source `tasks` object if invalid or unsupported |
| `progress: boolean`                                                                                          | Existing allowlist too broad     | Restricts v12 migration to 12.6.0, when this field is first consumed; preserves v11 behavior                                            |
| `loglevel`                                                                                                   | Existing allowlist too broad     | Same v12 boundary; accepts `silent`, `error`, `warn`, `info`, `debug`, and preserves environment expressions for pnpm to resolve        |
| `tagVersionPrefix: string`                                                                                   | Implementation needed            | Adds 12.6.0 support, preserving an empty prefix                                                                                         |
| `macosBackup`                                                                                                | Implementation needed            | Global-only: retained in source and classified as project-refused; never applied to the machine by the migrator                         |
| Catalog `file:`/`link:` and bare paths; relative override paths                                              | Already covered                  | Preserve strings verbatim; pnpm resolves them relative to the workspace                                                                 |
| Enum environment fallback expansion                                                                          | Already covered                  | Preserve expressions; do not evaluate the user's environment or relax credential/proxy protections                                      |
| `packageConfigs` custom modules directory handling                                                           | Already covered                  | No field/shape change; existing real fixtures verify custom directory consumption                                                       |
| `storeDir` global tilde expansion, credential warning improvements, log/hook precedence fixes                | Upstream consumption changes     | No value rewrite or new default materialization                                                                                         |
| Relocatable modules, install/lockfile fixes, task queue fairness, CLI aliases, cache commands, Windows fixes | Unrelated to settings conversion | No migration rule; exercise installs/frozen installs and a priority-bearing task                                                        |
| `package.yaml` editing                                                                                       | Outside current source contract  | Migrator continues reading `package.json`, `.npmrc`, and workspace YAML; does not add a manifest conversion feature                     |

No field removals or renames were found in this interval. Existing source
precedence and `discard`, `merge`, and `overwrite` semantics are unchanged.
The new capability requires a confirmed exact stable version; ranges, missing
versions, prereleases, and unknown majors do not acquire these fields.
No changes were made to user project package-manager pins or upstream defaults.

Exact-tag source links:

- [12.5.1 workspace settings](https://github.com/pnpm/pnpm/blob/v12.5.1/pnpm/crates/config/src/workspace_yaml/settings.rs)
- [12.6.0 workspace settings](https://github.com/pnpm/pnpm/blob/v12.6.0/pnpm/crates/config/src/workspace_yaml/settings.rs)
- [12.6.0 task shapes](https://github.com/pnpm/pnpm/blob/v12.6.0/pnpm/crates/config/src/workspace_yaml/sections.rs)
- [12.6.0 task validation](https://github.com/pnpm/pnpm/blob/v12.6.0/pnpm/crates/config/src/workspace_yaml/validation.rs)
- [12.6.0 log levels](https://github.com/pnpm/pnpm/blob/v12.6.0/pnpm/crates/config/src/setting_types.rs)
- [12.6.0 refused keys](https://github.com/pnpm/pnpm/blob/v12.6.0/pnpm/crates/config/src/refused_keys.rs)
- [12.6.0 project/global precedence](https://github.com/pnpm/pnpm/blob/v12.6.0/pnpm/crates/config/src/workspace_settings.rs)
- [12.6.0 per-project settings](https://github.com/pnpm/pnpm/blob/v12.6.0/pnpm/crates/config/src/workspace_yaml/package_configs.rs)

Example: with `packageManager: "pnpm@12.6.0"`, these legacy manifest settings:

```json
{
  "pnpm": {
    "autoDedupe": true,
    "saveTypes": true,
    "tasks": { "build": { "priority": -1 } }
  }
}
```

move to workspace YAML and are removed from the source:

```yaml
autoDedupe: true
saveTypes: true
tasks:
  build:
    priority: -1
```

For a 12.5.1 target, those source fields remain intact with incompatibility
diagnostics. Existing unsupported workspace values fail before any writes.

## Changed files

- `src/constants/pnpm-capabilities.ts`, `pnpm-v12.ts`, `settings-fields.ts`:
  exact release boundary, inherited-field correction, global-only classification.
- `src/features/settings/versioned-values.ts`: scalar and nested priority checks.
- `src/types/pnpm-v12.ts`: public workspace and task fields.
- `tests/migration/compatibility/pnpm-12.6.test.ts`: source cleanup, previous
  release, uncertain targets, invalid shapes, existing workspaces, public types,
  and all three merge strategies.
- `scripts/verify-pnpm-install-settings.ts`: actual deduplication/type saving,
  config reading, frozen lockfile stability, and task execution in a temporary
  workspace; `scripts/verify-pnpm-compatibility.ts` invokes it from 12.6 onward.
- `.github/workflows/ci.yml`, `README.md`: add 12.6.0 and keep older regressions.

## Verification

- `rtk pnpm run release:check`: lint, formatting, typechecking, and **453 tests
  across 26 files passed**, including 31 new regression cases.
- `rtk pnpm run build`: library, CLI, and declarations passed. tsdown reports its
  existing warning that the TypeScript 7 API is experimental.
- `rtk pnpm run test:compatibility -- 11.25.0 11.26.0 11.27.1 12.2.1 12.3.4 12.4.0 12.4.2 12.5.0 12.5.1`:
  all nine releases passed migration, config reading, lockfile generation,
  installation, and frozen installation. The applicable 12.4/12.5 minor fixtures
  also passed, including both `packageConfigs` shapes.
- `rtk pnpm run test:compatibility -- 12.6.0`: base, minor, and new installation
  fixtures all passed. The new fixture checks every added setting in
  `config list --json`, absence of unknown-setting diagnostics, source cleanup,
  actual deduplication from is-odd 3.0.0 to 3.0.1, automatic addition of
  `@types/is-number`, and execution of a task with priority. Frozen installs
  preserve lockfile bytes both before and after deduplication.

During fixture development, a single-document YAML parser rejected pnpm's
multi-document lockfile; the fixture now checks installed package versions and
compares lockfile bytes. Broadening a manifest range also triggered a fresh
resolution before the deduplication test; the fixture now seeds a valid older
resolution with a matching broadened lockfile specifier, then verifies it with
a frozen install before migration. The harness sets `CI=true`, so the command
intended to deduplicate also needed an explicit `--no-frozen-lockfile`; its
implicit frozen mode correctly left the older resolution unchanged. These were
verification-fixture issues, not migration regressions. Early test assertions
were corrected for the repository's existing trailing-newline contract and lint
rules. All required local checks now pass; no failed check remains unresolved.

Local verification is on macOS/Node 24.21.0, not an executed hosted CI matrix.
Python/Cargo remain disabled in installation fixtures; their configuration is
read but Python resolution and Cargo builds are not exercised. No real v10
installation, Windows run, or exhaustive task queue scheduling test is claimed.
