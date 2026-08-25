import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../src/core'
import { fsExists, resolveCompatibilityTarget } from '../src/utils'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/compatibility', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceFile,
    writeWorkspaceYaml,
  } = createTestWorkspace('compatibility')

  it('migrates non auth/registry .npmrc settings in v11', async () => {
    await writeNpmrc(
      [
        'node-linker=hoisted',
        'save-exact=true',
        'cafile=/tmp/custom-ca.pem',
        'registry=https://registry.npmjs.org/',
        '//registry.npmjs.org/:_authToken=' + '$' + '{NPM_TOKEN}',
      ].join('\n'),
    )

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace).toMatchObject({ nodeLinker: 'hoisted', saveExact: true })
    expect(workspace.cafile).toBeUndefined()
    expect(workspace.registry).toBeUndefined()
  })

  it('keeps auth/registry lines in .npmrc and cleans migrated lines in v11', async () => {
    await writeNpmrc(
      [
        'node-linker=hoisted',
        'save-exact=true',
        'cafile=/tmp/custom-ca.pem',
        'registry=https://registry.npmjs.org/',
        '@my-org:registry=https://registry.example.com/',
        '//registry.npmjs.org/:_authToken=' + '$' + '{NPM_TOKEN}',
      ].join('\n'),
    )

    await migratePnpmSettings({
      cleanNpmrc: true,
      compatibility: 'v11',
      cwd: testDir,
    })
    const updatedNpmrc = await readWorkspaceFile('.npmrc')

    expect(updatedNpmrc).not.toContain('node-linker=')
    expect(updatedNpmrc).not.toContain('save-exact=')
    expect(updatedNpmrc).toContain('cafile=/tmp/custom-ca.pem')
    expect(updatedNpmrc).toContain('registry=https://registry.npmjs.org/')
    expect(updatedNpmrc).toContain(
      '@my-org:registry=https://registry.example.com/',
    )
    expect(updatedNpmrc).toContain(
      '//registry.npmjs.org/:_authToken=' + '$' + '{NPM_TOKEN}',
    )
  })

  it('only removes keys that were migrated when cleaning .npmrc in v11', async () => {
    await writeNpmrc(
      [
        'node-linker=hoisted',
        'save-exact=true',
        'registry=https://registry.npmjs.org/',
        '# keep comments',
        'broken-line-without-equals',
      ].join('\n'),
    )

    await migratePnpmSettings({
      cleanNpmrc: true,
      compatibility: 'v11',
      cwd: testDir,
    })
    const updatedNpmrc = await readWorkspaceFile('.npmrc')

    expect(updatedNpmrc).toContain('registry=https://registry.npmjs.org/')
    expect(updatedNpmrc).toContain('# keep comments')
    expect(updatedNpmrc).toContain('broken-line-without-equals')
    expect(updatedNpmrc).not.toContain('node-linker=hoisted')
    expect(updatedNpmrc).not.toContain('save-exact=true')
  })

  it('keeps legacy npmrc whitelist behavior in v10 mode', async () => {
    await writeNpmrc(
      'node-linker=hoisted\nignored-optional-dependencies[]=fsevents',
    )

    await migratePnpmSettings({ compatibility: 'v10', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.ignoredOptionalDependencies).toStrictEqual(['fsevents'])
    expect(workspace.nodeLinker).toBe('hoisted')
  })

  it('keeps package-manager strictness settings in v10 mode', async () => {
    await writeNpmrc(
      'package-manager-strict=false\npackage-manager-strict-version=true',
    )

    await migratePnpmSettings({ compatibility: 'v10', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.packageManagerStrict).toBe(false)
    expect(workspace.packageManagerStrictVersion).toBe(true)
    expect(workspace.pmOnFail).toBeUndefined()
  })

  it('migrates additional schema-aligned .npmrc settings in v10', async () => {
    await writeNpmrc(
      [
        'network-concurrency=24',
        'package-import-method=clone-or-copy',
        'store-dir=.pnpm-store',
        'verify-store-integrity=false',
      ].join('\n'),
    )

    await migratePnpmSettings({ compatibility: 'v10', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace).toMatchObject({
      networkConcurrency: '24',
      packageImportMethod: 'clone-or-copy',
      storeDir: '.pnpm-store',
      verifyStoreIntegrity: false,
    })
  })

  it('normalizes legacy build settings to allowBuilds in v11', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        ignoredBuiltDependencies: ['core-js'],
        neverBuiltDependencies: ['fsevents'],
        onlyBuiltDependencies: ['esbuild'],
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.allowBuilds).toStrictEqual({
      'core-js': false,
      esbuild: true,
      fsevents: false,
    })
  })

  it('merges onlyBuiltDependenciesFile entries into allowBuilds in v11', async () => {
    await writeWorkspaceFile(
      'allowed-builds.json',
      JSON.stringify(['electron', '@swc/core']),
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        onlyBuiltDependencies: ['esbuild'],
        onlyBuiltDependenciesFile: 'allowed-builds.json',
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.allowBuilds).toStrictEqual({
      '@swc/core': true,
      electron: true,
      esbuild: true,
    })
    expect(workspace.onlyBuiltDependenciesFile).toBeUndefined()
  })

  it.each([
    [
      'managePackageManagerVersions enabled',
      { managePackageManagerVersions: true },
      'download',
    ],
    [
      'managePackageManagerVersions disabled',
      { managePackageManagerVersions: false },
      'ignore',
    ],
    ['packageManagerStrict disabled', { packageManagerStrict: false }, 'warn'],
    [
      'packageManagerStrictVersion enabled',
      { packageManagerStrictVersion: true },
      'error',
    ],
  ])('replaces %s with pmOnFail', async (_name, pnpm, expected) => {
    await writePackageJson({ name: 'test-workspace', pnpm })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.pmOnFail).toBe(expected)
    expect(workspace.managePackageManagerVersions).toBeUndefined()
    expect(workspace.packageManagerStrict).toBeUndefined()
    expect(workspace.packageManagerStrictVersion).toBeUndefined()
  })

  it('normalizes removed settings already in pnpm-workspace.yaml', async () => {
    await writeWorkspaceYaml(
      [
        'packageManagerStrict: false',
        'onlyBuiltDependencies:',
        '  - esbuild',
      ].join('\n'),
    )

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.pmOnFail).toBe('warn')
    expect(workspace.allowBuilds).toStrictEqual({ esbuild: true })
    expect(workspace.packageManagerStrict).toBeUndefined()
    expect(workspace.onlyBuiltDependencies).toBeUndefined()
  })

  it.each([
    ['discard', true],
    ['merge', true],
    ['overwrite', false],
  ] as const)(
    'preserves %s precedence after normalizing existing and incoming settings',
    async (strategy, expected) => {
      await writeWorkspaceYaml('onlyBuiltDependencies:\n  - esbuild\n')
      await writePackageJson({
        name: 'test-workspace',
        pnpm: { ignoredBuiltDependencies: ['esbuild'] },
      })

      await migratePnpmSettings({
        compatibility: 'v11',
        cwd: testDir,
        strategy,
      })
      const workspace = await readWorkspaceYaml()

      expect(workspace.allowBuilds).toStrictEqual({ esbuild: expected })
    },
  )

  it('renames auditConfig.ignoreCves in v11', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        auditConfig: {
          ignoreCves: ['CVE-2025-0001'],
        },
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.auditConfig).toStrictEqual({
      ignoreGhsas: ['CVE-2025-0001'],
    })
  })

  it('moves useNodeVersion to package.json devEngines.runtime in v11', async () => {
    await writePackageJson({
      name: 'test-workspace',
      packageManager: 'pnpm@11.0.0',
      pnpm: { useNodeVersion: '22.14.0' },
    })

    await migratePnpmSettings({ cwd: testDir })
    const workspace = await readWorkspaceYaml()
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))

    expect(workspace.useNodeVersion).toBeUndefined()
    expect(packageJson.devEngines.runtime).toStrictEqual({
      name: 'node',
      version: '22.14.0',
    })
    expect(packageJson.pnpm).toBeUndefined()
  })

  it('moves root executionEnv.nodeVersion to devEngines.runtime in v11', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        executionEnv: { nodeVersion: '22.15.0' },
        ignoreDepScripts: true,
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))

    expect(workspace.executionEnv).toBeUndefined()
    expect(workspace.ignoreDepScripts).toBeUndefined()
    expect(packageJson.devEngines.runtime).toStrictEqual({
      name: 'node',
      version: '22.15.0',
    })
  })

  it('converts legacy node mirror entries from .npmrc in v11', async () => {
    await writeNpmrc(
      [
        'node-mirror:release=https://npmmirror.com/mirrors/node/',
        'node-mirror:nightly=https://npmmirror.com/mirrors/node-nightly/',
      ].join('\n'),
    )

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.nodeDownloadMirrors).toStrictEqual({
      nightly: 'https://npmmirror.com/mirrors/node-nightly/',
      release: 'https://npmmirror.com/mirrors/node/',
    })
    await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(false)
  })

  it('renames allowNonAppliedPatches to allowUnusedPatches in v11', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        allowNonAppliedPatches: true,
        ignorePatchFailures: true,
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.allowUnusedPatches).toBe(true)
    expect(workspace.ignorePatchFailures).toBeUndefined()
  })

  it('auto-detects v11 from packageManager', async () => {
    await writePackageJson({
      name: 'test-workspace',
      packageManager: 'pnpm@11.0.0',
      pnpm: { onlyBuiltDependencies: ['esbuild'] },
    })

    await migratePnpmSettings({ cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.allowBuilds).toStrictEqual({ esbuild: true })
  })

  it('auto-detects v12 release candidates from packageManager', () => {
    expect(resolveCompatibilityTarget('auto', 'pnpm@12.0.0-rc.7')).toBe('v12')
  })

  it('auto-detects v12 ranges from devEngines.packageManager', () => {
    expect(
      resolveCompatibilityTarget('auto', undefined, {
        name: 'pnpm',
        version: '^12.0.0-rc.7',
      }),
    ).toBe('v12')
  })

  it('auto-detects pnpm from a devEngines.packageManager array', () => {
    expect(
      resolveCompatibilityTarget('auto', undefined, [
        { name: 'npm', version: '^11.0.0' },
        { name: 'pnpm', version: '^11.0.0' },
      ]),
    ).toBe('v11')
  })

  it('applies v11 settings migration and npmrc cleanup in v12 mode', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { onlyBuiltDependencies: ['esbuild'] },
    })
    await writeNpmrc('node-linker=hoisted')

    await migratePnpmSettings({ compatibility: 'v12', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.allowBuilds).toStrictEqual({ esbuild: true })
    expect(workspace.nodeLinker).toBe('hoisted')
    await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(false)
  })

  it('auto mode defaults to v10 behavior when packageManager is missing', async () => {
    await writeNpmrc('node-linker=hoisted\nsave-exact=true')

    await migratePnpmSettings({ compatibility: 'auto', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.nodeLinker).toBe('hoisted')
    expect(workspace.saveExact).toBe(true)
  })

  it('replaces deprecated settings when replaceDeprecated is true in v10 mode', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        allowNonAppliedPatches: true,
        ignoredBuiltDependencies: ['core-js'],
        onlyBuiltDependencies: ['esbuild'],
      },
    })

    await migratePnpmSettings({
      compatibility: 'v10',
      cwd: testDir,
      replaceDeprecated: true,
    })
    const workspace = await readWorkspaceYaml()

    expect(workspace.allowUnusedPatches).toBe(true)
    expect(workspace.allowBuilds).toStrictEqual({
      'core-js': false,
      esbuild: true,
    })
    expect(workspace.allowNonAppliedPatches).toBeUndefined()
    expect(workspace.ignoredBuiltDependencies).toBeUndefined()
    expect(workspace.onlyBuiltDependencies).toBeUndefined()
  })
})
