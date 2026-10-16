import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmSideEffectsCacheSettings, PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const cache = {
  read: true,
  write: false,
  exclude: ['java', '@native/*', 'example@1'],
}
const dynamicCache = {
  // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
  read: '${PNPM_MIGRATOR_CACHE_READ:-true}',
  // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
  write: '${PNPM_MIGRATOR_CACHE_WRITE}',
  exclude: ['java'],
}
const invalidCaches = [
  { exclude: 'java' },
  { exclude: [false] },
  { exclude: [], read: 'true' },
  { exclude: [], write: 'false' },
  { exclude: [], unknown: true },
  { exclude: [], remote: { privateKey: 'machine-only' } },
  { exclude: [], remote: { packages: false } },
]

describe('pnpm 12.14 cache exclusions', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.14')

  it('exports extended cache options', () => {
    expectTypeOf<PnpmSideEffectsCacheSettings>().toExtend<
      PnpmWorkspace['sideEffectsCache']
    >()
  })

  const boundaryCases = [
    '12.13.0',
    '12.14.0',
    '12.14.0+build.1',
    '^12.14.0',
    '12.14.0-rc.1',
    undefined,
  ].map(version => {
    const supported = version === '12.14.0' || version === '12.14.0+build.1'
    return {
      version,
      packageManager: version && `pnpm@${version}`,
      supported,
      expected: {
        saveExact: true,
        ...(supported ? { sideEffectsCache: cache } : {}),
      },
      retained: supported ? undefined : { sideEffectsCache: cache },
    }
  })

  it.each(boundaryCases)(
    'gates the entire section at inferred $version',
    async ({ packageManager, supported, expected, retained }) => {
      await writePackageJson({
        packageManager,
        pnpm: { sideEffectsCache: cache, saveExact: true },
      })
      const result = await migratePnpmSettings({ cwd: testDir })
      expect(result.warnings.length > 0).toBe(!supported)
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it('migrates cache boolean placeholders without expanding them', async () => {
    await writePackageJson({ pnpm: { sideEffectsCache: dynamicCache } })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.14.0',
    })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      sideEffectsCache: dynamicCache,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('preserves existing cache placeholders while migrating unrelated settings', async () => {
    await writeWorkspaceYaml(stringify({ sideEffectsCache: dynamicCache }))
    await writePackageJson({ pnpm: { saveExact: true } })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.14.0',
    })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      sideEffectsCache: dynamicCache,
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it.each(['12.13.0', '12.14.0-rc.1'])(
    'retains cache exclusions with placeholders for unsupported target %s',
    async targetVersion => {
      await writePackageJson({
        pnpm: { sideEffectsCache: dynamicCache, saveExact: true },
      })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ sideEffectsCache: dynamicCache })
    },
  )

  it.each(invalidCaches)('retains invalid section %j intact', async invalid => {
    await writePackageJson({
      pnpm: { sideEffectsCache: invalid, saveExact: true },
    })
    expect(
      (
        await migratePnpmSettings({ cwd: testDir, targetVersion: '12.14.0' })
      ).warnings.join(),
    ).toContain('incompatible')
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ sideEffectsCache: invalid })
  })

  it.each([
    ...invalidCaches.map(sideEffectsCache => ({
      targetVersion: '12.14.0',
      sideEffectsCache,
    })),
    { targetVersion: '12.13.0', sideEffectsCache: cache },
  ])(
    'rejects existing section $sideEffectsCache at $targetVersion before writes',
    async ({ sideEffectsCache, targetVersion }) => {
      const original = stringify({ sideEffectsCache })
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
    },
  )

  it.each([
    { exclude: null },
    { exclude: [] },
    { exclude: ['java'], remote: { org: 'acme', packages: ['java'] } },
  ])('preserves optional exclusions %j', async sideEffectsCache => {
    await writePackageJson({ pnpm: { sideEffectsCache } })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion: '12.14.0' }))
        .warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      sideEffectsCache,
    })
  })

  it('keeps exclusions when normalizing legacy cache aliases', async () => {
    await writePackageJson({
      pnpm: {
        sideEffectsCache: { exclude: ['java'] },
        sideEffectsCacheReadonly: true,
      },
    })
    await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.14.0',
      replaceDeprecated: true,
    })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      sideEffectsCache: { exclude: ['java'], read: true, write: false },
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  const existing = {
    sideEffectsCache: { read: false, write: true, exclude: ['existing'] },
  }

  it.each([
    {
      strategy: 'discard',
      expected: existing.sideEffectsCache,
      retained: { sideEffectsCache: cache },
    },
    {
      strategy: 'merge',
      expected: {
        read: false,
        write: true,
        exclude: ['existing', ...cache.exclude],
      },
      retained: { sideEffectsCache: cache },
    },
    { strategy: 'overwrite', expected: cache, retained: undefined },
  ] as const)(
    'preserves cache conflicts with $strategy',
    async ({ strategy, expected, retained }) => {
      await writeWorkspaceYaml(stringify(existing))
      await writePackageJson({ pnpm: { sideEffectsCache: cache } })
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.14.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        sideEffectsCache: expected,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )
})
