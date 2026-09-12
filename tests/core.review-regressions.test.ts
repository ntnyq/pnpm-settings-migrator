import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../src/core'
import { fsExists } from '../src/utils/fs'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/review regressions', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('review-regressions')

  it('keeps unrelated source values unchanged during runtime migration', async () => {
    const pnpm = {
      useNodeVersion: '22.13.0',
      auditConfig: { ignoreCves: ['CVE-original'] },
    }
    await writePackageJson({ pnpm })

    await migratePnpmSettings({
      cwd: testDir,
      compatibility: 'v11',
      cleanPackageJson: false,
    })

    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(pnpm)
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      auditConfig: { ignoreGhsas: ['CVE-original'] },
    })
  })

  it('keeps source runtimes when an existing declaration cannot accept them', async () => {
    await writePackageJson({
      devEngines: { runtime: { name: 'bun', version: '1.2.0' } },
      pnpm: { useNodeVersion: '22.13.0' },
    })
    await writeNpmrc('use-node-version=22.13.0\n')

    const result = await migratePnpmSettings({
      cwd: testDir,
      compatibility: 'v11',
    })

    expect(result.warnings.join('\n')).toContain('devEngines.runtime')
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ useNodeVersion: '22.13.0' })
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'use-node-version=22.13.0\n',
    )
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
    'retains conflicting root sources with %s',
    async strategy => {
      await writePackageJson({ pnpm: { nodeLinker: 'isolated' } })
      await writeNpmrc('node-linker=hoisted\n')

      await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v11',
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        nodeLinker: 'isolated',
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toContain(
        'node-linker=hoisted',
      )
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'checks each normalized source independently with %s',
    async strategy => {
      await writePackageJson({ pnpm: { allowNonAppliedPatches: false } })
      await writeNpmrc('allow-non-applied-patches=true\n')

      await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v11',
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        allowUnusedPatches: false,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toContain(
        'allow-non-applied-patches=true',
      )
    },
  )

  it('retains only Yarn resolutions that conflict with pnpm overrides', async () => {
    await writePackageJson({
      pnpm: { overrides: { foo: '1.0.0' } },
      resolutions: { foo: '2.0.0', bar: '3.0.0' },
    })

    await migratePnpmSettings({ cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      overrides: { foo: '1.0.0', bar: '3.0.0' },
    })
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual({
      resolutions: { foo: '2.0.0' },
    })
  })

  it('translates global Yarn selectors and retains unsupported paths', async () => {
    await writePackageJson({
      resolutions: {
        '**/foo': '1.0.0',
        '**/@scope/bar': '2.0.0',
        'parent/**/child': '3.0.0',
      },
    })

    const result = await migratePnpmSettings({ cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      overrides: { foo: '1.0.0', '@scope/bar': '2.0.0' },
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).resolutions,
    ).toStrictEqual({ 'parent/**/child': '3.0.0' })
    expect(result.warnings.join('\n')).toContain('parent/**/child')
  })

  it('leaves ambiguous translated Yarn selectors in their source', async () => {
    await writePackageJson({ resolutions: { foo: '1.0.0', '**/foo': '2.0.0' } })
    const before = await readWorkspaceFile('package.json')

    const result = await migratePnpmSettings({ cwd: testDir })

    expect(result.changedFiles).toStrictEqual([])
    expect(result.warnings.join('\n')).toContain('foo')
    await expect(readWorkspaceFile('package.json')).resolves.toBe(before)
  })

  it.each([
    { name: 'bun', version: '1.2.0' },
    { name: 'node', version: '24.0.0' },
  ])(
    'preserves all files when workspace runtime conflicts with $name',
    async runtime => {
      await writePackageJson({
        devEngines: { runtime },
        pnpm: { saveExact: true },
      })
      await writeWorkspaceYaml('useNodeVersion: 22.13.0\n')
      await writeNpmrc('node-linker=isolated\n')
      const before = await readWorkspaceFile('package.json')

      await expect(
        migratePnpmSettings({ cwd: testDir, compatibility: 'v11' }),
      ).rejects.toThrow('devEngines.runtime')

      await expect(readWorkspaceFile('package.json')).resolves.toBe(before)
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        'useNodeVersion: 22.13.0\n',
      )
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'node-linker=isolated\n',
      )
    },
  )

  it('cleans runtime sources already represented by the same Node declaration', async () => {
    await writePackageJson({
      devEngines: {
        runtime: [
          { name: 'bun', version: '1.2.0' },
          { name: 'node', version: '22.13.0' },
        ],
      },
    })
    await writeWorkspaceYaml('useNodeVersion: 22.13.0\n')
    await writeNpmrc('use-node-version=22.13.0\n')

    const result = await migratePnpmSettings({
      cwd: testDir,
      compatibility: 'v11',
    })

    expect(result.warnings).toStrictEqual([])
    expect(result.packageJsonRuntimeChanged).toBe(false)
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({})
    await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(false)
  })

  it.each(['v11', 'v12'] as const)(
    'retains scheme-relative registry credentials in %s',
    async compatibility => {
      await writePackageJson({
        pnpm: {
          registry: '//review-user:review-secret@registry.example.test/',
          saveExact: true,
        },
      })

      const result = await migratePnpmSettings({ cwd: testDir, compatibility })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm.registry,
      ).toContain('review-secret')
      expect(result.warnings.join('\n')).toContain('unsafe registry')
      expect(JSON.stringify(result)).not.toContain('review-secret')
    },
  )

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
