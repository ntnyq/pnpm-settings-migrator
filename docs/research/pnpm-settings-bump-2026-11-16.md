# pnpm compatibility update — 2026-11-16

## Query, channels and targets

Fetched the full npm packument at **2026-11-16 09:33:39 Asia/Shanghai
(01:33:39 UTC)**, reading `dist-tags`, `versions` and `time`. Sorted published
final SemVer versions by numeric major/minor/patch, independently of publication
time. **12.21.0** is both npm `latest` and the highest final SemVer, on
`latest-12` and `next-12`. The highest published major is still 12.
[npm metadata](https://registry.npmjs.org/pnpm).

| Major | Highest final SemVer | `latest-*` | `next-*` | npm publication of highest version (UTC) |
| ----- | -------------------- | ---------- | -------- | ---------------------------------------- |
| v10   | 10.34.9              | 10.34.9    | 10.34.9  | 2026-10-25 17:54:00.645                  |
| v11   | 11.28.12             | 11.28.12   | 11.28.12 | 2026-11-13 21:01:02.241                  |
| v12   | 12.21.0              | 12.21.0    | 12.21.0  | 2026-11-13 21:01:11.515                  |

GitHub marks both new releases `prerelease: false`, published at 21:20:28 UTC
for 11.28.12 and 21:02:22 UTC for 12.21.0 on November 13. Read both release
notes in full, excluding sponsor boilerplate. These are the only releases
between each major's reviewed baseline and target. The fresh 100-entry release
page extends back to v12.0.0-alpha.20, covering this entire interval, so no next
page is needed. No new prerelease appeared: the last published prereleases on
v11/v12 remain 11.0.0-rc.5 and 12.0.0-rc.11; neither is targeted.
[GitHub release metadata](https://api.github.com/repos/pnpm/pnpm/releases?per_page=100),
[11.28.12 notes](https://github.com/pnpm/pnpm/releases/tag/v11.28.12),
[12.21.0 notes](https://github.com/pnpm/pnpm/releases/tag/v12.21.0).

## Repository baseline and toolchain

The working tree started clean at
`b7643e4634cbb0914417af8218d218b83d514155` (`pnpm-settings-migrator` 0.21.0).
Development pin: **pnpm@12.18.0 → pnpm@12.21.0**. Both npm wrappers require
Node `>=18`; the repository keeps `^22.19.0 || >=24.11.0`. CI retains Node
22.19.0, 24.11.0 and 26.x, with 24.18.0 for loaded-linker verification. Local
checks use macOS and Node 24.22.1. The declared release was selected for the
final install and checks; no global pnpm installation was replaced.
[Manifest](../../package.json), [CI](../../.github/workflows/ci.yml).

The lockfile update affects only its package-manager dependency document:
pnpm 12.21.0, its platform executables and the newly included NetBSD executable.
Application dependencies, `@pnpm/types` and their lockfile document are
unchanged. An initial frozen install ran under the previous launcher version;
it was repeated with the declared 12.21.0 before verification.

| Major | Implemented/source-reviewed before                                 | Previously executed verification                                                                | After this update                                                          |
| ----- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| v10   | Legacy allowlist and override validation, reviewed through 10.34.9 | November 4 records two override CLI/config/install/frozen cases at 10.34.9; no full v10 harness | No new release or rule; partial coverage unchanged and not rerun           |
| v11   | Capabilities through 11.28.9, reviewed through 11.28.11            | November 13 records all 15 v11 matrix releases through 11.28.11                                 | No schema change; source-reviewed through 11.28.12; executed results below |
| v12   | Exact boundaries through 12.19.0, reviewed through 12.20.0         | November 13 records all 29 v12 matrix releases through 12.20.0                                  | No schema change; source-reviewed through 12.21.0; executed results below  |

Earlier verification belongs to the
[November 13 audit](pnpm-settings-bump-2026-11-13.md), not this run. Capability
minimum versions mark introduction boundaries rather than overall upper support
limits. A matrix entry or source comparison alone is not an executed test.

## Exact-tag review and migration decisions

Downloaded exact-tag source archives for **11.28.11, 11.28.12, 12.20.0 and
12.21.0**. Compared the complete applicable config-reader/config-crate trees.
The GitHub compare API returns only 300 changed files for both intervals, so
archive comparisons were used to avoid treating truncated file lists as full
coverage. Followed v12 types moved into `pnpm/crates/resolving-resolver-base/`.

| Difference                        | Classification and decision                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11.28.12 registry placeholders    | Already protected. Workspace and project npmrc registry placeholders now fail native config reading rather than falling through to another registry. Keep unsafe source values intact, with diagnostics, and reject existing unsafe YAML before writes under discard, merge and overwrite. Add native preceding/first-release checks; do not weaken protection on earlier targets. |
| 11.28.12 dynamic request settings | Already protected. Ignored proxy, pnprServer and userAgent placeholders now warn. Preserve the migrator's existing retention behavior. Trusted global configuration and credentials remain outside migration scope.                                                                                                                                                                |
| 11.28.12 workspace schema         | No implementation needed. `types.ts` is byte-identical. `unknownSettings.ts` only identifies projectScopedOptionalPeers as a newer v12 setting; this does not enable it in v11. Optional-peer, overrides, config dependency server types, runtime, engine and hoisted-directory fixes retain accepted shapes.                                                                      |
| 11.28.12 pnpr                     | No source-setting change. Remote resolution/build services require a newer server with protocol capabilities. Do not rewrite server versions or synthesize protocol configuration.                                                                                                                                                                                                 |
| 12.21.0 lockfileDir               | Consumption verification needed, no new capability. A pin equal to the default directory keeps default path anchors. A pin with sharedWorkspaceLockfile false still deliberately selects a shared lockfile. Preserve explicit values and verify migration, config reading, actual install layout and frozen installs on 12.20.0/12.21.0.                                           |
| 12.21.0 moved types               | Already covered. RegistryDeclaration, RegistryPrefixes, Ecosystem, ResolutionMode, PackageExtension and PeerDependencyMeta move to the resolver crate with unchanged accepted representations.                                                                                                                                                                                     |
| 12.21.0 schema and scope          | No implementation needed. Workspace settings, known/refused keys, config types, packageConfigs and workspace scope source files are byte-identical to 12.20.0. No added, removed, renamed or deprecated settings or nested shapes.                                                                                                                                                 |
| Other release changes             | No migration conversion. Offline store preparation, v13 lockfile handling, peer stability, deploy, hoisted/frozen-store fixes, Python project detection, script termination, pnpr fallback/limits, PowerShell setup and bundled node-gyp changes do not alter migrated setting representations.                                                                                    |

No empty capability entries were added. Target resolution, CLI options, public
types, pin rewriting contracts and all merge strategies keep their existing
behavior. Defaults are not inserted or removed.

Example retained behavior:

```ini
lockfile-dir=.
```

becomes explicit `lockfileDir: .` in YAML. Conversely, a dynamic registry URL
such as `https://${PRIVATE_REGISTRY_HOST}/` stays in its source with a warning;
it is never expanded into the workspace by the migrator.

Primary source evidence:

- [v11 field types](https://github.com/pnpm/pnpm/blob/v11.28.12/pnpm11/config/reader/src/types.ts),
  [environment handling](https://github.com/pnpm/pnpm/blob/v11.28.12/pnpm11/config/reader/src/replaceEnvInSettings.ts),
  [project npmrc](https://github.com/pnpm/pnpm/blob/v11.28.12/pnpm11/config/reader/src/loadNpmrcFiles.ts),
  [unknown fields](https://github.com/pnpm/pnpm/blob/v11.28.12/pnpm11/config/reader/src/unknownSettings.ts).
- [v12 fields](https://github.com/pnpm/pnpm/blob/v12.21.0/pnpm/crates/config/src/workspace_yaml/settings.rs),
  [path derivation](https://github.com/pnpm/pnpm/blob/v12.21.0/pnpm/crates/config/src/derive_layout.rs),
  [lockfile pins](https://github.com/pnpm/pnpm/blob/v12.21.0/pnpm/crates/config/src/layout/pin_lockfile.rs),
  [upstream layout tests](https://github.com/pnpm/pnpm/blob/v12.21.0/pnpm/crates/config/src/tests/configuration_explicit_settings_report_the.rs).
- [Relocated registry types](https://github.com/pnpm/pnpm/blob/v12.21.0/pnpm/crates/resolving-resolver-base/src/registries.rs),
  [package extension types](https://github.com/pnpm/pnpm/blob/v12.21.0/pnpm/crates/resolving-resolver-base/src/package_extension.rs),
  [resolution policy](https://github.com/pnpm/pnpm/blob/v12.21.0/pnpm/crates/resolving-resolver-base/src/policy.rs).

## Changed files and verification

- `package.json` and `pnpm-lock.yaml`: development pin and its executable graph.
- `scripts/verify-pnpm-versions.ts` and CI: add 11.28.12 and 12.21.0, retaining
  all previous releases (46 total: 16 v11, 30 v12).
- `scripts/verify-pnpm-registry-env.ts`: dynamic URLs in scalar, named, scope
  and declaration maps; source retention/rejection before writes under every
  strategy; native YAML/npmrc rejection and ignored-setting warnings.
- `scripts/verify-pnpm-12.21.ts`: explicit default lockfile directory, custom
  module/store paths, shared/per-project mode, source cleanup, actual package
  installation and frozen installs. The fixture is a smoke check of native
  consumption, not exhaustive reproduction of upstream path bugs.
- `scripts/verify-pnpm-compatibility.ts`: await both new fixtures. Extend the
  v11 control in `verify-pnpm-12.18.ts` to include subsequent v11 patches.
- Version notes: update 11.28, add 12.21, and link this audit from navigation.

Executed with the declared **pnpm 12.21.0**:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run release:check
pnpm run test:compatibility -- 11.28.11 11.28.12 12.18.0 12.19.0 12.20.0 12.21.0
```

All four commands passed. `release:check` passed lint, formatting, typechecking
and **52 test files / 2580 tests**. The final compatibility command exited 0,
awaiting every applicable fixture on all six requested releases. Native registry
checks passed on all six; the default lockfile directory fixture passed on
12.20.0 and 12.21.0. Existing optional-peer, v9/v13, local directory specifier,
permissions/skills, TLS, release, registry, include and install checks ran where
their version gates apply. Real installs ran only in disposable workspaces.

Additional checks confirmed that the default/CI release lists match exactly
(46 entries) and that the project dependency lockfile document is byte-identical
to HEAD; only the preceding package-manager document changed. `git diff --check`
passed, and all new local documentation links resolve.

Two initial compatibility attempts exposed errors in the newly added fixtures,
both corrected before the successful run: v11's default reporter omits the
registry error code, so assertions also accept the explicit error message; and
the layout fixture must parse every YAML lockfile document because managed
package-manager dependencies may occupy a separate document. These were harness
assumptions, not product migration failures. No checks remain failing.

Build succeeds with the existing tsdown warning that its TypeScript 7.0 `tsgo`
declaration generator is deprecated; the dependency/tooling upgrade is outside
this compatibility change. No unrelated upgrade was applied.

Coverage limits: the full **46-release** matrix was not rerun; its other entries
retain their dated historical results. v10 was not rerun and still has partial
verification. This run does not independently reproduce every upstream peer,
pnpr, deploy, path-layout, Windows or CI regression, and local macOS checks do
not establish fresh Linux/Windows CI results. No releases or networking evidence
remain unconfirmed for the selected targets. No commit, push or release was made.
