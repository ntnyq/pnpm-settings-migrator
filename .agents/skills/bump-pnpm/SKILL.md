---
name: bump-pnpm
description: Update pnpm settings migration compatibility in pnpm-settings-migrator. Fetch the latest pnpm releases, compare implemented and verified support, update fields, value shapes, migration rules, types, tests, and documentation, and report the changes. Use for bump-pnpm requests or updates to the migrator's pnpm version support.
---

# Bump pnpm

Complete a pnpm compatibility update for pnpm-settings-migrator, implementing and
verifying changes by default. For audit-only requests, report differences and
recommendations. Fetch fresh evidence on every run; this skill and historical
reports are not sources of current version information.

## Establish the repository and baseline

Locate the Git root from the current working directory. Read applicable
`AGENTS.md` files and their references. Confirm that `package.json#name` is
`pnpm-settings-migrator`; otherwise, ask the user to identify the repository
before applying this specialized workflow. Follow repository command wrappers,
including RTK where required.

Inspect Git status and existing diffs, preserving uncommitted work. Read the
current working tree and compare it with HEAD when useful. Do not count existing
implementation as work added in this run or assume it has been verified.

Extract the following versions separately, recording their paths and evidence:

| Version meaning           | Primary evidence                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Development toolchain pin | `package.json#packageManager`, `engines`, and CI                                                           |
| Implemented compatibility | `src/constants/pnpm-v*.ts`, `pnpm-capabilities.ts`, version resolution, schema, and value shape validation |
| Verified compatibility    | Tests, `scripts/verify-pnpm-compatibility.ts`, CI, and audit records with explicit results                 |

Check `README.md` and `docs/research/` for differences between documentation and
implementation. A capability's `minimumVersion` marks its introduction, not the
upper limit of overall support. A version in a test matrix does not prove that
the test passed. Without clear evidence, report partial implementation or
unverified support instead of inventing a single latest supported version.
Establish a baseline for each supported major.

## Fetch upstream versions and changes

Use online tools or registry requests, recording the query time and timezone:

- Read `dist-tags`, `versions`, and `time` from the
  [npm registry](https://registry.npmjs.org/pnpm). Record at least `latest` and
  available `latest-*` and `next-*` tags for each supported major.
- Find the highest published SemVer without a prerelease suffix, both overall
  and within each supported major. Sort by semantic version, not strings or
  publication time.
- Check release status, publication dates, and notes in the
  [official pnpm releases](https://github.com/pnpm/pnpm/releases). Paginate API
  results when necessary to cover the full interval.

Distinguish the default installation tag `latest`, the highest stable version,
`next` channels, and prereleases. Label versions on `next-*` even when their
SemVer has no prerelease suffix. If GitHub marks such a release as a prerelease,
list it separately instead of automatically targeting it for stable support.
By default, update migration capabilities for the highest confirmed stable
release and inspect new releases within existing supported majors. The
development toolchain follows `latest` by default. Report prereleases as relevant,
but target them only when requested.

Read release notes for every release between each major's baseline and target,
and compare configuration source at **exact tags**. Check added, removed,
renamed, and deprecated fields, plus types, enums, nested shapes, defaults,
precedence, scope, and configuration reading behavior. Patch releases can change
schemas. Audit existing implementation that lacks verification as well.
Use official pnpm source, releases, documentation, and npm metadata as evidence.
When documentation differs from the target tag, resolve the discrepancy using
that version's source and observed behavior, and record it.

Useful source entry points, to relocate within the target tag if paths change:

- Rust configuration under `pnpm/crates/config/src/`: `workspace_yaml.rs`,
  `workspace_yaml/package_configs.rs`, `known_settings.rs`, `config_types.rs`,
  and `refused_keys.rs`.
- TypeScript configuration under `pnpm11/config/reader/src/`: types, unknown
  settings checks, and conversion logic.

Classify each change as already covered, implementation needed, unrelated to
settings migration, or unconfirmed. Keep source links. If networking fails or
release information conflicts, continue independent local checks and report
what remains unconfirmed. Do not claim cached versions are freshly verified or
upgrade blindly from them.

## Implement the corresponding changes

Choose files based on the actual impact. Search for relocated files before
editing.

| Change                                                          | Repository entry points                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Top-level fields, refused fields, version capabilities          | `src/constants/pnpm-v*.ts`, `pnpm-capabilities.ts`, `settings-fields.ts`, `settings-schema.ts` |
| Target resolution, exact versions, capability boundaries        | `src/features/compatibility/target.ts`, `version.ts`                                           |
| Value types, nested shapes, version differences                 | `src/features/settings/schema.ts`, `versioned-values.ts` when present                          |
| Deprecated settings, build/runtime conversion                   | `src/features/compatibility/`                                                                  |
| `.npmrc`, subproject configuration, source cleanup, persistence | `src/features/sources/`, `src/features/migration/`                                             |
| Public types and API                                            | `src/types/`, relevant `index.ts` files, explicit exports in `src/index.ts`                    |
| CLI targets, help, warnings                                     | `src/cli/`, `src/constants/cli.ts`, option types and defaults                                  |
| Regressions and real pnpm verification                          | `tests/`, `scripts/verify-pnpm-compatibility.ts`, `.github/workflows/ci.yml`                   |

Preserve these migration constraints:

- Gate capabilities at their exact first supported release. Do not enable a
  minor or patch addition for an entire major. Validate nested value shapes as
  well as field allowlists.
- Keep inferred targets, explicit `targetVersion`, and major conflict handling
  consistent. Do not assume capabilities for ranges, missing versions,
  prereleases, or unknown new majors.
- For a new major, explicitly review and extend target types, CLI, resolution,
  schemas, and tests. An existing resolver mapping higher majors to an older
  schema does not establish support for the new major.
- Preserve source values that cannot migrate or are invalid for the target,
  with diagnostics following the existing contract. Do not silently discard
  nested fields to pass validation or delete partially migrated objects.
- Preserve existing protections for credentials, machine-level configuration,
  and dynamic values. Change classification only with upstream evidence.
- Follow target-version precedence when old and new keys coexist. Preserve
  `discard`, `merge`, and `overwrite` semantics. Do not materialize upstream
  default changes as explicit user configuration.

If `latest` exceeds the toolchain pin, check Node and CI requirements before
updating the pin. Do not downgrade a newer existing pin. Update only dependencies
needed for the implementation, such as `@pnpm/types`; their version numbers do
not represent pnpm versions. Regenerate the lockfile with the declared pnpm when
needed and inspect its diff. Avoid unrelated bulk dependency upgrades.
Maintaining this repository's development pin is separate from changing whether
the migrator rewrites user project pins: preserve the migrator's existing contract.

Add capability rules only when fields or behavior change. If upstream introduces
no relevant differences, update necessary verification records and documentation.
Do not add empty capability entries for every patch or manufacture code changes.

## Verify

Add regression tests for every behavior change using the isolated workspace
helpers in `tests/helpers.ts`. Cover source configuration, generated YAML, and
cleanup as relevant, including existing workspaces, invalid nested values, the
first supporting release, and an actual preceding release. Cover all three
strategies for merge changes. Version resolution changes should also cover
imprecise versions, prereleases, precedence, and conflicts between explicit
targets and project declarations.

Use the repository's declared pnpm and applicable RTK wrappers. Replace the
version placeholder below with the exact releases to verify:

```sh
rtk pnpm run release:check
rtk pnpm run build
rtk pnpm run test:compatibility -- <exact-versions-to-verify>
```

Inspect the compatibility script's supported majors and conditional branches
before extending the matrix. It may only distinguish v11/v12 and activate
specific capability checks for exact versions. Adding a version argument alone
does not verify its new capabilities. Add corresponding fixtures and assertions,
retaining older-version regressions. For new capabilities, run migration,
`config list --json`, and applicable install/frozen install checks against real
pnpm releases. Check unknown-field warnings and actual consumption of the
configuration. Run real installation checks only in temporary workspaces.

Record executed versions, commands, results, and incomplete checks. Distinguish
failures introduced by this work from existing issues and network or environment
limitations. Do not describe inclusion in a matrix as a successful verification.

## Save findings and report

Save the audit to `docs/research/pnpm-settings-bump-YYYY-MM-DD.md`. Runs on the
same day may update the same report, recording the new query time. Include
baselines, channels, targets, individual differences, sources, implementation
files, and verification results. Preserve the dated context of historical audits.
Update current README compatibility claims, verification matrices, and affected
examples without presenting historical `latest` values as current facts.

Report in the user's language:

1. Query time; npm `latest`, the highest stable release and its channel; the
   toolchain pin before and after the update.
2. Implemented and verified support before and after, per major, with uncertain
   coverage explicitly identified.
3. Added, changed, removed, or preserved migration behavior, with a short
   input/output example when useful.
4. Links to changed files and the audit report, successful checks, and failed
   or unverified checks with reasons.

If there are no functional differences, state that no new migration rules are
needed and identify the versions and evidence examined. Complete local changes
and verification; commit, push, open a PR, or publish only according to the
user's separate authorization.
