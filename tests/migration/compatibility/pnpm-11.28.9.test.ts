import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  registries: { 'https://registry.example/': { serverType: 'pnpr' } },
}

const versionCases = [
  '11.28.8',
  '11.28.9',
  '11.28.9-rc.1',
  '^11.28.9',
  undefined,
].map(version => ({
  packageManager: version && `pnpm@${version}`,
  expected: { saveExact: true, ...(version === '11.28.9' ? settings : {}) },
  retained: version === '11.28.9' ? undefined : settings,
}))

const invalidSiblingCases = [
  { serverType: 'typo' },
  { serverType: false },
  { scopes: '@acme' },
  { scopes: ['acme'] },
  { prefix: false },
  { supportsTimeField: 'true' },
  { unknown: true },
  { networkConcurrency: 2 },
  { ecosystem: null },
  'https://legacy.example/',
  null,
  [],
  false,
].flatMap(declaration => {
  const entries: [string, unknown][] = [
    ...Object.entries(settings.registries),
    ['https://invalid.example/', declaration],
  ]
  return [entries, entries.toReversed()].map(orderedEntries => ({
    invalid: { registries: Object.fromEntries(orderedEntries) },
  }))
})

const retentionCases = (['discard', 'merge', 'overwrite'] as const).flatMap(
  strategy => invalidSiblingCases.map(entry => ({ ...entry, strategy })),
) satisfies {
  invalid: { registries: Record<string, unknown> }
  strategy: 'discard' | 'merge' | 'overwrite'
}[]

describe('pnpm 11.28.9 registry server type', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('pnpm-11.28.9')

  it.each(versionCases)(
    'gates pnpr registry declarations for $packageManager',
    async ({ packageManager, expected, retained }) => {
      await writePackageJson({
        packageManager,
        pnpm: { ...settings, saveExact: true },
      })
      await migratePnpmSettings({ cwd: testDir, compatibility: 'v11' })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it('blocks an existing pnpr declaration at 11.28.8 before writes', async () => {
    const original = stringify(settings)
    await writeWorkspaceYaml(original)
    await writePackageJson({ pnpm: { saveExact: true } })
    const manifest = await readWorkspaceFile('package.json')
    await expect(
      migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.8' }),
    ).rejects.toThrow('incompatible')
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
    await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
  })

  it('accepts an existing pnpr declaration at 11.28.9', async () => {
    await writeWorkspaceYaml(stringify(settings))
    await writePackageJson({ pnpm: { saveExact: true } })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.9' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      ...settings,
      saveExact: true,
    })
  })

  it.each([
    { serverType: 'pnpr', unknown: true },
    { serverType: 'pnpr', networkConcurrency: 2 },
    { serverType: 'pnpr', ecosystem: 'npm' },
  ])('retains the complete invalid registry map %j', async declaration => {
    const invalid = { registries: { 'https://registry.example/': declaration } }
    await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.9' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(invalid)
  })

  it.each(retentionCases)(
    'retains every registry when a sibling is invalid with $strategy: $invalid',
    async ({ invalid, strategy }) => {
      const existing = {
        registries: { 'https://existing.example/': { serverType: 'npm' } },
      }
      await writeWorkspaceYaml(stringify(existing))
      await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
      await writeNpmrc('save-prefix=~\n')
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '11.28.9',
        strategy,
      })
      expect(result.warnings.join()).toContain('registries')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        ...existing,
        saveExact: true,
        savePrefix: '~',
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(invalid)
      await expect(readWorkspaceFile('.npmrc')).rejects.toMatchObject({
        code: 'ENOENT',
      })
    },
  )

  it.each(invalidSiblingCases)(
    'rejects an invalid sibling in existing YAML before any writes: $invalid',
    async ({ invalid }) => {
      const original = stringify(invalid)
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('save-prefix=~\n')
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.9' }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-prefix=~\n')
    },
  )

  it.each([
    {
      ...settings.registries,
      'https://npm.example/': { serverType: 'npm', scopes: ['@acme'] },
      'https://artifactory.example/': {
        serverType: 'artifactory',
        prefix: 'work',
        supportsTimeField: false,
      },
      'https://empty.example/': {},
    },
    {
      '@acme': 'https://registry.example/',
      default: 'https://registry.npmjs.org/',
    },
  ])(
    'migrates valid multi-registry maps without partial cleanup: %j',
    async registries => {
      await writePackageJson({ pnpm: { registries } })
      expect(
        (await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.9' }))
          .warnings,
      ).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({ registries })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )
})
