import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../../../src/core'
import { createTestWorkspace } from '../../helpers'

describe('migratePnpmSettings/npmrc values', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writeWorkspaceYaml,
  } = createTestWorkspace('npmrc-values')

  describe.each(['v10', 'v11', 'v12'] as const)('%s', compatibility => {
    it.each([
      ['git-shallow-hosts', 'gitShallowHosts', 'github.com'],
      [
        'ignored-optional-dependencies',
        'ignoredOptionalDependencies',
        'fsevents',
      ],
      ['minimum-release-age-exclude', 'minimumReleaseAgeExclude', 'react'],
      [
        'merge-git-branch-lockfiles-branch-pattern',
        'mergeGitBranchLockfilesBranchPattern',
        'main',
      ],
      ['required-scripts', 'requiredScripts', 'build'],
      [
        'sync-injected-deps-after-scripts',
        'syncInjectedDepsAfterScripts',
        'build',
      ],
      ['trust-policy-exclude', 'trustPolicyExclude', 'react'],
    ])('converts scalar %s to a YAML list', async (key, field, value) => {
      await writeNpmrc(
        `${key}=${value}\nregistry=https://registry.npmjs.org/\n`,
      )

      await migratePnpmSettings({ cwd: testDir, compatibility })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        [field]: [value],
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'registry=https://registry.npmjs.org/\n',
      )
    })

    it('preserves array patterns without wrapping or splitting them', async () => {
      await writeNpmrc(
        'public-hoist-pattern[]=@scope/{foo,bar}\npublic-hoist-pattern[]=!private-*\n',
      )

      await migratePnpmSettings({ cwd: testDir, compatibility })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        publicHoistPattern: ['@scope/{foo,bar}', '!private-*'],
      })
    })

    it.each([
      ['discard', ['*types*'], 'hoist-pattern=*eslint*\n'],
      ['merge', ['*types*', '*eslint*'], ''],
      ['overwrite', ['*eslint*'], ''],
    ] as const)(
      'migrates scalar hoist patterns safely with %s',
      async (strategy, hoistPattern, retainedNpmrc) => {
        await writeNpmrc(
          'hoist-pattern=*eslint*\npublic-hoist-pattern=@scope/{foo,bar}\nregistry=https://registry.npmjs.org/\n',
        )
        await writeWorkspaceYaml('hoistPattern: ["*types*"]\n')

        await migratePnpmSettings({ cwd: testDir, compatibility, strategy })

        await expect(readWorkspaceYaml()).resolves.toStrictEqual({
          hoistPattern,
          publicHoistPattern: ['@scope/{foo,bar}'],
        })
        await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
          `${retainedNpmrc}registry=https://registry.npmjs.org/\n`,
        )
      },
    )
  })

  it.each([
    ['changed-files-ignore-pattern', 'changedFilesIgnorePattern', '*.md'],
    ['external-dependencies', 'externalDependencies', 'react'],
    ['extra-bin-paths', 'extraBinPaths', './bin'],
    ['filter', 'filter', 'app'],
    ['filter-prod', 'filterProd', 'app'],
    ['packages', 'packages', 'packages/*'],
    ['test-pattern', 'testPattern', '*test*'],
    ['workspace-package-patterns', 'workspacePackagePatterns', 'packages/*'],
  ])('converts v12 scalar %s to a YAML list', async (key, field, value) => {
    await writeNpmrc(`${key}=${value}\n`)

    await migratePnpmSettings({ cwd: testDir, compatibility: 'v12' })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      [field]: [value],
    })
  })
})
