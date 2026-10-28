# pnpm compatibility update — 2026-10-29

The initial update is recorded below. The
[registry validation follow-up](#registry-validation-follow-up) records the
subsequent review fix and its additional verification. The
[routing follow-up](#registry-routing-conflict-follow-up) records the cross-entry
route validation added after the next review.

## Query, channels, and targets

Fresh npm `dist-tags`, `versions`, and `time`, plus GitHub release metadata,
were queried at **2026-10-29 04:14:57 Asia/Shanghai
(2026-10-28 20:14:57 UTC)**. Stable candidates were sorted numerically by
SemVer components, excluding prerelease suffixes. npm `latest` and the highest
published stable SemVer are both **12.16.1**. GitHub confirms the selected
releases are neither drafts nor prereleases.

| Major | Highest stable | `latest-*` | `next-*` | npm publication (UTC) | GitHub publication (UTC) |
| ----- | -------------- | ---------- | -------- | --------------------- | ------------------------ |
| 10    | 10.34.9        | 10.34.9    | 10.34.9  | October 25, 17:54:00  | October 25, 17:54:24     |
| 11    | 11.28.9        | 11.28.9    | 11.28.9  | October 27, 00:32:09  | October 27, 00:32:50     |
| 12    | 12.16.1        | 12.16.1    | 12.16.1  | October 27, 15:27:26  | October 27, 15:28:26     |

The stable versions on `next-*` are also on their respective `latest-*`
channels. No newer major or pnpm prerelease was published; 12.0.0-rc.11 remains
the last v12 release candidate and is not targeted. pnpr alpha releases are a
separate registry server. The first 100-entry GitHub release page reaches
v12.0.0-alpha.14 and covers the complete interval, so no pagination was needed.
GitHub compare responses hit their 300-file cap for some ranges; the audit
therefore downloaded exact-tag source archives instead of treating those
responses as complete diffs.

All intervening notes were read:

| Release                                                       | npm publication (UTC) | GitHub publication (UTC) | Settings outcome                                                                            |
| ------------------------------------------------------------- | --------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| [10.34.8](https://github.com/pnpm/pnpm/releases/tag/v10.34.8) | October 23, 18:06:37  | October 25, 17:54:42     | No schema change; hoisting, bin cleanup, embedded Node fixes                                |
| [10.34.9](https://github.com/pnpm/pnpm/releases/tag/v10.34.9) | October 25, 17:54:00  | October 25, 17:54:24     | Package-manager pin recording fix; no migration rule                                        |
| [11.28.8](https://github.com/pnpm/pnpm/releases/tag/v11.28.8) | October 22, 22:08:27  | October 22, 22:08:54     | Embedded Node update; no new setting                                                        |
| [11.28.9](https://github.com/pnpm/pnpm/releases/tag/v11.28.9) | October 27, 00:32:09  | October 27, 00:32:50     | `serverType: pnpr`; existing install/network settings behave correctly in more paths        |
| [12.16.0](https://github.com/pnpm/pnpm/releases/tag/v12.16.0) | October 26, 23:59:07  | October 27, 00:12:44     | Five workspace fields consumed; machine-setting separation; obsolete script setting removed |
| [12.16.1](https://github.com/pnpm/pnpm/releases/tag/v12.16.1) | October 27, 15:27:26  | October 27, 15:28:26     | Bootstrap/config-directory fixes; no additional field or value shape                        |

Sources: [npm metadata](https://registry.npmjs.org/pnpm),
[GitHub release metadata](https://api.github.com/repos/pnpm/pnpm/releases?per_page=100).

## Baselines and toolchain

The package name is `pnpm-settings-migrator`; the initial working tree was clean.
The development pin in `package.json#packageManager` changes from **12.15.0 to
12.16.1**, following npm `latest`. The npm wrapper declares Node `>=18`.
The repository retains Node `^22.19.0 || >=24.11.0`, its ordinary CI matrix,
and Node 24.18.0 for compatibility CI's loaded-linker fixtures. Local execution
used Node **24.22.1** on macOS. Only the toolchain pin and corresponding
platform executables changed in the lockfile; no application dependencies or
`@pnpm/types` update was needed.

| Major | Implemented before                                               | Verified before                                                             | After this run                                                                             |
| ----- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| v10   | Legacy schema; source audit through 10.34.7                      | Unit regressions; real v10 consumption unverified                           | Source audit through 10.34.9; no new rule; real consumption still unverified               |
| v11   | Exact fields and validation through 11.28.7                      | October 22 audit records successful real fixtures through 11.28.7           | Add pnpr at 11.28.9; real fixtures pass at 11.28.8 and 11.28.9                             |
| v12   | Exact capabilities through 12.15.0, including include delegation | October 22 audit and include follow-up record real fixtures through 12.15.0 | Add 12.16 fields and removal boundary; real fixtures pass at 12.15.0, 12.16.0, and 12.16.1 |

Evidence: `package.json`, `.github/workflows/ci.yml`, `src/constants/pnpm-v*.ts`,
`pnpm-capabilities.ts`, target/version resolution, nested value validation,
tests, compatibility scripts, README, and the
[October 22 audit and include follow-up](pnpm-settings-bump-2026-10-22.md).
Historical passes apply to their recorded checkout. A capability minimum marks
introduction, not the upper support limit; a matrix entry alone does not prove
that verification passed. Coverage here remains fixture-based, not exhaustive
validation of every setting and release.

## Exact-tag review and implementation

Compared source archives at **10.34.7, 10.34.8, 10.34.9; 11.28.7, 11.28.8,
11.28.9; 12.15.0, 12.16.0, 12.16.1**. The v10 config reader and core type file
are unchanged across the interval. Reviewed v11 config types, registry enums,
known-key lists, source overlays, and bootstrap network settings. Reviewed v12
workspace fields, nested sections, package configs, known/refused keys, machine
settings, environment substitution, includes, defaults, and config application.
The 12.16.1 config changes affect loading/bookkeeping rather than workspace
schema or nested value shapes.

| Difference                                                                                                    | Classification and treatment                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12.16 `strictSsl`, `localAddress`                                                                             | Implement exact 12.16.0 gate; boolean/null and string/null respectively. Preserve invalid IP strings as written because pnpm treats them as unset. Preserve string placeholders without expansion.  |
| 12.16 `runtime`                                                                                               | Implement exact gate; boolean/null. `false` suppresses installing `devEngines.runtime` and `engines.runtime`. No change to legacy runtime conversion or project pins.                               |
| 12.16 `requiredScripts`                                                                                       | Implement exact gate; string array/null. Reject invalid array elements as a whole. Preserve all conflict strategies and cleanup only represented values.                                            |
| 12.16 `tag`                                                                                                   | Implement exact gate; string/null, including empty strings and placeholders. Do not materialize the default `latest`.                                                                               |
| 12.16 `scriptsPrependNodePath`                                                                                | Preserve incoming source values with diagnostics; reject existing workspace values before writes. The exact 12.16 reader removes the field despite accepting a YAML file containing it.             |
| `symlinkedLockfileTargetDirs`                                                                                 | Global-only machine setting; add to refused project fields. Retain source values and reject existing YAML. No workspace capability is added.                                                        |
| Project `ci`                                                                                                  | Existing reader already clears it at 12.15.0; add the missing v12 ignored-field protection. Values stay in their sources. Existing YAML blocks writes.                                              |
| `globalShims`, `tools`, machine settings                                                                      | Already protected; preserve existing restrictions. 12.16's split into machine/workspace structs adds diagnostics, not a new project permission.                                                     |
| 11.28.9 registry `serverType: pnpr`                                                                           | Implement exact enum gate. Earlier, imprecise, and prerelease v11 targets retain the complete registry map. v12 keeps its existing 12.15 gate. v12-only nested fields remain incompatible with v11. |
| Registry prefix identity, scopes, `__proto__`, aliases                                                        | Runtime fixes; retain existing safe registry transformations. New internal `aliases` data is not a public workspace field and is not enabled.                                                       |
| TLS/bootstrap precedence and pin switching                                                                    | Existing-source behavior fixes; no environment expansion by the migrator and no project-pin rewriting.                                                                                              |
| Store/linker repeat installs, `autoDedupe`, builds, trust, hooks, runtime protocols, packing, security, speed | Existing fields/runtime behavior; no additional migration representation or defaults added.                                                                                                         |
| `--env-file`, setup `--no-modify-path`, `--cache-dir` CLI spelling                                            | Invocation/setup features; outside settings migration.                                                                                                                                              |

Primary exact-tag evidence:

- [12.15 workspace fields](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/config/src/workspace_yaml/settings.rs)
  and [12.16 workspace fields](https://github.com/pnpm/pnpm/blob/v12.16.0/pnpm/crates/config/src/workspace_yaml/settings.rs).
- [12.16 field application and TLS semantics](https://github.com/pnpm/pnpm/blob/v12.16.0/pnpm/crates/config/src/workspace_yaml/apply.rs)
  and [environment substitution](https://github.com/pnpm/pnpm/blob/v12.16.0/pnpm/crates/config/src/workspace_yaml/env.rs).
- [12.16 machine settings](https://github.com/pnpm/pnpm/blob/v12.16.0/pnpm/crates/config/src/workspace_yaml/machine.rs),
  [refused keys](https://github.com/pnpm/pnpm/blob/v12.16.0/pnpm/crates/config/src/refused_keys.rs),
  and [12.15 machine-field clearing](https://github.com/pnpm/pnpm/blob/v12.15.0/pnpm/crates/config/src/workspace_yaml/includes.rs).
- [11.28.8 registry schema](https://github.com/pnpm/pnpm/blob/v11.28.8/pnpm11/config/reader/src/registrySettings.ts)
  and [11.28.9 registry schema](https://github.com/pnpm/pnpm/blob/v11.28.9/pnpm11/config/reader/src/registrySettings.ts).
- [12.16.1 config loading](https://github.com/pnpm/pnpm/blob/v12.16.1/pnpm/crates/config/src/loading.rs),
  [v10 config reader](https://github.com/pnpm/pnpm/blob/v10.34.9/config/config/src/index.ts).

Implementation files:

- `src/constants/pnpm-capabilities.ts`, `pnpm-v12.ts`, `settings-fields.ts`:
  exact new boundaries and ignored/refused field protections.
- `src/features/settings/versioned-values.ts`, `pnpm-v12-values.ts`:
  scalar/list validation and version-specific registry enum support.
- `src/types/pnpm-v12.ts`, `workspace.ts`: nullable workspace types and updated
  pnpr introduction documentation; no new public type export is needed.
- `tests/migration/compatibility/pnpm-12.16.test.ts`, `pnpm-11.28.9.test.ts`:
  boundaries, invalid values, nullable values, placeholders, source cleanup,
  explicit-target precedence, imprecise/prerelease pins, existing YAML, and
  all three list merge strategies.
- `scripts/verify-pnpm-12.16.ts`, `verify-pnpm-12.15.ts`,
  `verify-pnpm-tarball-settings.ts`, `verify-pnpm-ignored-settings.ts`, the
  compatibility harness, CI, README, package pin, and lockfile.

For example, at 12.16.0:

```ini
runtime=false
required-scripts[]=build
tag=next
```

becomes:

```yaml
runtime: false
requiredScripts: [build]
tag: next
```

At 12.15.0 these lines remain in `.npmrc` with diagnostics. No upstream defaults
are written. Registry credentials, dynamic proxy protection, include ownership,
legacy conversions, and user project version pins keep their existing contracts.

## Verification

Executed with the declared pnpm **12.16.1** and Node **24.22.1**:

| Command                                                                                                                   | Result                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm install --lockfile-only`                                                                                            | Pass; only pnpm pin/platform executable lock entries changed               |
| `pnpm run test --run tests/migration/compatibility/pnpm-12.16.test.ts tests/migration/compatibility/pnpm-11.28.9.test.ts` | Pass, 51 tests                                                             |
| `pnpm run release:check`                                                                                                  | Pass: lint, formatting, strict types, 46 test files / 1,374 tests          |
| `pnpm run build`                                                                                                          | Pass: library, CLI, declarations; existing tsdown TypeScript 7 API warning |
| `pnpm run test:compatibility -- 11.28.8 11.28.9 12.15.0 12.16.0 12.16.1`                                                  | Pass for all five releases, including applicable pre-existing fixtures     |

The real fixtures run migration, `config list --json`, installs, and frozen
installs in temporary workspaces. Added consumption checks prove:

- 12.16 `tag: next` installs 1.0.0 from a deterministic registry whose `latest`
  points at 2.0.0.
- `runtime: false` allows that install and its frozen repeat with a deliberately
  unavailable `devEngines.runtime` Node version, without downloading it.
- `strictSsl: false` allows the local self-signed HTTPS registry; switching it
  to true makes the request fail certificate validation. `localAddress` is
  reflected in real config and the requests succeed with the loopback binding.
- A project missing `build` fails recursive execution with
  `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`; adding the script makes it succeed.
- 12.15 retains the five settings rather than writing ignored YAML.
- 11.28.9 pnpr declaration consumption omits canonical registry tarball URLs
  from the lockfile and supports fresh and frozen installs. Existing unpacked
  size and v12 tar-integrity fixtures still pass.

The HTTPS fixture creates a temporary certificate with OpenSSL, available on
the Ubuntu compatibility runner and local macOS environment. Keys, packages,
servers, and installs are confined to temporary directories and cleaned up.

Initial verification exposed test-harness assumptions, corrected before the
successful full run: v11 `config list` does not expose the assumed internal
`registryOptionsByUrl` projection, and custom tarball URLs are correctly retained
even with `serverType: pnpr`. The fixture now uses pnpr's canonical URL and
checks actual lockfile/install behavior. Initial lint failures were also fixed.
These were verification-code failures; no checks remain blocked by networking.

Real v10 consumption, exhaustive settings coverage, and local execution of the
entire older-version compatibility matrix remain unverified. Older matrix
entries and their fixtures are retained; the current full unit suite passes.
No commit, push, PR, or publication was performed.

## Registry validation follow-up

Review reproduced a v11.28.9 failure with two registry declarations: one with
`serverType: pnpr` and a sibling with `serverType: typo`. The initial
implementation accepted the new pnpr enum but skipped the sibling declaration,
returned no warnings, removed the source map, and generated YAML that real pnpm
11.28.9 rejected. The same selection pattern could miss an invalid sibling of
a v12 registry using a versioned setting such as `networkConcurrency`.

`src/features/settings/pnpm-v12-values.ts` now selects strict validation for the
whole applicable map and checks every entry, rather than selecting individual
entries by their own fields. Invalid enums, field types, unknown fields,
non-object declarations, mixed legacy/declaration shapes, and unsupported
versioned fields retain the entire source map. A bad existing map blocks writes
to the workspace, package manifest, and npmrc. Pure legacy string maps and
previous version gates remain unchanged.

Added **112 regression cases** across `pnpm-11.28.9.test.ts` and
`pnpm-12.9.test.ts`. They cover sibling order, all three merge strategies,
unrelated source cleanup, existing valid workspace maps, complete source
retention, unchanged files on rejection, and successful migration of valid
multi-registry and legacy maps. Before the implementation fix, the first
regression run failed 80 cases, confirming that the tests exercise the bug.

`scripts/verify-pnpm-registry-declarations.ts` adds real pnpm rejection and source
retention checks for invalid sibling server types, scopes, and null declarations.
The v11 pnpr fixture now migrates a valid multi-registry map before fresh and
frozen installs. README documents whole-map retention.

Follow-up verification on Node 24.22.1 and pnpm 12.16.1:

- `pnpm run release:check`: passed, including lint without warnings, formatting,
  strict types, and **46 files / 1,486 tests**.
- `pnpm run build`: passed; the existing tsdown TypeScript 7 API warning remains.
- The complete **38-release compatibility matrix passed**, using
  `pnpm run test:compatibility -- <versions>` in the batches below. This
  supersedes the earlier limitation about not executing the older matrix in
  this checkout. Each release ran all applicable migration, config, install,
  and frozen-install fixtures. v10 consumption remains outside this harness.
- Final `pnpm run format:check` and `git diff --check`: passed.

Executed compatibility batches, all successful:

1. `11.28.8 11.28.9 12.14.0 12.15.0 12.16.0 12.16.1`
2. `11.25.0 11.26.0 11.27.1 11.28.0 11.28.1 11.28.2`
3. `11.28.3 11.28.4 11.28.5 11.28.6 11.28.7 12.2.1`
4. `12.3.4 12.4.0 12.4.2 12.5.0 12.5.1 12.6.0`
5. `12.7.0 12.8.0 12.8.1 12.8.2 12.9.0 12.9.1`
6. `12.10.0 12.10.1 12.11.0 12.11.1 12.11.2 12.12.0`
7. `12.12.1 12.13.0`

## Registry routing conflict follow-up

The next review confirmed that invalid sibling field validation was fixed,
but found a separate cross-entry invariant missing: multiple declarations could
claim one prefix, or route one scope to different registries. Two individually
valid maps from the existing workspace and package manifest could merge into
such an invalid result. Real pnpm 11.28.9 rejected it after the migrator had
reported no warnings and cleaned the source.

`src/features/settings/registries.ts` now checks prefix uniqueness and scope
routing consistency using Maps and Sets. `schema.ts` applies the check during
source selection and existing/final workspace validation. A conflicting source
map stays intact with diagnostics. An existing conflict or one introduced by
the selected merge strategy stops before destination writes or source cleanup.
The effective included workspace is also checked before its owner files change.

Scope identity follows the selected major, without rewriting the stored URLs:

- v11 uses WHATWG URL serialization where parseable, then appends a slash,
  matching its patched `normalize-registry-url@2.0.1` dependency. Hostname case
  and default ports normalize; scheme-relative spellings keep their text.
- v12 canonicalizes the exact npm HTTPS/protocol-relative `.com` root to `.org`
  and appends a slash, matching `pnpm_network::normalize_registry_url`.
  Other URL spellings stay literal for this comparison.
- Duplicate prefixes remain invalid even when registry URLs normalize equally.
  Repeated scopes to the same normalized registry, nullable/unset routes,
  case-sensitive distinct routes, and valid legacy maps remain supported.

Exact-source evidence:
[v11 routing validation](https://github.com/pnpm/pnpm/blob/v11.28.9/pnpm11/config/reader/src/registrySettings.ts),
[v11 normalizer patch](https://github.com/pnpm/pnpm/blob/v11.28.9/.config/pnpm/patches/normalize-registry-url%402.0.1.patch),
[v12 routing validation](https://github.com/pnpm/pnpm/blob/v12.16.0/pnpm/crates/config/src/workspace_yaml/registries.rs),
[v12 URL identity](https://github.com/pnpm/pnpm/blob/v12.16.0/pnpm/crates/network/src/url_encoding.rs).

Added **256 tests** in `tests/migration/compatibility/registry-routes.test.ts`:
duplicate/empty prefixes, scope/default-scope overlaps, source retention,
existing-map rejection, final merged conflicts, array merging versus discard
and overwrite, included file preservation, valid equivalent URLs, and
major-specific normalization. Five representative versions cover the existing
and new v11/v12 paths. Three-strategy conflict checks preserve all source files.

The real compatibility harness adds routing checks at **11.28.9 and 12.16.1**:
native rejection of duplicate routes, safe rejection under all three migration
strategies, and comparison of accepted/rejected URL normalization examples.

Verification on Node 24.22.1 and pnpm 12.16.1:

- `pnpm run release:check`: passed, with lint without warnings, formatting,
  strict types, **47 files / 1,742 tests**.
- `pnpm run build`: passed; existing tsdown TypeScript 7 API warning only.
- The full **38-release compatibility matrix passed again**. The executed
  release set is unchanged from the registry-validation follow-up, using
  `pnpm run test:compatibility -- <versions>` in batches of six and prioritizing
  `11.28.8 11.28.9 12.9.0 12.15.0 12.16.0 12.16.1` in the first batch.
  All applicable prior fixtures and both new native routing fixtures passed.
- Additional native `config list --json` boundary checks passed at 11.28.7,
  11.28.8, and 11.28.9 for equivalent path URLs with/without trailing slashes.
  Their v11 normalizer patch is identical; its source path moved from
  `__patches__/` to `.config/pnpm/patches/` during this interval.
- Final formatting and `git diff --check`: passed. No failures remain; real
  v10 consumption and exhaustive upstream settings coverage remain outside
  the compatibility harness. No commit, push, or publication was performed.

## Post-normalization registry validation and the 12.11.1 boundary

Further review found two omissions in final registry validation. The earlier
three-strategy fix already checks the normalized, merged workspace before
rendering or persisting destinations. That catches duplicate prefixes generated
from same-named legacy aliases across sources and preserves every source file.
It added 36 regression cases after the routing follow-up above.

The remaining representation omission allowed an existing legacy
`registries.default` route and an incoming `namedRegistries` alias to become a
mixed string/declaration map after conversion. The reverse source arrangement
also failed. Without a versioned declaration field, strict map validation was
skipped. Real pnpm 11.28.8 and 12.16.1 rejected the resulting workspace after the
migrator had reported no warnings and removed the source configuration.

Registry value validation now lives with the other registry checks in
`src/features/settings/registries.ts`. It checks basic representation before
release-specific declaration fields: entries must be all strings or all
declaration objects. Mixed representations and non-object siblings are rejected
even without a versioned field. Invalid incoming settings stay in their source;
invalid existing or converted final maps stop migration before any writes.

The URL identity omission treated npm's `.com` and `.org` registry roots as
equivalent for every v12 target. Native checks confirmed they remain distinct at
12.9.0, 12.10.0, and 12.11.0, and become equivalent at 12.11.1. Routing validation
now receives the complete resolved target and enables canonicalization only
from a confirmed stable 12.11.1. Both HTTPS and protocol-relative spellings are
covered. Unconfirmed and prerelease targets use literal comparison; stored URL
spellings remain unchanged.

The latest fix adds **156 regression cases**: 66 for source, existing,
post-conversion, and included mixed-map protection; and 90 for the 12.11.1 URL
identity boundary, including all three strategies, prerelease/build metadata,
unconfirmed targets, converted scope conflicts, and valid source cleanup. The
initial regression run failed 102 cases before implementation. Eight older
tests incorrectly expected mixed maps to migrate; their expectations were
corrected after native 12.2.0, 12.8.2, 12.9.0, and 12.14.0 checks independently
confirmed rejection.

The real compatibility harness now separates deprecated conversion fixtures into
`scripts/verify-pnpm-registry-conversion.ts`. Routing fixtures run at 11.28.8,
11.28.9, 12.9.0, 12.10.0, 12.11.0, 12.11.1, 12.11.2, 12.15.0, and 12.16.1.
They verify both mixed-map orientations, converted duplicate prefixes, converted
scope conflicts or equivalence, native acceptance/rejection, and source cleanup
under all three strategies. Expected URL identity is recorded independently of
the production capability check.

Final verification for this follow-up:

- `pnpm run release:check`: passed, including lint without warnings, formatting,
  strict types, and **48 files / 1,934 tests**.
- `pnpm run build`: passed; the existing tsdown TypeScript 7 API warning remains.
- `pnpm run test:compatibility`: the complete default **38-release matrix
  passed**, including all nine expanded routing fixtures and every applicable
  prior consumption and frozen-install fixture.
- Final `pnpm run format:check` and `git diff --check`: passed.

No commit, push, or publication was performed. Real v10 consumption and
exhaustive upstream settings validation remain outside this harness.

## Ordinary declaration fields and URL-keyed string entries

The next review confirmed the mixed-map and 12.11.1 fixes, but found two
additional pre-existing validation omissions. Ordinary declarations such as
`{ prefix: false }`, `{ scopes: '@acme' }`, or `{ unknown: true }` could skip
field validation when no versioned marker was present. A pure string map with a
URL key could also be mistaken for the legacy scope-map representation. Under
all three strategies, 12.16.1 fixtures were written with no warnings and their
source settings removed, although native pnpm rejected the output. Both paths
also reproduced against HEAD.

Every declaration object now receives field-type, unknown-field, and ecosystem
validation. Release checks still control support for versioned fields and enum
values, rather than deciding whether basic validation runs. The string-map
branch rejects keys containing `://` or beginning with `//`, matching the
[upstream URL-key detection](https://github.com/pnpm/pnpm/blob/v12.16.0/pnpm/crates/config/src/workspace_yaml/registries.rs#L498-L500).
This includes malformed URL-looking keys without restricting legitimate legacy
scope names. Valid legacy maps, ordinary declarations, optional null fields,
and supported ecosystem declarations remain migratable.

Added **423 regression cases** in
`tests/migration/compatibility/registry-values.test.ts`. They exercise all three
strategies at 11.28.8, 12.9.0, and 12.16.1, with additional include-owner and
ecosystem controls. Invalid-only package manifests stay byte-for-byte unchanged
and do not create a workspace file. When unrelated valid settings migrate, the
complete invalid registry map stays in its source, including its valid siblings.
Invalid declarations and URL-keyed strings in `.npmrc` retain their original
sections and comments; simultaneous invalid package and npmrc sources both
remain intact. Existing invalid root or included YAML blocks every destination
write and source cleanup. The initial regression run failed **366 cases** before
the implementation fix.

`scripts/verify-pnpm-registry-values.ts` adds native acceptance/rejection and
source-retention checks to all nine routing fixture releases. Native probes
also exposed an older YAML reader difference: the selected v12 releases through
12.15.0 coerce `prefix: false` into the string prefix `"false"`, while 11.28.8,
11.28.9, and 12.16.1 reject the boolean. The harness asserts this observed
difference explicitly. The migrator retains the original boolean-valued setting
at each fixture release instead of coercing and cleaning it. Other invalid native
fixtures cover scalar scopes, unknown fields, and URL-keyed string entries.

Final verification for this follow-up:

- `pnpm run release:check`: passed, including lint without warnings, formatting,
  strict types, and **49 files / 2,357 tests**.
- `pnpm run build`: passed; the existing tsdown TypeScript 7 API warning remains.
- `pnpm run test:compatibility`: the full default **38-release matrix passed**,
  including all nine ordinary registry value/source-retention fixtures, the
  prior routing and conversion checks, and every applicable install and frozen
  consumption fixture.
- Final `pnpm run format:check` and `git diff --check`: passed.

No commit, push, or publication was performed. Real v10 consumption and
exhaustive upstream settings validation remain outside this harness.
