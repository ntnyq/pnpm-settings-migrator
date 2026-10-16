import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmNodePackageMapSettings, PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  nodePackageMap: { mode: 'write-only', type: 'loose' },
  storeIndexFormat: 'files',
} satisfies PnpmWorkspace

const dynamicSettings = {
  nodePackageMap: {
    // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
    mode: '${PNPM_MIGRATOR_MAP_MODE:-write-only}',
    // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
    type: '${PNPM_MIGRATOR_MAP_TYPE}',
  },
  // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
  storeIndexFormat: '${PNPM_MIGRATOR_STORE_FORMAT:-files}',
}

const invalidSettings = [
  { nodePackageMap: true },
  { nodePackageMap: [] },
  { nodePackageMap: { mode: 'write' } },
  { nodePackageMap: { mode: false } },
  { nodePackageMap: { type: 'strict' } },
  { nodePackageMap: { mode: 'load', unknown: true } },
  // eslint-disable-next-line no-template-curly-in-string -- Unknown fields stay invalid even with a placeholder.
  { nodePackageMap: { unknown: '${PNPM_MIGRATOR_UNKNOWN}' } },
  { storeIndexFormat: 'json' },
  { storeIndexFormat: false },
  { storeIndexFormat: {} },
]

const unconfirmedCases = [
  '12.12.1',
  '11.28.6',
  '^12.13.0',
  '12.13.0-rc.1',
  '13.0.0',
  undefined,
].map(version => ({ version, packageManager: version && `pnpm@${version}` }))

const npmrcCases = ['12.12.1', '12.13.0'].map(targetVersion => ({
  targetVersion,
  expected: {
    saveExact: true,
    ...(targetVersion === '12.13.0' ? { storeIndexFormat: 'files' } : {}),
  },
  retained: `${targetVersion === '12.13.0' ? '' : 'store-index-format=files\n'}registry=https://registry.npmjs.org/\n`,
}))

describe('pnpm 12.13 settings', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('pnpm-12.13')

  it('exports the package map type', () => {
    expectTypeOf<PnpmNodePackageMapSettings>().toExtend<
      PnpmWorkspace['nodePackageMap']
    >()
  })

  it.each(['12.13.0', '12.14.0', '12.13.0+build.1'])(
    'migrates settings inferred from %s',
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

  it.each(unconfirmedCases)(
    'retains complete sections for unconfirmed or older pin $version',
    async ({ packageManager }) => {
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

  it('migrates enum placeholders without expanding them', async () => {
    await writePackageJson({ pnpm: dynamicSettings })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.13.0',
    })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(dynamicSettings)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('preserves existing enum placeholders while migrating unrelated settings', async () => {
    await writeWorkspaceYaml(stringify(dynamicSettings))
    await writePackageJson({ pnpm: { saveExact: true } })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.13.0',
    })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      ...dynamicSettings,
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it.each(['12.12.1', '12.13.0-rc.1'])(
    'retains enum placeholders for unsupported target %s',
    async targetVersion => {
      await writePackageJson({
        pnpm: { ...dynamicSettings, saveExact: true },
      })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(dynamicSettings)
    },
  )

  it('migrates npmrc store-index placeholders without expanding them', async () => {
    await writePackageJson({ packageManager: 'pnpm@12.13.0' })
    await writeNpmrc(
      `store-index-format=${dynamicSettings.storeIndexFormat}\nregistry=https://registry.npmjs.org/\n`,
    )
    const result = await migratePnpmSettings({ cwd: testDir })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      storeIndexFormat: dynamicSettings.storeIndexFormat,
    })
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'registry=https://registry.npmjs.org/\n',
    )
  })

  it.each(invalidSettings)(
    'retains invalid values %j intact',
    async invalid => {
      await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.13.0',
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
    'rejects existing values %j before writes',
    async invalid => {
      const original = stringify(invalid)
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      const manifest = await readWorkspaceFile('package.json')
      await writeNpmrc('store-index-format=files')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion: '12.13.0' }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'store-index-format=files',
      )
    },
  )

  it.each([
    { nodePackageMap: null, storeIndexFormat: null },
    { nodePackageMap: {} },
    { nodePackageMap: { mode: null, type: null }, storeIndexFormat: 'sqlite' },
    { nodePackageMap: { mode: 'off', type: 'standard' } },
    { nodePackageMap: { mode: 'load' } },
  ])('preserves optional settings %j', async valid => {
    await writePackageJson({ pnpm: valid })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion: '12.13.0' }))
        .warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(valid)
  })

  it.each(npmrcCases)(
    'uses explicit $targetVersion for npmrc store format and retains registry config',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({ packageManager: 'pnpm@12.12.1' })
      await writeNpmrc(
        'store-index-format=files\nsave-exact=true\nregistry=https://registry.npmjs.org/\n',
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(retained)
    },
  )

  it('preserves new and legacy spellings for upstream field precedence', async () => {
    const unchanged = {
      ...settings,
      nodeExperimentalPackageMap: true,
      nodePackageMapType: 'standard',
    }
    await writePackageJson({ pnpm: unchanged })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.13.0' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(unchanged)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  const existing = {
    nodePackageMap: { mode: 'off', type: 'standard' },
    storeIndexFormat: 'sqlite',
  }

  it.each([
    { strategy: 'discard', expected: existing, retained: settings },
    { strategy: 'merge', expected: existing, retained: settings },
    { strategy: 'overwrite', expected: settings, retained: undefined },
  ] as const)(
    'preserves unapplied values with $strategy',
    async ({ strategy, expected, retained }) => {
      await writeWorkspaceYaml(stringify(existing))
      await writePackageJson({ pnpm: settings })
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.13.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it('leaves an existing valid workspace unchanged', async () => {
    const original = stringify(settings)
    await writeWorkspaceYaml(original)
    await writePackageJson({ packageManager: 'pnpm@12.13.0' })
    expect(
      (await migratePnpmSettings({ cwd: testDir })).changedFiles,
    ).toStrictEqual([])
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })
})
