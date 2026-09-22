import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../../src/core'
import { createTestWorkspace } from '../helpers'

describe('migratePnpmSettings/strategy', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('strategy')

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'preserves prototype-named overrides and cleans applied sources with %s',
    async strategy => {
      await writeWorkspaceYaml('overrides:\n  constructor: 1.0.0\n')
      await writePackageJson({
        pnpm: { overrides: { toString: '2.0.0' } },
      })

      await migratePnpmSettings({ cwd: testDir, strategy })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        overrides: { constructor: '1.0.0', toString: '2.0.0' },
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it('throws for invalid strategy', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { foo: '1.0.0' } },
    })

    await expect(
      migratePnpmSettings({
        cwd: testDir,
        // @ts-expect-error invalid strategy for runtime validation
        strategy: 'invalid',
      }),
    ).rejects.toThrow(
      'Invalid strategy: invalid. Expected one of: discard, merge, overwrite',
    )
  })

  it('uses discard strategy to keep existing values', async () => {
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\n\noverrides:\n  foo: 1.0.0\n',
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { bar: '2.0.0' }, packages: ['apps/*'] },
    })

    await migratePnpmSettings({ cwd: testDir, strategy: 'discard' })
    const workspace = await readWorkspaceYaml()

    expect(workspace.packages).toStrictEqual(['packages/*'])
    expect(workspace.overrides).toStrictEqual({ bar: '2.0.0', foo: '1.0.0' })
  })

  it('keeps source values that discard does not apply', async () => {
    await writeWorkspaceYaml('packages:\n  - packages/*\n')
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { packages: ['apps/*'] },
    })

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      strategy: 'discard',
    })

    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      packages: ['packages/*'],
    })
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
    expect(packageJson.pnpm).toStrictEqual({ packages: ['apps/*'] })
  })

  it('reports only settings changed by the final merge result', async () => {
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\n\noverrides:\n  foo: 1.0.0\n',
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { bar: '2.0.0' }, packages: ['apps/*'] },
    })
    const result = await migratePnpmSettings({
      cwd: testDir,
      strategy: 'discard',
    })

    expect(result.settingsChanges).toStrictEqual([
      {
        key: 'overrides',
        before: { foo: '1.0.0' },
        after: { foo: '1.0.0', bar: '2.0.0' },
      },
    ])
  })

  it('returns settings changes even when the CLI diff is hidden', async () => {
    await writeWorkspaceYaml('packages:\n  - packages/*\n')
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { packages: ['apps/*'] },
    })
    const result = await migratePnpmSettings({
      cwd: testDir,
      showChanges: false,
      strategy: 'overwrite',
    })
    expect(result.settingsChanges).toStrictEqual([
      { key: 'packages', before: ['packages/*'], after: ['apps/*'] },
    ])
  })

  it('uses overwrite strategy to prioritize incoming values', async () => {
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\n\noverrides:\n  foo: 1.0.0\n',
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { bar: '2.0.0' }, packages: ['apps/*'] },
    })

    await migratePnpmSettings({ cwd: testDir, strategy: 'overwrite' })
    const workspace = await readWorkspaceYaml()

    expect(workspace.packages).toStrictEqual(['apps/*'])
    expect(workspace.overrides).toStrictEqual({ bar: '2.0.0', foo: '1.0.0' })
  })

  it('uses merge strategy to dedupe arrays and keep existing primitives', async () => {
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\n  - common\n\noverrides:\n  foo: 1.0.0\n\nshamefullyHoist: true\n',
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { bar: '2.0.0' }, packages: ['apps/*', 'common'] },
    })

    await migratePnpmSettings({ cwd: testDir, strategy: 'merge' })
    const workspace = await readWorkspaceYaml()

    expect(workspace.packages).toStrictEqual(['packages/*', 'common', 'apps/*'])
    expect(workspace.overrides).toStrictEqual({ bar: '2.0.0', foo: '1.0.0' })
    expect(workspace.shamefullyHoist).toBe(true)
  })

  it('retains overlapping arrays from package.json and .npmrc', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { hoistPattern: ['*types*'] },
    })
    await writeNpmrc('hoist-pattern[]=*eslint*')

    await migratePnpmSettings({ compatibility: 'v10', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      hoistPattern: ['*types*', '*eslint*'],
    })
    await expect(readWorkspaceFile('.npmrc')).resolves.not.toContain(
      'hoist-pattern',
    )
  })

  it('deduplicates equivalent object values without reordering distinct entries', async () => {
    await writePackageJson({
      pnpm: {
        packageConfigs: [
          { saveExact: true, match: ['app'] },
          { match: ['app'], saveExact: false },
        ],
      },
    })
    await writeWorkspaceYaml(
      'packageConfigs:\n  - match: [app]\n    saveExact: true\n',
    )

    await migratePnpmSettings({ cwd: testDir, compatibility: 'v11' })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      packageConfigs: [
        { match: ['app'], saveExact: true },
        { match: ['app'], saveExact: false },
      ],
    })
  })

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'keeps repeated object-array migrations idempotent with %s',
    async strategy => {
      const packageConfigs = [{ match: ['app'], saveExact: true }]
      await writePackageJson({ pnpm: { packageConfigs } })
      await writeWorkspaceYaml(
        'packageConfigs:\n  - match: [app]\n    saveExact: true\n',
      )

      const options = {
        cwd: testDir,
        compatibility: 'v11' as const,
        cleanPackageJson: false,
        strategy,
      }
      await migratePnpmSettings(options)
      const result = await migratePnpmSettings(options)

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        packageConfigs,
      })
      expect(result.settingsChanges).toStrictEqual([])
      expect(result.changedFiles).toStrictEqual([])
    },
  )
})
