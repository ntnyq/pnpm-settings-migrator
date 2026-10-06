import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmRegistryDeclaration, PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  registries: {
    'https://registry.example/npm/': {
      scopes: ['@acme'],
      networkConcurrency: 4,
    },
    'https://other.example/': { scopes: ['@other'] },
  },
} satisfies PnpmWorkspace

describe('pnpm 12.9 registry concurrency', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.9')

  it('exports per-registry concurrency through the public type', () => {
    expectTypeOf<PnpmRegistryDeclaration['networkConcurrency']>().toEqualTypeOf<
      number | null | undefined
    >()
  })

  it.each(['12.9.0', '12.9.1', '12.10.0', '12.9.0+sha512.abc'])(
    'migrates and cleans complete registry declarations for %s',
    async version => {
      await writePackageJson({
        packageManager: `pnpm@${version}`,
        pnpm: settings,
      })
      const result = await migratePnpmSettings({ cwd: testDir })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each([
    'pnpm@11.28.5',
    'pnpm@12.8.2',
    'pnpm@12.9.0-rc.1',
    'pnpm@^12.9.0',
    'pnpm@13.0.0',
    undefined,
  ])(
    'retains the entire registry map for unconfirmed pin %s',
    async version => {
      await writePackageJson({
        packageManager: version,
        pnpm: { ...settings, saveExact: true },
      })
      const result = await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v12',
      })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(settings)
    },
  )

  it('uses an explicit supporting target over an older project pin', async () => {
    await writePackageJson({ packageManager: 'pnpm@12.8.2', pnpm: settings })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.9.0' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).packageManager,
    ).toBe('pnpm@12.8.2')
  })

  it.each([0, -1, 1.5, '4', false, {}, [], Number.MAX_SAFE_INTEGER + 1])(
    'retains invalid nested concurrency %j without partially cleaning the map',
    async networkConcurrency => {
      const invalid = {
        registries: {
          ...settings.registries,
          'https://invalid.example/': { networkConcurrency },
        },
      }
      await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.9.0',
      })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(invalid)
    },
  )

  it('accepts a null concurrency as an unset optional limit', async () => {
    const registries = {
      'https://registry.example/': { networkConcurrency: null },
    }
    await writePackageJson({ pnpm: { registries } })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.9.0' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({ registries })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it.each([
    { typo: true },
    { scopes: '@acme' },
    { scopes: [true] },
    { scopes: ['acme'] },
    { prefix: false },
    { serverType: 'unknown' },
    { supportsTimeField: 'true' },
    { ecosystem: 'unknown' },
    { ecosystem: 'cargo', scopes: ['@acme'] },
    { packages: ['requests'] },
    { ecosystem: 'pypi', packages: [false] },
  ])(
    'retains invalid sibling fields alongside concurrency: %j',
    async options => {
      const invalid = {
        registries: {
          'https://registry.example/': { networkConcurrency: 4, ...options },
        },
      }
      await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.9.0',
      })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(invalid)
    },
  )

  it('retains mixed registry declaration and legacy scope map shapes', async () => {
    const invalid = {
      registries: {
        ...settings.registries,
        '@legacy': 'https://legacy.example/',
      },
    }
    await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.9.0' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(invalid)
  })

  it.each([
    {
      scopes: ['@acme'],
      prefix: 'work',
      serverType: 'artifactory',
      supportsTimeField: false,
    },
    { ecosystem: 'pypi', packages: ['requests'] },
    { ecosystem: 'cargo' },
    {
      ecosystem: null,
      scopes: null,
      prefix: null,
      serverType: null,
      supportsTimeField: null,
      packages: null,
    },
  ])(
    'preserves supported registry options alongside concurrency: %j',
    async options => {
      const valid = {
        registries: {
          'https://registry.example/': { networkConcurrency: 4, ...options },
        },
      }
      await writePackageJson({ pnpm: valid })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.9.0',
      })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(valid)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it('preserves a valid existing workspace byte for byte', async () => {
    const original = stringify(settings)
    await writePackageJson({ packageManager: 'pnpm@12.9.1' })
    await writeWorkspaceYaml(original)
    const result = await migratePnpmSettings({ cwd: testDir })
    expect(result.changedFiles).toStrictEqual([])
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it.each([
    { targetVersion: '12.8.2', workspace: settings },
    {
      targetVersion: '12.9.0',
      workspace: {
        registries: { 'https://registry.example/': { networkConcurrency: 0 } },
      },
    },
  ])(
    'rejects incompatible existing registry settings for $targetVersion before writing',
    async ({ targetVersion, workspace }) => {
      const original = stringify(workspace)
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('node-linker=isolated')
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'node-linker=isolated',
      )
    },
  )

  it.each([
    { strategy: 'discard', networkConcurrency: 2, retained: settings },
    { strategy: 'merge', networkConcurrency: 2, retained: settings },
    { strategy: 'overwrite', networkConcurrency: 4, retained: undefined },
  ] as const)(
    'retains conflicting registry source values with $strategy',
    async ({ strategy, networkConcurrency, retained }) => {
      await writePackageJson({ pnpm: settings })
      await writeWorkspaceYaml(
        stringify({
          registries: {
            'https://registry.example/npm/': { networkConcurrency: 2 },
          },
        }),
      )
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.9.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        registries: {
          ...settings.registries,
          'https://registry.example/npm/': {
            scopes: ['@acme'],
            networkConcurrency,
          },
        },
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )
})
