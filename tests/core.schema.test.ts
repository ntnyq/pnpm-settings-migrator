import consola from 'consola'
import { stripAnsi } from 'consola/utils'
import { describe, expect, it, vi } from 'vitest'
import { migratePnpmSettings } from '../src/core'
import { fsExists } from '../src/utils'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/versioned schema', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceFile,
    writeWorkspaceYaml,
  } = createTestWorkspace('schema')

  it('keeps unknown and project-refused .npmrc settings in v11', async () => {
    await writeNpmrc(
      [
        'node-linker=hoisted',
        'global-dir=.pnpm-global',
        'scope=@internal',
        'third-party-setting=enabled',
      ].join('\n'),
    )

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      nodeLinker: 'hoisted',
    })
    const npmrc = await readWorkspaceFile('.npmrc')
    expect(npmrc).toContain('global-dir=.pnpm-global')
    expect(npmrc).toContain('scope=@internal')
    expect(npmrc).toContain('third-party-setting=enabled')
    expect(npmrc).not.toContain('node-linker=hoisted')
  })

  it('only removes migrated package.json#pnpm child keys', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        customMetadata: { owner: 'tooling' },
        globalDir: '.pnpm-global',
        globalShims: { node: true },
        'node-linker': 'isolated',
        overrides: { foo: '1.0.0' },
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      overrides: { foo: '1.0.0' },
    })
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
    expect(packageJson.pnpm).toStrictEqual({
      customMetadata: { owner: 'tooling' },
      globalDir: '.pnpm-global',
      globalShims: { node: true },
      'node-linker': 'isolated',
    })
  })

  it('rejects incompatible settings already present in the workspace', async () => {
    const original = [
      'packages:',
      '  - packages/*',
      'packageConfigs:',
      '  app:',
      '    saveExact: true',
    ].join('\n')
    await writeWorkspaceYaml(original)

    await expect(
      migratePnpmSettings({ compatibility: 'v12', cwd: testDir }),
    ).rejects.toThrow('other pnpm major: "packageConfigs"')
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it('migrates settings added in recent pnpm v11 releases', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        audit: { ignorePrune: true },
        confirmModulesPurge: false,
        minimumReleaseAgeExcludePrune: true,
        sideEffectsCache: {
          read: true,
          remote: { org: 'example' },
          write: false,
        },
        tasks: {
          build: { concurrency: 2 },
        },
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      audit: { ignorePrune: true },
      confirmModulesPurge: false,
      minimumReleaseAgeExcludePrune: true,
      sideEffectsCache: {
        read: true,
        remote: { org: 'example' },
        write: false,
      },
      tasks: { build: { concurrency: 2 } },
    })
  })

  it('migrates the pnpm v12 schema delta', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        autoInstallPeersFromHighestMatch: true,
        confirmModulesPurge: true,
        externalDependencies: ['react-native'],
        globalShims: {
          node: 'always',
          typescript: true,
        },
        tasks: {
          test: { concurrency: 4 },
        },
      },
    })

    await migratePnpmSettings({ compatibility: 'v12', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      autoInstallPeersFromHighestMatch: true,
      externalDependencies: ['react-native'],
      globalShims: {
        node: 'always',
        typescript: true,
      },
      tasks: { test: { concurrency: 4 } },
    })
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
    expect(packageJson.pnpm).toStrictEqual({ confirmModulesPurge: true })
  })

  it('canonicalizes aliases when replaceDeprecated is enabled', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        auditConfig: { ignoreGhsas: ['GHSA-example'] },
        auditLevel: 'high',
        cleanupUnusedCatalogs: true,
        enableGlobalVirtualStore: true,
        namedRegistries: {
          corp: 'https://registry.example.com/',
        },
        registries: {
          '@internal': 'https://registry.example.com/',
        },
        remoteSideEffectsCache: { org: 'example' },
        sideEffectsCache: true,
        sideEffectsCacheReadonly: true,
        updateConfig: {
          changeset: true,
          ignoreDependencies: ['eslint'],
        },
      },
    })

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    const workspace = await readWorkspaceYaml()
    expect(workspace).toMatchObject({
      audit: {
        ignore: ['GHSA-example'],
        level: 'high',
      },
      catalogPrune: true,
      registries: {
        'https://registry.example.com/': {
          prefix: 'corp',
          scopes: ['@internal'],
        },
      },
      sideEffectsCache: {
        read: true,
        remote: { org: 'example' },
        write: false,
      },
      update: {
        changeset: true,
        ignoreDeps: ['eslint'],
      },
      virtualStoreType: 'global',
    })
    expect(workspace).not.toHaveProperty('auditConfig')
    expect(workspace).not.toHaveProperty('auditLevel')
    expect(workspace).not.toHaveProperty('cleanupUnusedCatalogs')
    expect(workspace).not.toHaveProperty('enableGlobalVirtualStore')
    expect(workspace).not.toHaveProperty('namedRegistries')
    expect(workspace).not.toHaveProperty('remoteSideEffectsCache')
    expect(workspace).not.toHaveProperty('sideEffectsCacheReadonly')
    expect(workspace).not.toHaveProperty('updateConfig')
  })

  it.each([
    ['discard', 'project', { enableGlobalVirtualStore: true }],
    ['merge', 'project', { enableGlobalVirtualStore: true }],
    ['overwrite', 'global', undefined],
  ] as const)(
    'keeps unapplied aliases under the %s strategy',
    async (strategy, virtualStoreType, expectedPnpm) => {
      await writeWorkspaceYaml('virtualStoreType: project\n')
      await writePackageJson({
        name: 'test-workspace',
        pnpm: { enableGlobalVirtualStore: true },
      })

      await migratePnpmSettings({
        compatibility: 'v11',
        cwd: testDir,
        replaceDeprecated: true,
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toMatchObject({
        virtualStoreType,
      })
      const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
      expect(packageJson.pnpm).toStrictEqual(expectedPnpm)
    },
  )

  it('keeps credentialed registry URLs out of the workspace', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        namedRegistries: {
          corp: 'https://fake-user:fake-pass@registry.invalid/',
        },
        nodeLinker: 'isolated',
        registries: {
          'https://registry.invalid/': { token: 'fake-token' },
        },
      },
    })
    const warn = vi.spyOn(consola, 'warn').mockImplementation(() => {})

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      nodeLinker: 'isolated',
    })
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
    expect(packageJson.pnpm).toStrictEqual({
      namedRegistries: {
        corp: 'https://fake-user:fake-pass@registry.invalid/',
      },
      registries: {
        'https://registry.invalid/': { token: 'fake-token' },
      },
    })
    const messages = warn.mock.calls.map(([message]) =>
      stripAnsi(String(message)),
    )
    expect(messages).toContain(
      'Kept unsafe registry settings in package.json#pnpm: "namedRegistries", "registries". Remove credentials and dynamic URL interpolation before migrating them.',
    )

    warn.mockRestore()
  })

  it('keeps dynamic registry URLs out of the workspace', async () => {
    const dynamicRegistry = '$' + '{PRIVATE_REGISTRY_URL}'
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        nodeLinker: 'isolated',
        registries: {
          '@internal': dynamicRegistry,
        },
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      nodeLinker: 'isolated',
    })
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
    expect(packageJson.pnpm).toStrictEqual({
      registries: {
        '@internal': dynamicRegistry,
      },
    })
  })

  it('keeps namedRegistries when one URL has multiple prefixes', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        namedRegistries: {
          corp: 'https://registry.example.com/',
          mirror: 'https://registry.example.com/',
        },
      },
    })

    await migratePnpmSettings({
      cleanPackageJson: false,
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      namedRegistries: {
        corp: 'https://registry.example.com/',
        mirror: 'https://registry.example.com/',
      },
    })
  })

  it('moves supported subproject .npmrc fields to v11 packageConfigs', async () => {
    await writePackageJson({ name: 'test-workspace', private: true })
    await writeWorkspaceYaml('packages:\n  - packages/*\n')
    await writeWorkspaceFile(
      'packages/app/package.json',
      JSON.stringify({ name: '@example/app', version: '1.0.0' }),
    )
    await writeWorkspaceFile(
      'packages/app/.npmrc',
      [
        'modules-dir=.modules',
        'node-linker=hoisted',
        'registry=https://registry.npmjs.org/',
        'save-exact=true',
      ].join('\n'),
    )

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      packageConfigs: {
        '@example/app': {
          modulesDir: '.modules',
          saveExact: true,
        },
      },
    })
    const npmrc = await readWorkspaceFile('packages/app/.npmrc')
    expect(npmrc).toContain('node-linker=hoisted')
    expect(npmrc).toContain('registry=https://registry.npmjs.org/')
    expect(npmrc).not.toContain('modules-dir=.modules')
    expect(npmrc).not.toContain('save-exact=true')
  })

  it.each([
    {
      appNpmrcExists: true,
      legacyNpmrcExists: false,
      packageConfigs: { '@example/legacy': { saveExact: true } },
      packages: ['packages/*'],
      strategy: 'discard',
    },
    {
      appNpmrcExists: false,
      legacyNpmrcExists: false,
      packageConfigs: {
        '@example/app': { savePrefix: '^' },
        '@example/legacy': { saveExact: true },
      },
      packages: ['packages/*', 'apps/*'],
      strategy: 'merge',
    },
    {
      appNpmrcExists: false,
      legacyNpmrcExists: true,
      packageConfigs: { '@example/app': { savePrefix: '^' } },
      packages: ['apps/*'],
      strategy: 'overwrite',
    },
  ] as const)(
    'only migrates subprojects selected by the $strategy strategy',
    async ({
      appNpmrcExists,
      legacyNpmrcExists,
      packageConfigs,
      packages,
      strategy,
    }) => {
      await writeWorkspaceYaml('packages:\n  - packages/*\n')
      await writePackageJson({
        name: 'test-workspace',
        pnpm: { packages: ['apps/*'] },
        private: true,
      })
      await writeWorkspaceFile(
        'packages/legacy/package.json',
        JSON.stringify({ name: '@example/legacy', version: '1.0.0' }),
      )
      await writeWorkspaceFile('packages/legacy/.npmrc', 'save-exact=true\n')
      await writeWorkspaceFile(
        'apps/app/package.json',
        JSON.stringify({ name: '@example/app', version: '1.0.0' }),
      )
      await writeWorkspaceFile('apps/app/.npmrc', 'save-prefix=^\n')

      await migratePnpmSettings({
        compatibility: 'v11',
        cwd: testDir,
        strategy,
      })

      const workspace = await readWorkspaceYaml()
      expect(workspace.packages).toStrictEqual(packages)
      expect(workspace.packageConfigs).toStrictEqual(packageConfigs)
      await expect(fsExists(`${testDir}/packages/legacy/.npmrc`)).resolves.toBe(
        legacyNpmrcExists,
      )
      await expect(fsExists(`${testDir}/apps/app/.npmrc`)).resolves.toBe(
        appNpmrcExists,
      )
    },
  )

  it.each([
    ['discard', false, true],
    ['merge', false, true],
    ['overwrite', true, false],
  ] as const)(
    'keeps conflicting project settings under the %s strategy',
    async (strategy, saveExact, npmrcExists) => {
      await writePackageJson({ name: 'test-workspace', private: true })
      await writeWorkspaceYaml(
        [
          'packages:',
          '  - packages/*',
          'packageConfigs:',
          '  "@example/app":',
          '    saveExact: false',
        ].join('\n'),
      )
      await writeWorkspaceFile(
        'packages/app/package.json',
        JSON.stringify({ name: '@example/app', version: '1.0.0' }),
      )
      await writeWorkspaceFile('packages/app/.npmrc', 'save-exact=true\n')

      await migratePnpmSettings({
        compatibility: 'v11',
        cwd: testDir,
        strategy,
      })

      const workspace = await readWorkspaceYaml()
      expect(workspace.packageConfigs['@example/app'].saveExact).toBe(saveExact)
      await expect(fsExists(`${testDir}/packages/app/.npmrc`)).resolves.toBe(
        npmrcExists,
      )
    },
  )

  it('keeps subproject .npmrc settings in v12', async () => {
    await writePackageJson({ name: 'test-workspace', private: true })
    await writeWorkspaceYaml('packages:\n  - packages/*\n')
    await writeWorkspaceFile(
      'packages/app/package.json',
      JSON.stringify({ name: '@example/app', version: '1.0.0' }),
    )
    await writeWorkspaceFile('packages/app/.npmrc', 'save-exact=true\n')

    await migratePnpmSettings({ compatibility: 'v12', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.not.toHaveProperty(
      'packageConfigs',
    )
    await expect(readWorkspaceFile('packages/app/.npmrc')).resolves.toBe(
      'save-exact=true\n',
    )
  })
})
