import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmRegistryDeclaration, PnpmWorkspace } from '../../../src'
import { fsExists } from '../../../src/utils/fs'
import { createTestWorkspace } from '../../helpers'

const latestSettings = {
  concurrencyGroups: { cargo: 2 },
  tasks: { build: { concurrencyGroup: 'cargo', outputs: ['dist/**'] } },
  supportedArchitectures: ['current', 'linux-x64-musl', 'darwin-arm64'],
  python: {
    enabled: false,
    versions: ['3.12', '3.13'],
    overrides: ['urllib3==2.5.0'],
    constraints: ['requests>=2'],
  },
  registries: {
    'https://pypi.org/simple/': { ecosystem: 'pypi', packages: ['*'] },
    'https://index.crates.io/': { ecosystem: 'cargo' },
  },
} satisfies PnpmWorkspace

describe('pnpm 12.5 settings', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
    writeNpmrc,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.5')

  it('exports registry and architecture types through the workspace contract', () => {
    expectTypeOf<
      NonNullable<PnpmWorkspace['registries']>[string]
    >().toEqualTypeOf<PnpmRegistryDeclaration | string>()
    expectTypeOf<string[]>().toExtend<PnpmWorkspace['supportedArchitectures']>()
  })

  it.each(['12.5.1', '12.6.0', '12.5.1+sha512.abc'])(
    'migrates and cleans new settings for %s',
    async targetVersion => {
      await writePackageJson({ pnpm: latestSettings })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(latestSettings)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it('accepts an existing 12.5 workspace without rewriting it', async () => {
    await writePackageJson({ packageManager: 'pnpm@12.5.1' })
    const original = stringify(latestSettings)
    await writeWorkspaceYaml(original)
    const result = await migratePnpmSettings({ cwd: testDir })
    expect(result.changedFiles).toStrictEqual([])
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it.each(['11.27.1', '12.4.2', '12.5.1-rc.1', '^12.5.1'])(
    'retains new value shapes for older or unconfirmed pin %s',
    async version => {
      await writePackageJson({
        packageManager: `pnpm@${version}`,
        pnpm: { ...latestSettings, nodeLinker: 'isolated' },
      })
      const result = await migratePnpmSettings({ cwd: testDir })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        nodeLinker: 'isolated',
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(latestSettings)
    },
  )

  it('enables 12.5.0 fields but retains 12.5.1 registry package routes', async () => {
    await writePackageJson({ pnpm: latestSettings })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.5.0' })
    const { registries, ...supported } = latestSettings
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(supported)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ registries })
  })

  it('accepts registry ecosystems at the 12.5.0 boundary', async () => {
    const registries = {
      'https://pypi.org/simple/': { ecosystem: 'pypi' },
    } as const
    await writePackageJson({ pnpm: { registries } })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.5.0' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({ registries })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it.each([
    { targetVersion: '12.4.2', settings: latestSettings },
    {
      targetVersion: '12.5.0',
      settings: { registries: latestSettings.registries },
    },
    {
      targetVersion: '12.5.1',
      settings: { python: { indexUrl: 'https://pypi.org/simple/' } },
    },
    {
      targetVersion: '12.5.1',
      settings: { cargo: { indexUrl: 'https://index.crates.io/' } },
    },
  ])(
    'rejects incompatible existing values for $targetVersion before writing',
    async ({ targetVersion, settings }) => {
      const original = stringify(settings)
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
    {
      strategy: 'discard',
      expected: { cargo: 1, test: 3 },
      remaining: { concurrencyGroups: { cargo: 2, test: 3 } },
    },
    {
      strategy: 'merge',
      expected: { cargo: 1, test: 3 },
      remaining: { concurrencyGroups: { cargo: 2, test: 3 } },
    },
    {
      strategy: 'overwrite',
      expected: { cargo: 2, test: 3 },
      remaining: undefined,
    },
  ] as const)(
    'merges concurrency settings using $strategy and retains unapplied source values',
    async ({ strategy, expected, remaining }) => {
      await writePackageJson({
        packageManager: 'pnpm@12.5.1',
        pnpm: { concurrencyGroups: { cargo: 2, test: 3 } },
      })
      await writeWorkspaceYaml('concurrencyGroups:\n  cargo: 1\n')
      await migratePnpmSettings({ cwd: testDir, strategy })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        concurrencyGroups: expected,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(remaining)
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'retains removed index URLs and global tools using %s',
    async strategy => {
      const retained = {
        python: { enabled: false, indexUrl: 'https://pypi.org/simple/' },
        cargo: { enabled: false, indexUrl: 'https://index.crates.io/' },
        tools: { node: { mirror: 'https://mirror.example/node' } },
      }
      await writePackageJson({
        packageManager: 'pnpm@12.5.1',
        pnpm: { ...retained, saveExact: true },
      })
      const result = await migratePnpmSettings({ cwd: testDir, strategy })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
      expect(result.warnings.join()).toContain('project-refused')
      expect(result.warnings.join()).toContain('incompatible')
    },
  )

  it.each([
    { namedRegistries: { PkG: 'https://registry.example/' } },
    { registries: { 'https://registry.example/': { prefix: 'pkg' } } },
  ])('retains the newly reserved pkg prefix: %j', async settings => {
    await writePackageJson({ pnpm: settings })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.5.1',
    })
    expect(result.warnings.join()).toContain('incompatible')
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(settings)
  })

  it('preserves legacy architecture axes on old and new targets', async () => {
    const supportedArchitectures = {
      os: ['linux'],
      cpu: ['x64'],
      libc: ['glibc'],
    }
    for (const targetVersion of ['11.27.1', '12.4.2', '12.5.1']) {
      await writePackageJson({ pnpm: { supportedArchitectures } })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        supportedArchitectures,
      })
    }
  })

  it.each([
    { targetVersion: '11.26.0', expected: {}, retained: true },
    {
      targetVersion: '11.27.0',
      expected: { trustPolicyExcludePrune: true },
      retained: false,
    },
    {
      targetVersion: '11.27.1',
      expected: { trustPolicyExcludePrune: true },
      retained: false,
    },
    { targetVersion: '12.3.4', expected: {}, retained: true },
    {
      targetVersion: '12.4.0',
      expected: { trustPolicyExcludePrune: true },
      retained: false,
    },
    {
      targetVersion: '12.5.1',
      expected: { trustPolicyExcludePrune: true },
      retained: false,
    },
  ])(
    'gates trustPolicyExcludePrune independently on both release lines: $targetVersion',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({})
      await writeNpmrc('trust-policy-exclude-prune=true\nnode-linker=isolated')
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        nodeLinker: 'isolated',
        ...expected,
      })
      await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(retained)
    },
  )
})
