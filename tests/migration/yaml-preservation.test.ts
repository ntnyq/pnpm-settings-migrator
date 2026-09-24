import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../../src/core'
import { createTestWorkspace } from '../helpers'

describe('migratePnpmSettings/YAML preservation', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('yaml-preservation')

  describe.each([true, false])('root spacing %s', newlineBetween => {
    it.each(['|+', '>+'])(
      'preserves %s scalar content between roots and at EOF',
      async indicator => {
        const original = [
          'saveExact: true',
          'extraEnv:',
          `  MESSAGE: ${indicator}`,
          '    hello  ',
          '',
          '',
          'nodeOptions: |+',
          '  --trace-warnings  ',
          '',
          '',
          '',
        ].join('\n')
        await writeWorkspaceYaml(original)
        await writePackageJson({ pnpm: { saveExact: true } })
        const before = await readWorkspaceYaml()
        const options = {
          cwd: testDir,
          newlineBetween,
          cleanPackageJson: false,
        }

        const result = await migratePnpmSettings(options)

        await expect(readWorkspaceYaml()).resolves.toStrictEqual(before)
        expect(result.settingsChanges).toStrictEqual([])
        const repeated = await migratePnpmSettings(options)
        expect(repeated.changedFiles).toStrictEqual([])
      },
    )
  })

  it('preserves comments and anchors in unchanged YAML nodes', async () => {
    await writeWorkspaceYaml(
      [
        '# workspace packages',
        'packages:',
        "  - 'packages/*' # package glob",
        'catalog:',
        '  vue: &vue-version ^3.5.0 # shared version',
        '  vue-router: *vue-version',
      ].join('\n'),
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { foo: '1.0.0' } },
    })

    await migratePnpmSettings({ cwd: testDir })
    const updated = await readWorkspaceFile('pnpm-workspace.yaml')

    expect(updated).toContain('# workspace packages')
    expect(updated).toContain('# package glob')
    expect(updated).toContain('&vue-version')
    expect(updated).toContain('# shared version')
    expect(updated).toContain('*vue-version')
    expect(updated).toContain('overrides:')
  })

  it('materializes aliases whose legacy anchors are removed', async () => {
    await writeWorkspaceYaml(
      'onlyBuiltDependencies: &dependencies [foo]\nignoredOptionalDependencies: *dependencies\n',
    )

    await migratePnpmSettings({ cwd: testDir, compatibility: 'v11' })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      allowBuilds: { foo: true },
      ignoredOptionalDependencies: ['foo'],
    })
  })

  it('preserves aliases when overwriting an anchored scalar', async () => {
    await writePackageJson({ pnpm: { minimumReleaseAge: 20 } })
    await writeWorkspaceYaml('minimumReleaseAge: &age 10\nfetchRetries: *age\n')

    await migratePnpmSettings({ cwd: testDir, strategy: 'overwrite' })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      minimumReleaseAge: 20,
      fetchRetries: 10,
    })
  })

  it('sorts nested keys when expanding a forward alias', async () => {
    await writePackageJson({ pnpm: { saveExact: true } })
    await writeWorkspaceYaml(
      'overrides: &versions\n  zebra: 1.0.0\n  alpha: 2.0.0\ncatalog: *versions\n',
    )

    await migratePnpmSettings({ cwd: testDir, sortKeys: true })

    const workspace = await readWorkspaceYaml()
    expect(Object.keys(workspace.catalog)).toStrictEqual(['alpha', 'zebra'])
    expect(workspace.catalog).toStrictEqual(workspace.overrides)
  })

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'preserves alias values when an anchored root changes with %s',
    async strategy => {
      await writePackageJson({ pnpm: { catalog: { bar: '2.0.0' } } })
      await writeWorkspaceYaml(
        'catalog: &versions\n  foo: 1.0.0\ncatalogs:\n  shared: *versions\n',
      )

      await migratePnpmSettings({ cwd: testDir, strategy })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        catalog: { foo: '1.0.0', bar: '2.0.0' },
        catalogs: { shared: { foo: '1.0.0' } },
      })
    },
  )

  it('sorts keys without creating forward alias references', async () => {
    await writePackageJson({ pnpm: { saveExact: true } })
    await writeWorkspaceYaml(
      'overrides: &versions\n  foo: 1.0.0\ncatalog: *versions\n',
    )

    await migratePnpmSettings({ cwd: testDir, sortKeys: true })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      catalog: { foo: '1.0.0' },
      overrides: { foo: '1.0.0' },
      saveExact: true,
    })
  })
})
