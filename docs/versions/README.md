# pnpm version field differences

These notes collect the version-specific field documentation formerly in the
root README, supplemented by the repository's existing dated audits. They are
not a fresh upstream audit or a complete history of all pnpm releases.

Each `v<major>/<major>.<minor>.md` file compares that minor with the preceding
minor on the same major line. The `.0` minor records the transition from the
previous major. Patch changes stay in their minor file with exact first-supported
or first-rejected versions; they must not be applied to the entire minor.
Where a full comparison is unavailable, the file identifies the missing baseline.
An absent file means history has not been recorded, not that no fields changed.

The notes distinguish new names from existing fields newly consumed by workspace
YAML, nested value changes, removals, deprecations, defaults, and project scope.
They describe the migrator's implemented behavior; dated audit suggestions and
verification results apply to the checkout recorded in each audit. A source link
or test definition alone is not evidence of a newly executed verification.

Unsupported or invalid incoming settings remain intact in their sources with
diagnostics. Incompatible existing workspace settings fail validation before
writes. Exact stable targets enable known capabilities on their major line;
unconfirmed targets keep the conservative base schema. Defaults are not inserted.

## v10

- [10.26](v10/10.26.md)
- [10.34](v10/10.34.md)

## v11

- [11.0](v11/11.0.md)
- [11.21](v11/11.21.md)
- [11.22](v11/11.22.md)
- [11.23](v11/11.23.md)
- [11.24](v11/11.24.md)
- [11.25](v11/11.25.md)
- [11.26](v11/11.26.md)
- [11.27](v11/11.27.md)
- [11.28](v11/11.28.md)

## v12

- [12.0](v12/12.0.md)
- [12.1](v12/12.1.md)
- [12.2](v12/12.2.md)
- [12.3](v12/12.3.md)
- [12.4](v12/12.4.md)
- [12.5](v12/12.5.md)
- [12.6](v12/12.6.md)
- [12.7](v12/12.7.md)
- [12.8](v12/12.8.md)
- [12.9](v12/12.9.md)
- [12.10](v12/12.10.md)
- [12.11](v12/12.11.md)
- [12.12](v12/12.12.md)
- [12.13](v12/12.13.md)
- [12.14](v12/12.14.md)
- [12.15](v12/12.15.md)
- [12.16](v12/12.16.md)
- [12.17](v12/12.17.md)
- [12.18](v12/12.18.md)
- [12.19](v12/12.19.md)
- [12.20](v12/12.20.md)

## Historical compatibility verification

On 2026-11-13, the full applicable harness passed locally on **11.28.11,
12.18.0, 12.19.0 and 12.20.0**. The new fixtures verify project-scoped optional
peer bindings with real local packages, v9/v13 output and frozen installs, and
the v13 local-directory specifier boundary between 12.19.0 and 12.20.0.
At that query, npm `latest` and the development pin remained 12.18.0; the highest
confirmed stable release was 12.20.0 on `next-12`. A follow-up `pnpm run test:compatibility` completed the full **44-release**
default matrix (15 v11 and 29 v12) with exit code 0 and every applicable fixture
awaited. The default and CI version lists were checked to match exactly.
See the [November 13 audit](../research/pnpm-settings-bump-2026-11-13.md) for
source evidence, commands and verification limits.

Compatibility checks cover pnpm 11.28.11 and 12.18.0, including 11.28.0,
11.28.1, 11.28.2, 11.28.3, 11.28.4, 11.28.5, 11.28.6, 12.7.0, 12.8.0,
12.8.1, 12.8.2, 12.9.0, 12.9.1, 12.10.0, 12.10.1, 12.11.0, 12.11.1,
12.11.2, 12.12.0, 12.12.1, 12.13.0, 12.14.0, 11.28.7, 11.28.8,
11.28.9, 11.28.10, 12.15.0, 12.16.0, 12.16.1, and 12.17.0.
Earlier regressions remain at 11.25.0,
11.26.0, 11.27.1, 12.2.1, 12.3.4, 12.4.0, 12.4.2, 12.5.0, 12.5.1, and 12.6.0.
On 2026-11-06, npm `latest`, `latest-12`, and `next-12` pointed to the
project's development pin and highest stable release, 12.18.0. The highest
stable v11 release was 11.28.11 on `next-11`; `latest-11` remained 11.28.9.
The 12.18 fixtures check chosen nested skill linking, platform-specific
optional dependencies, YAML null boundaries, and frozen installs.
The 12.17 fixtures check release
commands in a temporary Git repository and override matching in real installs.
The complete 42-release matrix passed locally on 2026-11-06, covering 15 v11
releases and 27 v12 releases with every applicable fixture.
See the [November 6 compatibility audit](../research/pnpm-settings-bump-2026-11-06.md)
for the exact releases executed in this update and historical verification.
Local and config dependency `include` consumption is verified on 12.15.0,
with 12.14.0 as the preceding boundary. On 10.34.9, CLI migration and frozen
installs verify plain and wildcard override cases. The full migration harness
covers v11 and v12. The 12.16 fixtures
verify TLS certificate handling against a temporary HTTPS registry, dist-tag
selection, runtime suppression, required script enforcement, and frozen
installs. They use OpenSSL to create a disposable certificate.
Routing fixtures at 11.28.8, 11.28.9, 12.9.0, 12.10.0, 12.11.0, 12.11.1,
12.11.2, 12.15.0, and 12.16.1 verify prefix/scope conflicts, mixed registry
representations after conversion, and rejection before writes under all three
strategies. They compare native URL normalization across the 12.11.1 boundary.
The removed `pnpm install --resolution-only` CLI flag is outside this settings
migrator's scope; replace it with `pnpm peers check` in scripts before upgrading.
