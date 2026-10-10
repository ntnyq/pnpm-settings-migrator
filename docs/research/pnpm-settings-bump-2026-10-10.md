# pnpm compatibility update — 2026-10-10

## Query and channels

Fetched the full npm packument at **2026-10-10 09:28:14 Asia/Shanghai
(01:28:14 UTC)**. Read `dist-tags`, `versions`, and `time`, and sorted numeric
SemVer components independently of publication time. The GitHub 100-release
page spans v12.11.2 through v11.6.0 and covers the complete interval after the
three baselines; no release-list pagination was needed.

| Major | Highest version without prerelease suffix | `latest-*` | `next-*` | npm publication (UTC)  |
| ----- | ----------------------------------------- | ---------- | -------- | ---------------------- |
| 10    | 10.34.6                                   | 10.34.6    | 10.34.6  | September 28, 19:46:40 |
| 11    | 11.28.5                                   | 11.28.2    | 11.28.5  | October 6, 05:23:58    |
| 12    | 12.11.2                                   | 12.10.1    | 12.11.2  | October 9, 17:35:58    |

The default installation tag `latest` is **12.10.1**, published October 6 at
17:35:56 UTC. The highest confirmed stable release is **12.11.2**, on
`next-12`. GitHub marks all targets and the four intervening v12 releases
`prerelease: false`, `draft: false`. The `next-*` channel labels are retained
here rather than treated as prerelease suffixes. No new pnpm prerelease was
published after the previous query on October 6.

Sources: [npm metadata](https://registry.npmjs.org/pnpm),
[GitHub releases API](https://api.github.com/repos/pnpm/pnpm/releases?per_page=100).

## Repository and baselines

Confirmed package identity `pnpm-settings-migrator` and a clean initial working
tree. The development pin changes from **12.9.1 to 12.10.1**, following `latest`.
The user-managed launcher was already 12.10.1; it initially warned about the
older repository pin. All subsequent package operations used the matching pin
and `/Users/ntnyq/Library/pnpm/bin` prepended to the existing PATH. No runtime
cache or bundled pnpm installation was modified.

The lockfile changes only pnpm and its platform executable records. No library
dependencies, including `@pnpm/types`, needed updating. The migrator's contract
of leaving user project package-manager pins unchanged is preserved.

| Major | Implemented before                                                                                               | Verified before                                                                                     | Implemented / verified after                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| v10   | Legacy schema, source review through 10.34.6                                                                     | Unit regressions; no recorded real v10 consumption run                                              | Unchanged; latest release unchanged; real v10 still unverified                                                           |
| v11   | Schema and exact validation boundaries through 11.28.5                                                           | October 6 audit records successful real fixtures through 11.28.5                                    | Unchanged support; existing real fixtures rechecked in this run                                                          |
| v12   | Capabilities and value shapes through 12.10.0; provenance/filter allowlists broader than actual YAML consumption | October 6 audit records real fixtures through 12.10.0, without provenance/filter consumption checks | Adds 12.11 permission/skill/provenance support and corrects ignored-filter retention; real fixtures pass through 12.11.2 |

Baseline evidence: `package.json`, `.github/workflows/ci.yml`,
`src/constants/pnpm-v*.ts`, `pnpm-capabilities.ts`,
`src/features/compatibility/{target,version}.ts`, the settings validators,
regression tests, real-pnpm scripts, and the
[October 6 audit](pnpm-settings-bump-2026-10-06.md). Capability minima indicate
introductions, not support ceilings; matrix membership alone does not prove a
successful run. Historical results describe the earlier checkout, not a fresh
verification of this run's starting tree.

The package's Node requirement remains `^22.19.0 || >=24.11.0`; its normal CI
matrix remains 22.19.0, 24.11.0, and 26.x. The pnpm wrapper's npm engine
requirement is `>=18.*`, so no package engine increase is needed. However,
pnpm 12.11 explicitly requires **Node ^24.18.0 or >=26.2.0 for the experimental
loaded linker**. The real compatibility CI job changes from 24.11.0 to
24.18.0 to run that fixture. Local checks used Node **24.21.0** on macOS.

## Release and exact-tag review

Read every intervening release's notes and compared the complete configuration
crate from exact-tag source archives at 12.10.0, 12.10.1, 12.11.0, 12.11.1,
and 12.11.2. The GitHub compare API hit its 300-file response ceiling for two
intervals; the complete archive comparison avoids relying on truncated diffs.
The typed settings, known/refused keys, nested sections, environment overlay,
workspace scope, loading, reset, resolved reporting, and validation were reviewed.

| Release                                                       | GitHub publication (UTC) | Relevant result                                                                                   |
| ------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| [12.10.1](https://github.com/pnpm/pnpm/releases/tag/v12.10.1) | October 6, 17:37:30      | Loaded-linker generated-file locations and defaults change; no schema addition                    |
| [12.11.0](https://github.com/pnpm/pnpm/releases/tag/v12.11.0) | October 9, 06:43:40      | Adds permissions, skills, workspace provenance, Rust tool support, and bootstrap config tolerance |
| [12.11.1](https://github.com/pnpm/pnpm/releases/tag/v12.11.1) | October 9, 12:28:20      | npm registry alias/auth normalization and install fixes; new settings shapes unchanged            |
| [12.11.2](https://github.com/pnpm/pnpm/releases/tag/v12.11.2) | October 9, 17:38:44      | CLI Infinity parsing, updateConfig filter application, and store fetch fixes; no new YAML fields  |

| Difference                                                               | Classification                | Migration decision                                                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `permissions` and `skills`                                               | Implementation needed         | Add exact 12.11.0 field capability, nested validation, and explicit public types                                                        |
| Boolean `permissions.<package>.build` overrides `allowBuilds`            | New behavior preserved        | Migrate both unchanged; pnpm applies precedence. Do not convert existing allowBuilds into permissions                                   |
| Undecided permission strings and nulls                                   | Implementation needed         | Preserve strings, null capabilities, empty entries, and null package entries; do not turn prompts into approvals                        |
| Unknown permission capabilities or skill options                         | Implementation needed         | Retain the complete source object rather than losing ignored nested fields                                                              |
| Workspace `provenance`                                                   | Existing allowlist too broad  | Gate v12 consumption at 12.11.0; preserve existing v11 support                                                                          |
| `filter` and `filterProd`                                                | Existing migration gap        | Exclude from the v12 workspace schema, retain source values, and reject existing ignored YAML before writes; keep ordered v11 migration |
| `cargo.enabled` Rust toolchain management                                | Already covered               | Existing boolean configuration remains unchanged; runtime installation behavior needs no conversion                                     |
| `tools.rust`                                                             | Existing protection preserved | `tools` remains trusted global configuration; do not migrate into project YAML                                                          |
| Loaded linker locations/defaults and Node requirement                    | No new migration rule         | Preserve explicit linker settings without materializing defaults; update compatibility CI's Node version                                |
| Bootstrap skips unreadable settings before switching versions            | Outside source migration      | Keep existing exact-target resolution and conservative unknown/prerelease handling                                                      |
| Registry alias and credential resolution                                 | Existing protection preserved | Do not rewrite registry aliases or move credentials; pnpm performs request/auth normalization                                           |
| CLI Infinity, hooks, store fetching, publishing, and other runtime fixes | Outside source migration      | No empty capability entries or speculative conversions                                                                                  |

Exact-tag sources:

- [12.11.0 permission shapes, application, and precedence](https://github.com/pnpm/pnpm/blob/v12.11.0/pnpm/crates/config/src/workspace_yaml/permissions.rs)
- [12.11.0 workspace fields](https://github.com/pnpm/pnpm/blob/v12.11.0/pnpm/crates/config/src/workspace_yaml/settings.rs)
- [12.11.0 nested sections and Rust tools](https://github.com/pnpm/pnpm/blob/v12.11.0/pnpm/crates/config/src/workspace_yaml/sections.rs)
- [12.11.0 trusted/global settings](https://github.com/pnpm/pnpm/blob/v12.11.0/pnpm/crates/config/src/known_settings.rs)
- [12.11.1 auth normalization](https://github.com/pnpm/pnpm/blob/v12.11.1/pnpm/crates/config/src/npmrc_auth/credentials.rs)
- [12.11.2 filter scope](https://github.com/pnpm/pnpm/blob/v12.11.2/pnpm/crates/config/src/settings.rs)
- [12.11.2 explicit config reporting](https://github.com/pnpm/pnpm/blob/v12.11.2/pnpm/crates/cli/src/cli_args/config.rs)
- [12.11.2 actual skill linking](https://github.com/pnpm/pnpm/blob/v12.11.2/pnpm/crates/package-manager/src/agent_skills.rs)

The absence of YAML filter fields was also checked in
[12.0.0](https://github.com/pnpm/pnpm/blob/v12.0.0/pnpm/crates/config/src/workspace_yaml.rs)
and [12.4.0](https://github.com/pnpm/pnpm/blob/v12.4.0/pnpm/crates/config/src/workspace_yaml.rs),
as well as every exact tag in the current interval. The 12.11.2 hook fix must
not be interpreted as introducing YAML filter support.

Observed shape details: pnpm accepts a null per-package permission entry as an
empty map. Its YAML reader also coerces some scalar types, such as a boolean
inside `skills.dirs` to a string and the string `"false"` to a provenance
boolean. The migrator deliberately preserves those noncanonical scalar shapes
in their source instead of silently changing their meaning. Public types and
validation use string directory lists and boolean/null provenance. This is
conservative validation, not a claim that pnpm rejects every retained value.

## Implementation

- `src/constants/pnpm-capabilities.ts` and `pnpm-v12.ts`: exact 12.11 capability
  and provenance gating; `pnpm-v11.ts`: v11-only workspace filters.
- `src/features/settings/permissions.ts` and `versioned-values.ts`: nested
  validation and intact source retention.
- `src/types/pnpm-v12.ts`, `workspace.ts`, and `src/index.ts`: public permission,
  skill, and provenance types with explicit exports.
- `tests/migration/compatibility/pnpm-12.11.test.ts`: introductions, real
  predecessor, imprecise/prerelease/unknown-major pins, explicit target,
  optional shapes, malformed values, existing YAML, precedence, and all merge
  strategies. `tests/migration/filters.test.ts` and `sources/npmrc.test.ts`
  correct the previously unverified v12 filter expectation.
- `scripts/verify-pnpm-permissions.ts` and `verify-pnpm-filters.ts`: real
  consumption and ignored-field fixtures; existing harness integration retains
  all older regressions. CI and the default matrix add all four new releases.
- `README.md`, `package.json`, and `pnpm-lock.yaml`: current claims and toolchain.

For example, on target 12.11.0:

```json
{
  "pnpm": {
    "allowBuilds": { "example": true },
    "permissions": { "example": { "build": false, "skills": true } },
    "skills": { "dirs": [".agents/skills"] },
    "provenance": false
  }
}
```

becomes:

```yaml
allowBuilds:
  example: true
permissions:
  example:
    build: false
    skills: true
skills:
  dirs: [.agents/skills]
provenance: false
```

pnpm denies the example build using its permission precedence. On 12.10.1,
only `allowBuilds` migrates; the other settings remain in `package.json` with
diagnostics. Credentials, dynamic proxy/registry protections, project-refused
settings, default handling, and user pins retain their existing contracts.

## Verification

Commands use the user-managed pnpm and preserve the active Node version:

```sh
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm --version
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm install --lockfile-only --ignore-scripts
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm install --frozen-lockfile --ignore-scripts
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run release:check
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run build
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run test:compatibility
rtk proxy env PATH="/Users/ntnyq/Library/pnpm/bin:$PATH" pnpm run test:compatibility -- 12.10.1 12.11.2
```

- Lockfile generation and frozen dependency installation passed with pnpm
  **12.10.1** and no unrelated dependency updates.
- Final `release:check` passed with no lint warnings: formatting, strict
  TypeScript, and **845 tests in 36 files**. Library, CLI, and public declaration
  builds passed. tsdown still emits its existing experimental TypeScript 7 API
  warning.
- All **27** releases in the complete real-pnpm matrix passed: **11.25.0,
  11.26.0, 11.27.1, 11.28.0, 11.28.1, 11.28.2, 11.28.3, 11.28.4, 11.28.5,
  12.2.1, 12.3.4, 12.4.0, 12.4.2, 12.5.0, 12.5.1, 12.6.0, 12.7.0,
  12.8.0, 12.8.1, 12.8.2, 12.9.0, 12.9.1, 12.10.0, 12.10.1, 12.11.0,
  12.11.1, 12.11.2**. Every version ran its base migration, config, install,
  and frozen-install fixture; version-specific branches retained the earlier
  registry-concurrency, loaded-linker, lockfile, pipeline, ecosystem, and
  validation regressions.
- The new permissions fixture passed on **12.11.0, 12.11.1, and 12.11.2**;
  **12.10.1** passed the preceding-release retention/ignored-config check.
  Real ignored-filter checks passed on **12.8.2, 12.9.0, 12.9.1, 12.10.0,
  12.10.1, 12.11.0, 12.11.1, and 12.11.2**. The v11 ordered-filter unit
  regressions remain green.
- A final targeted run on **12.10.1 and 12.11.2** passed after extracting the
  ignored-filter fixture into its own module. No unresolved check failure remains.
- The new real fixture packs three local test packages in a temporary workspace.
  It checks boolean build approval/denial against opposite `allowBuilds` values,
  an undecided string's fallback, approved/denied skill links, removal with
  `skills.dirs: []`, frozen lockfile stability, explicit config reporting,
  invalid shapes, and unknown capability diagnostics. No publishing is needed
  to verify the provenance configuration value.
- Initial fixture development exposed incorrect expectations about explicit
  `config list` reporting, full package IDs required for local tarball approval,
  pnpm's skill-link filenames, and YAML scalar coercion. The fixtures were
  corrected using exact-tag source and real execution. No production migration
  failure was hidden by changing assertions.

Limits: v10 real consumption remains unverified. Checks exercise documented
fixtures, not every setting, upstream runtime fix, or environment. The broader
inherited schema is not claimed to have exhaustive value validation. Cargo
runtime installation, actual publishing/provenance attestations, and cross-OS
CI runs were not executed locally. No CI job was dispatched, and no commit,
push, pull request, or publication was performed.
