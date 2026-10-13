import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmRemoteCacheSettings, PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  addMissingPeerTypes: true,
  remoteCache: { org: 'acme' },
} satisfies PnpmWorkspace

const invalidSettings = [
  { addMissingPeerTypes: 'true' },
  { addMissingPeerTypes: 1 },
  { remoteCache: true },
  { remoteCache: [] },
  { remoteCache: { org: [] } },
  { remoteCache: { org: false } },
  ...Object.entries({
    url: 'https://cache.example/',
    team: 'team_example',
    trustedKeys: { ci: 'key' },
    privateKey: 'private-key',
    keyId: 'ci',
    builderId: 'builder',
    publish: false,
    imageDigest: 'sha256:abc',
    architectureBaseline: 'x64',
    buildEnv: { CC: 'clang' },
    unknown: true,
    organization: 'alias-not-supported',
  }).map(([key, value]) => ({ remoteCache: { org: 'acme', [key]: value } })),
]

describe('pnpm 12.12 settings', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.12')

  it('exports project remote cache types', () => {
    expectTypeOf<PnpmRemoteCacheSettings>().toExtend<
      PnpmWorkspace['remoteCache']
    >()
    expectTypeOf<null>().toExtend<PnpmWorkspace['addMissingPeerTypes']>()
  })

  it.each(['12.12.0', '12.12.1', '12.12.0+build.1'])(
    'migrates new settings at %s without changing the project pin',
    async version => {
      await writePackageJson({
        packageManager: `pnpm@${version}`,
        pnpm: settings,
      })
      const result = await migratePnpmSettings({ cwd: testDir })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
      const manifest = JSON.parse(await readWorkspaceFile('package.json'))
      expect(manifest.pnpm).toBeUndefined()
      expect(manifest.packageManager).toBe(`pnpm@${version}`)
    },
  )

  it.each([
    'pnpm@12.11.2',
    'pnpm@11.28.5',
    'pnpm@^12.12.0',
    'pnpm@12.12.0-rc.1',
    'pnpm@13.0.0',
    undefined,
  ])(
    'retains settings for older or unconfirmed pin %s',
    async packageManager => {
      await writePackageJson({
        packageManager,
        pnpm: { ...settings, saveExact: true },
      })
      const result = await migratePnpmSettings({ cwd: testDir })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(settings)
    },
  )

  it.each([
    {
      targetVersion: '12.11.2',
      expected: { saveExact: true },
      retained: 'add-missing-peer-types=false\n',
    },
    {
      targetVersion: '12.12.0',
      expected: { saveExact: true, addMissingPeerTypes: false },
      retained: '',
    },
  ])(
    'uses explicit target $targetVersion for npmrc settings',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({ packageManager: 'pnpm@12.11.2' })
      await writeNpmrc(
        'add-missing-peer-types=false\nsave-exact=true\nregistry=https://registry.npmjs.org/\n',
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        `${retained}registry=https://registry.npmjs.org/\n`,
      )
    },
  )

  it.each(invalidSettings)(
    'retains unsupported values %j intact',
    async invalid => {
      await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.12.0',
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

  it.each(invalidSettings)(
    'rejects unsupported existing values %j before writes',
    async invalid => {
      const original = stringify(invalid)
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('add-missing-peer-types=true')
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion: '12.12.0' }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'add-missing-peer-types=true',
      )
    },
  )

  it.each([
    { remoteCache: null, addMissingPeerTypes: null },
    { remoteCache: {} },
    { remoteCache: { org: null } },
    { remoteCache: { org: '' }, addMissingPeerTypes: false },
  ])('preserves optional values %j', async valid => {
    await writePackageJson({ pnpm: valid })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.12.0',
    })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(valid)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('preserves an existing valid workspace byte for byte', async () => {
    const original = stringify(settings)
    await writePackageJson({ packageManager: 'pnpm@12.12.0' })
    await writeWorkspaceYaml(original)
    const result = await migratePnpmSettings({ cwd: testDir })
    expect(result.changedFiles).toStrictEqual([])
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  const existing = {
    remoteCache: { org: 'existing' },
    addMissingPeerTypes: false,
  }

  it.each([
    { strategy: 'discard', expected: existing, retained: settings },
    { strategy: 'merge', expected: existing, retained: settings },
    { strategy: 'overwrite', expected: settings, retained: undefined },
  ] as const)(
    'preserves unapplied remote cache values with $strategy',
    async ({ strategy, expected, retained }) => {
      await writeWorkspaceYaml(stringify(existing))
      await writePackageJson({ pnpm: settings })
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.12.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each(['12.12.0', '12.12.1'])(
    'preserves coexistence with legacy cache and build decisions for %s',
    async targetVersion => {
      const unchanged = {
        ...settings,
        sideEffectsCache: { remote: { org: 'legacy', packages: ['example'] } },
        dangerouslyAllowAllBuilds: true,
        allowBuilds: { example: false },
      }
      await writePackageJson({ pnpm: unchanged })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(unchanged)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  const registryCases = ['tool', 'ToOl'].flatMap(prefix =>
    ['12.12.0', '12.12.1'].map(targetVersion => {
      const registrySettings = {
        namedRegistries: { [prefix]: 'https://registry.example/' },
        registries: { 'https://registry.example/': { prefix } },
      }
      const reserved = prefix === 'tool' && targetVersion === '12.12.1'
      return {
        prefix,
        targetVersion,
        registrySettings,
        reserved,
        expected: { saveExact: true, ...(reserved ? {} : registrySettings) },
        retained: reserved ? registrySettings : undefined,
      }
    }),
  )

  it.each(registryCases)(
    'gates registry prefix $prefix at $targetVersion',
    async ({
      targetVersion,
      registrySettings,
      expected,
      retained,
      reserved,
    }) => {
      await writePackageJson({ pnpm: { ...registrySettings, saveExact: true } })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings.length > 0).toBe(reserved)
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each([
    { namedRegistries: { tool: 'https://registry.example/' } },
    { registries: { 'https://registry.example/': { prefix: 'tool' } } },
  ])(
    'rejects existing reserved registries %j before writes',
    async registry => {
      const original = stringify(registry)
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion: '12.12.1' }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
    },
  )
})
