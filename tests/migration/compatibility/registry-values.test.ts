import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const strategies = ['discard', 'merge', 'overwrite'] as const
const versions = ['11.28.8', '12.9.0', '12.16.1']
const existingRegistries = {
  'https://existing.example/': { prefix: 'existing' },
}
const invalidMaps = [
  ...[
    { prefix: false },
    { scopes: '@acme' },
    { scopes: [false] },
    { scopes: ['acme'] },
    { supportsTimeField: 'true' },
    { serverType: 'typo' },
    { unknown: true },
    { unknown: null },
    { ecosystem: 'unknown' },
    { packages: ['requests'] },
  ].map(declaration => ({
    registries: {
      'https://valid.example/': { prefix: 'valid' },
      'https://invalid.example/': declaration,
    },
  })),
  ...[
    'https://registry.example/',
    '//registry.example/',
    'https://invalid host/',
  ].map(key => ({
    registries: {
      '@valid': 'https://valid.example/',
      [key]: 'https://other.example/',
    },
  })),
]
const invalidCases = invalidMaps.flatMap(invalid =>
  strategies.map(strategy => ({ invalid, strategy })),
)
const npmrcCases = [
  '[registries.https://registry\\.example/]\nprefix=false\n',
  '[registries.https://registry\\.example/]\nscopes=@acme\n',
  '[registries.https://registry\\.example/]\nunknown=true\n',
  '[registries]\nhttps://registry.example/=https://other.example/\n',
].flatMap(body => strategies.map(strategy => ({ body, strategy })))
const validMaps = [
  {
    default: 'https://registry.example/',
    '@acme': 'https://registry.example/',
  },
  {
    'https://registry.example/': {
      prefix: 'work',
      scopes: ['@acme'],
      serverType: 'artifactory',
      supportsTimeField: false,
    },
    'https://empty.example/': {},
  },
  {
    'https://registry.example/': {
      prefix: null,
      scopes: null,
      serverType: null,
      supportsTimeField: null,
    },
  },
].flatMap(registries => strategies.map(strategy => ({ registries, strategy })))

describe('registry representation and declaration values', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    writeWorkspaceFile,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('registry-values')

  describe.each(versions)('registry validation at %s', targetVersion => {
    it.each(invalidCases)(
      'leaves an invalid-only source byte for byte using $strategy: $invalid',
      async ({ invalid, strategy }) => {
        await writePackageJson({ name: 'invalid-registry', pnpm: invalid })
        const manifest = await readWorkspaceFile('package.json')
        const result = await migratePnpmSettings({
          cwd: testDir,
          targetVersion,
          strategy,
        })

        expect(result.warnings.join()).toContain('registries')
        expect(result.changedFiles).toStrictEqual([])
        expect(result.sourceSettingsCleaned).toBe(false)
        await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
        await expect(
          readWorkspaceFile('pnpm-workspace.yaml'),
        ).rejects.toMatchObject({ code: 'ENOENT' })
      },
    )

    it.each(invalidCases)(
      'retains the whole source map while migrating unrelated settings using $strategy: $invalid',
      async ({ invalid, strategy }) => {
        await writeWorkspaceYaml(stringify({ registries: existingRegistries }))
        await writePackageJson({
          name: 'invalid-registry',
          pnpm: { ...invalid, saveExact: true },
        })
        await writeNpmrc('save-prefix=~\n')
        const result = await migratePnpmSettings({
          cwd: testDir,
          targetVersion,
          strategy,
        })

        expect(result.warnings.join()).toContain('registries')
        await expect(readWorkspaceYaml()).resolves.toStrictEqual({
          registries: existingRegistries,
          saveExact: true,
          savePrefix: '~',
        })
        expect(
          JSON.parse(await readWorkspaceFile('package.json')),
        ).toStrictEqual({ name: 'invalid-registry', pnpm: invalid })
        await expect(readWorkspaceFile('.npmrc')).rejects.toMatchObject({
          code: 'ENOENT',
        })
      },
    )

    it.each(invalidCases)(
      'rejects an invalid existing map before any writes using $strategy: $invalid',
      async ({ invalid, strategy }) => {
        const original = stringify(invalid)
        await writeWorkspaceYaml(original)
        await writePackageJson({ pnpm: { saveExact: true } })
        await writeNpmrc('save-prefix=~\n')
        const manifest = await readWorkspaceFile('package.json')

        await expect(
          migratePnpmSettings({ cwd: testDir, targetVersion, strategy }),
        ).rejects.toThrow(/incompatible.*registries/u)

        await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
          original,
        )
        await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
        await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
          'save-prefix=~\n',
        )
      },
    )

    it.each(npmrcCases)(
      'preserves invalid registry settings in both sources using $strategy: $body',
      async ({ body, strategy }) => {
        const retained = `# keep registry configuration\nregistry=https://registry.npmjs.org/\n${body}`
        await writeWorkspaceYaml(stringify({ registries: existingRegistries }))
        await writeNpmrc(`save-exact=true\n${retained}`)
        await writePackageJson({
          pnpm: {
            registries: { 'https://registry.example/': { prefix: false } },
          },
        })
        const manifest = await readWorkspaceFile('package.json')
        const result = await migratePnpmSettings({
          cwd: testDir,
          targetVersion,
          strategy,
        })

        expect(result.warnings.join()).toContain('package.json#pnpm')
        expect(result.warnings.join()).toContain('.npmrc')
        await expect(readWorkspaceYaml()).resolves.toStrictEqual({
          registries: existingRegistries,
          saveExact: true,
        })
        await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
        await expect(readWorkspaceFile('.npmrc')).resolves.toBe(retained)
      },
    )

    it.each(validMaps)(
      'accepts valid legacy and plain declarations using $strategy: $registries',
      async ({ registries, strategy }) => {
        await writePackageJson({ pnpm: { registries } })
        const result = await migratePnpmSettings({
          cwd: testDir,
          targetVersion,
          strategy,
        })

        expect(result.warnings).toStrictEqual([])
        await expect(readWorkspaceYaml()).resolves.toStrictEqual({ registries })
        expect(
          JSON.parse(await readWorkspaceFile('package.json')).pnpm,
        ).toBeUndefined()
      },
    )
  })

  it.each(strategies)(
    'preserves valid v12 ecosystem declarations without versioned markers using %s',
    async strategy => {
      const registries = {
        'https://python.example/': {
          ecosystem: 'pypi',
          packages: ['requests'],
        },
        'https://cargo.example/': { ecosystem: 'cargo' },
      }
      await writePackageJson({ pnpm: { registries } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.16.1',
        strategy,
      })

      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({ registries })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each(
    strategies.flatMap(strategy =>
      [
        { registries: { 'https://registry.example/': { prefix: false } } },
        {
          registries: { 'https://registry.example/': 'https://other.example/' },
        },
      ].map(invalid => ({ strategy, invalid })),
    ),
  )(
    'rejects invalid included maps using $strategy before writes: $invalid',
    async ({ strategy, invalid }) => {
      const root = stringify({ include: { './policy.yaml': ['registries'] } })
      const policy = stringify(invalid)
      await writeWorkspaceYaml(root)
      await writeWorkspaceFile('policy.yaml', policy)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('save-prefix=~\n')
      const manifest = await readWorkspaceFile('package.json')

      await expect(
        migratePnpmSettings({
          cwd: testDir,
          targetVersion: '12.16.1',
          strategy,
        }),
      ).rejects.toThrow(/incompatible.*registries/u)

      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(root)
      await expect(readWorkspaceFile('policy.yaml')).resolves.toBe(policy)
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-prefix=~\n')
    },
  )
})
