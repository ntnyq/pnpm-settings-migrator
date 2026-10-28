import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const versions = ['11.28.8', '11.28.9', '12.9.0', '12.15.0', '12.16.1']
const strategies = ['discard', 'merge', 'overwrite'] as const
const mixedRegistries = {
  default: 'https://first.example/',
  'https://second.example/': { prefix: 'work' },
}
const mixedConversionCases = [
  {
    name: 'legacy scopes in workspace',
    existing: { registries: { default: 'https://first.example/' } },
    incoming: { namedRegistries: { work: 'https://second.example/' } },
  },
  {
    name: 'legacy scopes in source',
    existing: { namedRegistries: { work: 'https://first.example/' } },
    incoming: { registries: { default: 'https://second.example/' } },
  },
].flatMap(entry => strategies.map(strategy => ({ ...entry, strategy })))
const routeCases = [
  { name: 'prefix', first: { prefix: 'shared' }, second: { prefix: 'shared' } },
  { name: 'empty prefix', first: { prefix: '' }, second: { prefix: '' } },
  {
    name: 'scope',
    first: { scopes: ['@same'] },
    second: { scopes: ['@same'] },
  },
  {
    name: 'default scope',
    first: { scopes: ['@'] },
    second: { scopes: ['@'] },
  },
  {
    name: 'overlapping scopes',
    first: { scopes: ['@first', '@same'] },
    second: { scopes: ['@same', '@second'] },
  },
]
const conflictCases = versions.flatMap(targetVersion =>
  strategies.flatMap(strategy =>
    routeCases.map(({ name, first, second }) => ({
      name,
      first,
      second,
      targetVersion,
      strategy,
    })),
  ),
)

const existingScopes = {
  'https://first.example/': { scopes: ['@first'] },
  'https://second.example/': { scopes: ['@second'] },
}
const incomingScopes = {
  'https://first.example/': { scopes: ['@second'] },
  'https://second.example/': { scopes: ['@third'] },
}
const nonconflictingStrategies = [
  {
    strategy: 'discard',
    expected: existingScopes,
    retained: { registries: incomingScopes },
  },
  { strategy: 'overwrite', expected: incomingScopes, retained: undefined },
] as const

const normalizationCases = [
  {
    targetVersion: '11.28.9',
    first: 'https://SAME.example:443/path',
    second: 'https://same.example/path/',
    supported: true,
  },
  {
    targetVersion: '12.16.1',
    first: 'https://SAME.example:443/path',
    second: 'https://same.example/path/',
    supported: false,
  },
  {
    targetVersion: '11.28.9',
    first: 'https://registry.npmjs.com/',
    second: 'https://registry.npmjs.org/',
    supported: false,
  },
  {
    targetVersion: '12.16.1',
    first: 'https://registry.npmjs.com/',
    second: 'https://registry.npmjs.org/',
    supported: true,
  },
  {
    targetVersion: '12.16.1',
    first: '//registry.npmjs.com/',
    second: '//registry.npmjs.org/',
    supported: true,
  },
  {
    targetVersion: '12.16.1',
    first: 'https://registry.npmjs.com/private/',
    second: 'https://registry.npmjs.org/private/',
    supported: false,
  },
].map(({ targetVersion, first, second, supported }) => {
  const registries = {
    [first]: { scopes: ['@same'] },
    [second]: { scopes: ['@same'] },
  }
  return {
    targetVersion,
    registries,
    expected: { saveExact: true, ...(supported ? { registries } : {}) },
    retained: supported ? undefined : { registries },
  }
})

describe('registry routing conflicts', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    writeWorkspaceFile,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('registry-routes')

  it.each(conflictCases)(
    'retains a source map with duplicate $name at $targetVersion using $strategy',
    async ({ first, second, targetVersion, strategy }) => {
      const invalid = {
        registries: {
          'https://first.example/': first,
          'https://second.example/': second,
        },
      }
      await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion,
        strategy,
      })
      expect(result.warnings.join()).toContain('registries')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(invalid)
    },
  )

  it.each(conflictCases)(
    'rejects existing duplicate $name at $targetVersion before writes using $strategy',
    async ({ first, second, targetVersion, strategy }) => {
      const original = stringify({
        registries: {
          'https://first.example/': first,
          'https://second.example/': second,
        },
      })
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('save-prefix=~\n')
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion, strategy }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-prefix=~\n')
    },
  )

  it.each(conflictCases)(
    'rejects duplicate $name introduced by merging at $targetVersion using $strategy',
    async ({ first, second, targetVersion, strategy }) => {
      const original = stringify({
        registries: { 'https://first.example/': first },
      })
      await writeWorkspaceYaml(original)
      await writePackageJson({
        pnpm: {
          registries: { 'https://second.example/': second },
          saveExact: true,
        },
      })
      await writeNpmrc('save-prefix=~\n')
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion, strategy }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-prefix=~\n')
    },
  )

  describe.each(versions)(
    'deprecated registry conversion at %s',
    targetVersion => {
      it.each(strategies)(
        'retains a mixed source map without versioned fields using %s',
        async strategy => {
          await writePackageJson({
            pnpm: { registries: mixedRegistries, saveExact: true },
          })
          const result = await migratePnpmSettings({
            cwd: testDir,
            targetVersion,
            strategy,
          })

          expect(result.warnings.join()).toContain('registries')
          await expect(readWorkspaceYaml()).resolves.toStrictEqual({
            saveExact: true,
          })
          expect(
            JSON.parse(await readWorkspaceFile('package.json')).pnpm,
          ).toStrictEqual({ registries: mixedRegistries })
        },
      )

      it.each(strategies)(
        'rejects an existing mixed map without versioned fields using %s',
        async strategy => {
          const original = stringify({ registries: mixedRegistries })
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
          await expect(readWorkspaceFile('package.json')).resolves.toBe(
            manifest,
          )
          await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
            'save-prefix=~\n',
          )
        },
      )

      it.each(mixedConversionCases)(
        'rejects converted mixed maps with $name using $strategy before writes',
        async ({ existing, incoming, strategy }) => {
          const original = stringify(existing)
          await writeWorkspaceYaml(original)
          await writePackageJson({ pnpm: { ...incoming, saveExact: true } })
          await writeNpmrc('save-prefix=~\n')
          const manifest = await readWorkspaceFile('package.json')

          await expect(
            migratePnpmSettings({
              cwd: testDir,
              targetVersion,
              strategy,
              replaceDeprecated: true,
            }),
          ).rejects.toThrow(/incompatible.*registries/u)

          await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
            original,
          )
          await expect(readWorkspaceFile('package.json')).resolves.toBe(
            manifest,
          )
          await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
            'save-prefix=~\n',
          )
        },
      )

      it.each(strategies)(
        'rejects duplicate converted prefixes using %s before writes',
        async strategy => {
          const original = stringify({
            namedRegistries: { work: 'https://first.example/' },
          })
          await writeWorkspaceYaml(original)
          await writePackageJson({
            pnpm: {
              namedRegistries: { work: 'https://second.example/' },
              saveExact: true,
            },
          })
          await writeNpmrc('save-prefix=~\n')
          const manifest = await readWorkspaceFile('package.json')

          await expect(
            migratePnpmSettings({
              cwd: testDir,
              targetVersion,
              strategy,
              replaceDeprecated: true,
            }),
          ).rejects.toThrow(/incompatible.*registries/u)

          await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
            original,
          )
          await expect(readWorkspaceFile('package.json')).resolves.toBe(
            manifest,
          )
          await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
            'save-prefix=~\n',
          )
        },
      )

      it.each(strategies)(
        'migrates valid converted prefixes using %s',
        async strategy => {
          await writeWorkspaceYaml(
            stringify({ namedRegistries: { work: 'https://first.example/' } }),
          )
          await writePackageJson({
            pnpm: {
              namedRegistries: { other: 'https://second.example/' },
              saveExact: true,
            },
          })
          await writeNpmrc('save-prefix=~\n')

          const result = await migratePnpmSettings({
            cwd: testDir,
            targetVersion,
            strategy,
            replaceDeprecated: true,
          })

          expect(result.warnings).toStrictEqual([])
          await expect(readWorkspaceYaml()).resolves.toStrictEqual({
            registries: {
              'https://first.example/': { prefix: 'work' },
              'https://second.example/': { prefix: 'other' },
            },
            saveExact: true,
            savePrefix: '~',
          })
          expect(
            JSON.parse(await readWorkspaceFile('package.json')).pnpm,
          ).toBeUndefined()
          await expect(readWorkspaceFile('.npmrc')).rejects.toMatchObject({
            code: 'ENOENT',
          })
        },
      )
    },
  )

  it.each(
    ['12.15.0', '12.16.1'].flatMap(targetVersion =>
      strategies.map(strategy => ({ targetVersion, strategy })),
    ),
  )(
    'preserves included files after converted mixed maps at $targetVersion using $strategy',
    async ({ targetVersion, strategy }) => {
      const root = stringify({ include: { './policy.yaml': ['registries'] } })
      const policy = stringify({
        registries: { default: 'https://first.example/' },
      })
      await writeWorkspaceYaml(root)
      await writeWorkspaceFile('policy.yaml', policy)
      await writePackageJson({
        pnpm: { namedRegistries: { work: 'https://second.example/' } },
      })
      await writeNpmrc('save-prefix=~\n')
      const manifest = await readWorkspaceFile('package.json')

      await expect(
        migratePnpmSettings({
          cwd: testDir,
          targetVersion,
          strategy,
          replaceDeprecated: true,
        }),
      ).rejects.toThrow(/incompatible.*registries/u)

      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(root)
      await expect(readWorkspaceFile('policy.yaml')).resolves.toBe(policy)
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-prefix=~\n')
    },
  )

  it.each(
    ['12.15.0', '12.16.1'].flatMap(targetVersion =>
      strategies.map(strategy => ({ targetVersion, strategy })),
    ),
  )(
    'preserves included files after converted prefix conflicts at $targetVersion using $strategy',
    async ({ targetVersion, strategy }) => {
      const root = stringify({ include: { './policy.yaml': ['registries'] } })
      const policy = stringify({
        namedRegistries: { work: 'https://first.example/' },
      })
      await writeWorkspaceYaml(root)
      await writeWorkspaceFile('policy.yaml', policy)
      await writePackageJson({
        pnpm: {
          namedRegistries: { work: 'https://second.example/' },
          saveExact: true,
        },
      })
      await writeNpmrc('save-prefix=~\n')
      const manifest = await readWorkspaceFile('package.json')

      await expect(
        migratePnpmSettings({
          cwd: testDir,
          targetVersion,
          strategy,
          replaceDeprecated: true,
        }),
      ).rejects.toThrow(/incompatible.*registries/u)

      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(root)
      await expect(readWorkspaceFile('policy.yaml')).resolves.toBe(policy)
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-prefix=~\n')
    },
  )

  it.each(versions)(
    'rejects scope overlap created by array merging at %s',
    async targetVersion => {
      const original = stringify({ registries: existingScopes })
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { registries: incomingScopes } })
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion, strategy: 'merge' }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
    },
  )

  it.each(nonconflictingStrategies)(
    'accepts the valid final routes selected by $strategy',
    async ({ strategy, expected, retained }) => {
      await writeWorkspaceYaml(stringify({ registries: existingScopes }))
      await writePackageJson({ pnpm: { registries: incomingScopes } })
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '11.28.9',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        registries: expected,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each(strategies)(
    'preserves an included registry owner when final routes conflict with %s',
    async strategy => {
      const root = stringify({ include: { './policy.yaml': ['registries'] } })
      const policy = stringify({
        registries: { 'https://first.example/': { prefix: 'shared' } },
      })
      await writeWorkspaceYaml(root)
      await writeWorkspaceFile('policy.yaml', policy)
      await writePackageJson({
        pnpm: {
          registries: { 'https://second.example/': { prefix: 'shared' } },
        },
      })
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({
          cwd: testDir,
          targetVersion: '12.16.1',
          strategy,
        }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(root)
      await expect(readWorkspaceFile('policy.yaml')).resolves.toBe(policy)
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
    },
  )

  it.each(versions)(
    'allows repeated scopes for equivalent URL spellings at %s',
    async targetVersion => {
      const registries = {
        'https://same.example/path': {
          scopes: ['@same', '@same'],
          prefix: 'one',
        },
        'https://same.example/path/': { scopes: ['@same'], prefix: 'two' },
      }
      await writePackageJson({ pnpm: { registries } })
      expect(
        (await migratePnpmSettings({ cwd: testDir, targetVersion })).warnings,
      ).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({ registries })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each(versions)(
    'requires unique prefixes even when registry URLs normalize equally at %s',
    async targetVersion => {
      const invalid = {
        registries: {
          'https://same.example': { prefix: 'shared' },
          'https://same.example/': { prefix: 'shared' },
        },
      }
      await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(invalid)
    },
  )

  it.each(versions)(
    'keeps distinct case-sensitive and unset routes valid at %s',
    async targetVersion => {
      const registries = {
        'https://first.example/': { prefix: 'Shared', scopes: ['@Same'] },
        'https://second.example/': { prefix: 'shared', scopes: ['@same'] },
        'https://third.example/': { prefix: null, scopes: null },
        'https://fourth.example/': { prefix: null, scopes: [] },
      }
      await writePackageJson({ pnpm: { registries } })
      expect(
        (await migratePnpmSettings({ cwd: testDir, targetVersion })).warnings,
      ).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({ registries })
    },
  )

  it.each(normalizationCases)(
    'uses target-specific URL identities at $targetVersion: $registries',
    async ({ targetVersion, registries, expected, retained }) => {
      await writePackageJson({ pnpm: { registries, saveExact: true } })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )
})
