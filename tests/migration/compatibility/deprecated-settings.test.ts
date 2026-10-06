import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src/core'
import { createTestWorkspace } from '../../helpers'

describe('migratePnpmSettings/deprecated settings', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('deprecated-settings')

  it('keeps canonical values when aliases are also declared', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        audit: {
          ignore: ['GHSA-current'],
          level: 'moderate',
        },
        auditConfig: { ignoreGhsas: ['GHSA-legacy'] },
        auditLevel: 'high',
        catalogPrune: false,
        cleanupUnusedCatalogs: true,
        enableGlobalVirtualStore: true,
        remoteSideEffectsCache: { org: 'legacy' },
        sideEffectsCache: { read: false, write: true },
        sideEffectsCacheReadonly: true,
        update: {
          changeset: false,
          ignoreDeps: ['react'],
        },
        updateConfig: {
          changeset: true,
          githubActions: true,
          ignoreDependencies: ['eslint'],
        },
        virtualStoreType: 'project',
      },
    })

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      audit: {
        ignore: ['GHSA-current'],
        level: 'moderate',
      },
      catalogPrune: false,
      sideEffectsCache: {
        read: false,
        remote: { org: 'legacy' },
        write: true,
      },
      update: {
        changeset: false,
        ignoreDeps: ['react'],
      },
      virtualStoreType: 'project',
    })
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
    expect(packageJson.pnpm).toBeUndefined()
  })

  it('keeps an empty canonical update section instead of reviving aliases', async () => {
    await writePackageJson({
      pnpm: {
        update: {},
        updateConfig: { githubActions: true, ignoreDependencies: ['eslint'] },
      },
    })

    await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '11.28.5',
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({ update: {} })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('converts updateConfig when no canonical update section exists', async () => {
    await writePackageJson({
      pnpm: {
        updateConfig: {
          changeset: false,
          githubActions: true,
          githubActionsServer: 'https://github.example.com',
          ignoreDependencies: ['eslint'],
        },
      },
    })

    await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '11.28.5',
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      update: {
        changeset: false,
        githubActions: true,
        githubActionsServer: 'https://github.example.com',
        ignoreDeps: ['eslint'],
      },
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  describe.each(['discard', 'merge', 'overwrite'] as const)(
    'canonical alias precedence with %s',
    strategy => {
      const canonicalUpdate = { update: { ignoreDeps: ['react'] } }
      const legacyUpdate = {
        updateConfig: {
          githubActions: true,
          ignoreDependencies: ['eslint'],
        },
      }
      const canonicalRegistry = {
        registries: { 'https://current.example/': { prefix: 'corp' } },
      }
      const legacyRegistry = {
        namedRegistries: { corp: 'https://old.example/' },
      }
      const alternateRegistryAlias = {
        namedRegistries: { legacy: 'https://current.example/' },
      }

      it.each([
        {
          source: 'workspace',
          workspace: canonicalUpdate,
          pnpm: legacyUpdate,
        },
        {
          source: 'package.json',
          workspace: legacyUpdate,
          pnpm: canonicalUpdate,
        },
      ])(
        'keeps the complete canonical update section from $source',
        async ({ workspace, pnpm }) => {
          await writeWorkspaceYaml(stringify(workspace))
          await writePackageJson({ pnpm })

          const options = {
            cwd: testDir,
            targetVersion: '11.28.5',
            replaceDeprecated: true,
            strategy,
          }
          const result = await migratePnpmSettings(options)

          await expect(readWorkspaceYaml()).resolves.toStrictEqual(
            canonicalUpdate,
          )
          expect(result.warnings).toStrictEqual([])
          expect(
            JSON.parse(await readWorkspaceFile('package.json')).pnpm,
          ).toBeUndefined()
          await expect(migratePnpmSettings(options)).resolves.toMatchObject({
            changedFiles: [],
            settingsChanges: [],
          })
        },
      )

      it.each([
        {
          source: 'workspace',
          workspace: canonicalRegistry,
          pnpm: legacyRegistry,
        },
        {
          source: 'package.json',
          workspace: legacyRegistry,
          pnpm: canonicalRegistry,
        },
      ])(
        'keeps the canonical registry prefix from $source',
        async ({ workspace, pnpm }) => {
          await writeWorkspaceYaml(stringify(workspace))
          await writePackageJson({ pnpm })

          const options = {
            cwd: testDir,
            targetVersion: '11.28.5',
            replaceDeprecated: true,
            strategy,
          }
          const result = await migratePnpmSettings(options)

          await expect(readWorkspaceYaml()).resolves.toStrictEqual(
            canonicalRegistry,
          )
          expect(result.warnings).toStrictEqual([])
          expect(
            JSON.parse(await readWorkspaceFile('package.json')).pnpm,
          ).toBeUndefined()
          await expect(migratePnpmSettings(options)).resolves.toMatchObject({
            changedFiles: [],
            settingsChanges: [],
          })
        },
      )

      it.each([
        {
          source: 'workspace',
          workspace: canonicalRegistry,
          pnpm: alternateRegistryAlias,
        },
        {
          source: 'package.json',
          workspace: alternateRegistryAlias,
          pnpm: canonicalRegistry,
        },
      ])(
        'keeps distinct aliases for one URL with the canonical prefix in $source',
        async ({ workspace, pnpm }) => {
          await writeWorkspaceYaml(stringify(workspace))
          await writePackageJson({ pnpm })

          const options = {
            cwd: testDir,
            targetVersion: '11.28.5',
            replaceDeprecated: true,
            strategy,
          }
          const result = await migratePnpmSettings(options)

          await expect(readWorkspaceYaml()).resolves.toStrictEqual({
            ...canonicalRegistry,
            ...alternateRegistryAlias,
          })
          expect(result.warnings).toContain(
            'namedRegistries was kept because https://current.example/ already declares prefix corp.',
          )
          expect(
            JSON.parse(await readWorkspaceFile('package.json')).pnpm,
          ).toBeUndefined()
          await expect(migratePnpmSettings(options)).resolves.toMatchObject({
            changedFiles: [],
            settingsChanges: [],
          })
        },
      )

      it('keeps distinct legacy aliases for one URL across sources', async () => {
        await writeWorkspaceYaml(
          stringify({ namedRegistries: { corp: 'https://current.example/' } }),
        )
        await writePackageJson({ pnpm: alternateRegistryAlias })

        const options = {
          cwd: testDir,
          targetVersion: '11.28.5',
          replaceDeprecated: true,
          strategy,
        }
        const result = await migratePnpmSettings(options)

        await expect(readWorkspaceYaml()).resolves.toStrictEqual({
          namedRegistries: {
            corp: 'https://current.example/',
            legacy: 'https://current.example/',
          },
        })
        expect(result.warnings.join()).toContain(
          'the new registries format supports one prefix per URL',
        )
        expect(
          JSON.parse(await readWorkspaceFile('package.json')).pnpm,
        ).toBeUndefined()
        await expect(migratePnpmSettings(options)).resolves.toMatchObject({
          changedFiles: [],
          settingsChanges: [],
        })
      })
    },
  )

  it.each([
    [
      'disabled global virtual store',
      { enableGlobalVirtualStore: false },
      { virtualStoreType: 'project' },
    ],
    [
      'writable shorthand cache',
      { sideEffectsCache: true, sideEffectsCacheReadonly: false },
      { sideEffectsCache: { read: true, write: true } },
    ],
    [
      'disabled read-only cache',
      { sideEffectsCacheReadonly: false },
      { sideEffectsCache: { read: true, write: true } },
    ],
  ] as const)('preserves explicit false for %s', async (_, pnpm, expected) => {
    await writePackageJson({ name: 'test-workspace', pnpm })

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
  })

  it.each(['11.27.1', '12.6.0'])(
    'keeps default cache reads enabled for %s',
    async targetVersion => {
      await writePackageJson({ pnpm: { sideEffectsCacheReadonly: false } })

      await migratePnpmSettings({
        cwd: testDir,
        targetVersion,
        replaceDeprecated: true,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        sideEffectsCache: { read: true, write: true },
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it('keeps conflicting named registry prefixes for manual resolution', async () => {
    const registryUrl = 'https://registry.example.com/'
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        namedRegistries: { corp: registryUrl },
        registries: {
          [registryUrl]: { prefix: 'mirror', scopes: ['@internal'] },
        },
      },
    })
    const result = await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      namedRegistries: { corp: registryUrl },
      registries: {
        [registryUrl]: { prefix: 'mirror', scopes: ['@internal'] },
      },
    })
    const messages = result.warnings
    expect(messages).toContain(
      `namedRegistries was kept because ${registryUrl} already declares prefix mirror.`,
    )
  })

  it.each(['11.28.5', '12.9.1'])(
    'preserves canonical registry routing in an existing %s workspace',
    async targetVersion => {
      const registries = {
        'https://current.example/': { prefix: 'corp' },
      }
      await writeWorkspaceYaml(
        stringify({
          namedRegistries: { corp: 'https://old.example/' },
          registries,
        }),
      )

      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion,
        replaceDeprecated: true,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({ registries })
      expect(result.warnings).toStrictEqual([])
    },
  )

  it('ignores overridden registry aliases before checking URL conflicts', async () => {
    await writePackageJson({
      pnpm: {
        namedRegistries: {
          corp: 'https://old.example/',
          mirror: 'https://old.example/',
        },
        registries: { 'https://current.example/': { prefix: 'corp' } },
      },
    })

    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '11.28.5',
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      registries: {
        'https://current.example/': { prefix: 'corp' },
        'https://old.example/': { prefix: 'mirror' },
      },
    })
    expect(result.warnings).toStrictEqual([])
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('merges default and scoped registry declarations by URL', async () => {
    const registryUrl = 'https://registry.example.com/'
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        namedRegistries: { corp: registryUrl },
        registries: {
          '@internal': registryUrl,
          default: registryUrl,
        },
      },
    })

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      registries: {
        [registryUrl]: {
          prefix: 'corp',
          scopes: ['@internal', '@'],
        },
      },
    })
  })

  it('allows registry aliases whose names resemble credential fields', async () => {
    const registryUrl = 'https://registry.example.com/'
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        namedRegistries: { token: registryUrl },
      },
    })

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      registries: {
        [registryUrl]: { prefix: 'token' },
      },
    })
  })
})
