import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const strategies = ['discard', 'merge', 'overwrite'] as const
const earlierVersions = ['12.9.0', '12.10.0', '12.11.0', '12.11.1-rc.1']
const supportedVersions = ['12.11.1', '12.11.1+build.1', '12.11.2', '12.16.1']
const versionCases = [
  ...earlierVersions.map(targetVersion => ({
    targetVersion,
    supported: false,
  })),
  ...supportedVersions.map(targetVersion => ({
    targetVersion,
    supported: true,
  })),
  { targetVersion: undefined, supported: false },
]
const aliasCases = versionCases.flatMap(({ targetVersion, supported }) =>
  ['https:', ''].flatMap(protocol => {
    const registries = {
      [`${protocol}//registry.npmjs.com/`]: { scopes: ['@same'] },
      [`${protocol}//registry.npmjs.org/`]: { scopes: ['@same'] },
    }
    return strategies.map(strategy => ({
      targetVersion,
      strategy,
      protocol,
      registries,
      hasWarnings: !supported,
      expected: { saveExact: true, ...(supported ? { registries } : {}) },
      retained: supported ? undefined : { registries },
    }))
  }),
)
const convertedExisting = {
  namedRegistries: { first: 'https://registry.npmjs.com/' },
  registries: { '@same': 'https://registry.npmjs.com/' },
}
const convertedIncoming = {
  namedRegistries: { second: 'https://registry.npmjs.org/' },
  registries: { '@same': 'https://registry.npmjs.org/' },
}

describe('pnpm 12.11.1 npm registry URL identity', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
    writeNpmrc,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('pnpm-12.11.1')

  it.each(aliasCases)(
    'selects $protocol npm aliases at $targetVersion using $strategy',
    async ({
      targetVersion,
      strategy,
      registries,
      expected,
      retained,
      hasWarnings,
    }) => {
      await writePackageJson({ pnpm: { registries, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v12',
        targetVersion,
        strategy,
      })

      expect(
        result.warnings.some(warning => warning.includes('registries')),
      ).toBe(hasWarnings)
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  describe.each(earlierVersions)(
    'conflicting npm aliases at %s',
    targetVersion => {
      it.each(strategies)(
        'rejects existing routes using %s before writes',
        async strategy => {
          const original = stringify({
            registries: {
              'https://registry.npmjs.com/': { scopes: ['@same'] },
              'https://registry.npmjs.org/': { scopes: ['@same'] },
            },
          })
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

      it.each(strategies)(
        'rejects converted routes using %s before writes',
        async strategy => {
          const original = stringify(convertedExisting)
          await writeWorkspaceYaml(original)
          await writePackageJson({ pnpm: convertedIncoming })
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
    },
  )

  describe.each(supportedVersions)(
    'equivalent npm aliases at %s',
    targetVersion => {
      it.each(strategies)(
        'accepts converted routes using %s and cleans their source',
        async strategy => {
          await writeWorkspaceYaml(stringify(convertedExisting))
          await writePackageJson({ pnpm: convertedIncoming })
          const result = await migratePnpmSettings({
            cwd: testDir,
            targetVersion,
            strategy,
            replaceDeprecated: true,
          })

          expect(result.warnings).toStrictEqual([])
          await expect(readWorkspaceYaml()).resolves.toStrictEqual({
            registries: {
              'https://registry.npmjs.com/': {
                scopes: ['@same'],
                prefix: 'first',
              },
              'https://registry.npmjs.org/': {
                scopes: ['@same'],
                prefix: 'second',
              },
            },
          })
          expect(
            JSON.parse(await readWorkspaceFile('package.json')).pnpm,
          ).toBeUndefined()
        },
      )
    },
  )
})
