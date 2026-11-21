# pnpm compatibility update — 2026-11-21

## Releases and toolchain

Fetched the full npm packument on **2026-11-21 13:55:32 Asia/Shanghai
(05:55:32 UTC)**. Read `dist-tags`, `versions`, and `time`, and sorted final
SemVer releases by numeric major, minor, and patch. **12.21.0** remains npm
`latest`. **12.22.0**, on `next-12`, is the highest final SemVer and GitHub marks
it as a stable release. [npm metadata](https://registry.npmjs.org/pnpm).

| Major | Highest final SemVer | `latest-*` | `next-*` | npm publication (UTC)   | GitHub publication (UTC) |
| ----- | -------------------- | ---------- | -------- | ----------------------- | ------------------------ |
| v10   | 10.34.9              | 10.34.9    | 10.34.9  | 2026-10-25 17:54:00.645 | 2026-10-25 17:54:24      |
| v11   | 11.28.13             | 11.28.13   | 11.28.13 | 2026-11-17 20:01:02.973 | 2026-11-17 20:12:21      |
| v12   | 12.22.0              | 12.21.0    | 12.22.0  | 2026-11-17 20:01:11.036 | 2026-11-17 20:20:31      |

GitHub reports `prerelease: false` for all three targets. The packument shows
only 11.28.13 and 12.22.0 beyond the respective reviewed baselines. Fetched
GitHub release records by exact tag and read both release notes in full. No
new major or prerelease was published. The newest published v11 and v12
prereleases remain 11.0.0-rc.5 and 12.0.0-rc.11, respectively.
[10.34.9 release](https://github.com/pnpm/pnpm/releases/tag/v10.34.9),
[11.28.13 release](https://github.com/pnpm/pnpm/releases/tag/v11.28.13),
[12.22.0 release](https://github.com/pnpm/pnpm/releases/tag/v12.22.0).

The working tree started clean at `0f1d30b407bc86d368fcaff2d7c1701d823087a9`
(`pnpm-settings-migrator` 0.22.0). The development pin follows npm `latest`
and stays at **pnpm@12.21.0 → pnpm@12.21.0**. The npm wrapper requires Node
`>=18`. The project keeps Node `^22.19.0 || >=24.11.0`, and the compatibility
CI job uses Node 24.18.0 for the loaded linker. Local checks use macOS arm64
and Node 24.22.1. No manifest, dependency, or lockfile update is needed.
[Manifest](../../package.json), [CI](../../.github/workflows/ci.yml).

## Compatibility baseline and scope

| Major | Implementation and source review before                                         | Previously executed coverage                                    | Implementation and source review after                                              |
| ----- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| v10   | Legacy allowlist and override validation reviewed through 10.34.9               | Two override CLI/config/install/frozen cases at 10.34.9         | Same 10.34.9 baseline with partial verification                                     |
| v11   | Exact workspace capabilities through 11.28.9 and source review through 11.28.12 | Prior audits cover the 16 default v11 releases through 11.28.12 | Source review through 11.28.13, with project refusal for the derived lockfile path  |
| v12   | Exact workspace capabilities through 12.19.0 and source review through 12.21.0  | Prior audits cover the 30 default v12 releases through 12.21.0  | Source review through 12.22.0, with project refusal for the global packages section |

Capability introduction versions identify when individual fields first work.
The source review and executed cases define the coverage for each release.
[November 4 v10 evidence](pnpm-settings-bump-2026-11-04.md),
[November 13 full matrix](pnpm-settings-bump-2026-11-13.md),
[November 16 verification](pnpm-settings-bump-2026-11-16.md).

## Exact-tag review

Compared exact source archives for **11.28.12 → 11.28.13** and
**12.21.0 → 12.22.0**. Compared the complete TypeScript config-reader tree and
the Rust configuration crate, including known and refused keys, workspace and
machine types, `packageConfigs`, defaults, scope, validation, and environment
parsing. Followed the relevant consumers into v11 override selection, v12
global approvals, the v13 lockfile writer, and Python registry patterns. The
10.34.9 archive and release metadata confirm the unchanged v10 target.

| Difference                              | Classification and migration behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11.28.13 config reader                  | Implementation needed for the diagnostic. `types.ts` is byte-identical. `rawLockfileDir` becomes internal reader context and is refused as a project setting. The migrator keeps incoming values with that diagnostic and rejects an existing YAML field before writes. Explicit `lockfileDir` remains portable. v12 tracks its pre-normalization path internally as `configured_lockfile_dir` without exposing a workspace field.                                                                            |
| 11.28.13 and 12.22.0 override selection | Already covered. Native pnpm prefers the strictly narrower range even when both match. The migrator preserves the literal selectors and their order, which matters on preceding versions.                                                                                                                                                                                                                                                                                                                     |
| 12.22.0 global package section          | Implementation needed for the diagnostic. `globalPackagesConfig` is a nested machine setting. Global package commands read it above the base machine settings and below environment/CLI overrides. Top-level project YAML refuses it. Global build decisions move to the section's `permissions` map, with a deprecated fallback for previous decisions in the global packages workspace. Catalogs, overrides, package extensions and patches are disregarded inside the global packages section.             |
| 12.22.0 project versus machine scope    | Already covered. A stricter global filter skips workspace-only keys and warns. For example, `lockfileDir`, `workspaceConcurrency`, and `peersSuffixMaxLength` still belong in project YAML. The global file now applies `blockExoticSubdeps` and `excludeLinksFromLockfile`; global config commands also accept `pmOnFail`, `runtimeOnFail`, and structured `tools`. `maxSockets` and `maxsockets` already worked in project YAML. The release adds canonical `max-sockets` routing and reports both aliases. |
| 12.22.0 v13 lockfile format             | Native fixture update needed. The workspace selector stays `lockfile.format: v13`. Local directory package entries now store declared specifiers and `injected` flags inline. A regular install can rewrite the experimental format. No migration conversion applies to the lockfile.                                                                                                                                                                                                                         |
| Registry handling                       | Already covered for migration. Both releases re-check install policies after a registry change. v12 also applies the existing project placeholder policy in flow YAML. Python registry entries still accept exact names, prefixes, `*` and `**`; the new parser reports invalid patterns more clearly. The release does not add a route form.                                                                                                                                                                 |
| Native consumers and defaults           | Already covered or outside field conversion. Runtime selection follows installed dependency groups. v12 resolves `catalog:` in local `file:` packages, discovers local dependency skills, and interprets pipeline inputs and lockfile hashes more precisely. CLI filter ordering, clean/CI behavior, packaging, update prompts, command outputs and `dlx` policy changes require no project field rewrite. Existing workspace types and setting defaults remain applicable.                                   |

The shared v11/v12 refusal list is used for `globalPackagesConfig` and
`rawLockfileDir` because neither name belongs in a project workspace on either
major. Earlier native releases lack one or both names and may report them as
unknown. Source retention and refusal before writes use the same existing path
for `discard`, `merge`, and `overwrite`. No workspace field, public type, target
rule, or default is introduced. For example, a manifest containing both
`pnpm.globalPackagesConfig` and `pnpm.saveExact: true` keeps the former in
`package.json` and writes `saveExact: true` to `pnpm-workspace.yaml`.

### Primary source evidence

- [v11 workspace field types](https://github.com/pnpm/pnpm/blob/v11.28.13/pnpm11/config/reader/src/types.ts),
  [reader context](https://github.com/pnpm/pnpm/blob/v11.28.13/pnpm11/config/reader/src/getConfig/configContext.ts),
  [override selection](https://github.com/pnpm/pnpm/blob/v11.28.13/pnpm11/hooks/read-package-hook/src/createVersionsOverrider.ts).
- [v12 workspace settings](https://github.com/pnpm/pnpm/blob/v12.22.0/pnpm/crates/config/src/workspace_yaml/settings.rs),
  [project refusal](https://github.com/pnpm/pnpm/blob/v12.22.0/pnpm/crates/config/src/refused_keys.rs),
  [global packages layer](https://github.com/pnpm/pnpm/blob/v12.22.0/pnpm/crates/config/src/global_packages.rs),
  [global key scope](https://github.com/pnpm/pnpm/blob/v12.22.0/pnpm/crates/config/src/workspace_yaml/workspace_scope.rs).
- [v13 dependency entries](https://github.com/pnpm/pnpm/blob/v12.22.0/pnpm/crates/lockfile/src/next_format/package/dependencies.rs),
  [flow placeholders](https://github.com/pnpm/pnpm/blob/v12.22.0/pnpm/crates/config/src/workspace_yaml/parse_settings.rs),
  [Python registry patterns](https://github.com/pnpm/pnpm/blob/v12.22.0/pnpm/crates/config/src/workspace_yaml/registries/python.rs).

## Changes and verification

- [Refused project fields](../../src/constants/settings-fields.ts) and
  [source retention and pre-write regression tests](../../tests/migration/compatibility/project-refused-settings.test.ts).
- Native fixtures for [global package scope](../../scripts/verify-pnpm-global-packages.ts),
  [v11 override precedence](../../scripts/verify-pnpm-v11-overrides.ts), and
  [v13 directory dependencies](../../scripts/verify-pnpm-12.20.ts).
- The [default release list](../../scripts/verify-pnpm-versions.ts) and
  [CI matrix](../../.github/workflows/ci.yml) include 11.28.13 and 12.22.0,
  for 48 releases in total. The harness accepts exact v11 and v12 releases.

The applicable harness completed on **11.28.12, 11.28.13, 12.19.0, 12.20.0,
12.21.0 and 12.22.0**. The v11 fixture verified both orderings of the same
overrides and stable frozen installs. In the v12 scope fixture, local installs
used the base machine store on both releases, and only 12.22.0 used the nested
store for global installation. The four v13 fixture runs verified the old
behavior, the separate specifier format, and the 12.22 inline format. All
installs ran in disposable workspaces, with the global install using disposable
configuration, home, state, and global directories.

A follow-up run on 11.28.12 and 11.28.13 checked the native `rawLockfileDir`
warning. The previous release reports an unknown key. 11.28.13 explicitly
refuses it and leaves the submitted path out of the resolved configuration.

The first harness attempt hit an existing assertion that expected every
12.20+ lockfile to contain a `specifiers` section. The updated fixture also
needed to account for a separate managed package-manager lockfile document.
Both assertions were corrected and the six-release command then passed.

`pnpm install --frozen-lockfile`, `pnpm run build`, and `pnpm run release:check`
passed with the declared pnpm 12.21.0. `release:check` passed lint, formatting,
typechecking, and **53 test files / 2592 tests**. The build still reports the
existing tsdown warning about TypeScript 7.0 declaration generation. The frozen
install reports the existing pending tsdown agent skill approval.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run release:check
pnpm run test:compatibility -- 11.28.12 11.28.13 12.19.0 12.20.0 12.21.0 12.22.0
pnpm run test:compatibility -- 11.28.12 11.28.13
```

The default and CI matrices have the same 48 entries. The other entries retain
their dated historical results. The full matrix and v10 were not rerun, and
this macOS run supplies no new Linux or Windows CI results. The checks cover
the reported migration boundaries and representative installs. They do not
reproduce every upstream consumer fix.
