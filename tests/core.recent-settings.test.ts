import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import type { PnpmTaskSettings, PnpmWorkspace } from '../src'
import { fsExists } from '../src/utils/fs'
import { createTestWorkspace } from './helpers'

const recentSettings = {
  cargo: { enabled: false, indexUrl: 'https://index.crates.io' },
  python: {
    enabled: false,
    executable: 'python3',
    indexUrl: 'https://pypi.org/simple/',
    extras: ['test'],
    groups: ['dev'],
  },
  pipelines: { ci: ['build', 'test'] },
  pipelineBase: 'main',
  trustPolicyExcludePrune: true,
  tasks: {
    build: {
      concurrency: 2,
      dependsOn: ['^build'],
      outputs: ['dist/**'],
      inputs: ['src/**'],
      env: ['NODE_ENV'],
      cache: false,
      cargoTargetDir: 'target',
    },
  },
} satisfies PnpmWorkspace

const packageConfigsForms = [
  {
    app: {
      hoist: false,
      modulesDir: '.modules',
      overrides: { foo: '1' },
      saveExact: true,
      savePrefix: '~',
    },
  },
  [
    {
      match: ['app'],
      hoist: false,
      modulesDir: '.modules',
      overrides: { foo: '1' },
      saveExact: true,
      savePrefix: '~',
    },
  ],
]

describe('workspace public types', () => {
  it('exports expanded task types through the workspace contract', () => {
    expectTypeOf<
      NonNullable<PnpmWorkspace['tasks']>[string]
    >().toEqualTypeOf<PnpmTaskSettings>()
  })
})

describe('migratePnpmSettings/recent settings', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
    writeNpmrc,
    writeWorkspaceFile,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('recent-settings')

  it('migrates all new fields and cleans applied settings', async () => {
    await writePackageJson({
      packageManager: 'pnpm@12.4.0',
      pnpm: recentSettings,
    })
    const result = await migratePnpmSettings({ cwd: testDir })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(recentSettings)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('preserves an existing 12.4 workspace without rewriting it', async () => {
    const original = stringify(recentSettings)
    await writePackageJson({ packageManager: 'pnpm@12.4.0' })
    await writeWorkspaceYaml(original)
    const result = await migratePnpmSettings({ cwd: testDir })
    expect(result.changedFiles).toStrictEqual([])
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it.each(['v10', 'v11', 'v12'] as const)(
    'retains new source fields for %s',
    async compatibility => {
      await writePackageJson({
        pnpm: { ...recentSettings, nodeLinker: 'isolated' },
      })
      const result = await migratePnpmSettings({ cwd: testDir, compatibility })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        nodeLinker: 'isolated',
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(recentSettings)
    },
  )

  it.each(Object.entries(recentSettings))(
    'rejects existing %s under 12.3.4 without writes',
    async (key, value) => {
      await writePackageJson({ packageManager: 'pnpm@12.3.4' })
      await writeNpmrc('node-linker=isolated')
      const original = stringify({ [key]: value })
      await writeWorkspaceYaml(original)
      await expect(migratePnpmSettings({ cwd: testDir })).rejects.toThrow(
        'incompatible',
      )
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'node-linker=isolated',
      )
    },
  )

  it.each([
    {
      strategy: 'discard',
      tasks: ['build'],
      base: 'main',
      remaining: { pipelines: { ci: ['test'] }, pipelineBase: 'next' },
    },
    {
      strategy: 'merge',
      tasks: ['build', 'test'],
      base: 'main',
      remaining: { pipelineBase: 'next' },
    },
    {
      strategy: 'overwrite',
      tasks: ['test'],
      base: 'next',
      remaining: undefined,
    },
  ] as const)(
    'merges new fields using $strategy',
    async ({ strategy, tasks, base, remaining }) => {
      await writePackageJson({
        packageManager: 'pnpm@12.4.0',
        pnpm: { pipelines: { ci: ['test'] }, pipelineBase: 'next' },
      })
      await writeWorkspaceYaml(
        stringify({ pipelines: { ci: ['build'] }, pipelineBase: 'main' }),
      )
      await migratePnpmSettings({ cwd: testDir, strategy })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        pipelines: { ci: tasks },
        pipelineBase: base,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(remaining)
    },
  )

  it('migrates new npmrc scalars only with the minor capability', async () => {
    await writePackageJson({ packageManager: 'pnpm@12.3.4' })
    await writeNpmrc(
      [
        'trust-policy-exclude-prune=true',
        'pipeline-base=main',
        'node-linker=isolated',
      ].join('\n'),
    )
    await migratePnpmSettings({ cwd: testDir })
    await expect(readWorkspaceFile('.npmrc')).resolves.toContain(
      'pipeline-base=main',
    )
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.4.0' })
    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      trustPolicyExcludePrune: true,
      pipelineBase: 'main',
    })
    await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(false)
  })

  describe.each(
    packageConfigsForms.map(packageConfigs => ({ packageConfigs })),
  )('packageConfigs form %#', ({ packageConfigs }) => {
    it.each([
      {
        sharedWorkspaceLockfile: false,
        expectedConfig: packageConfigs,
        expectedSource: undefined,
        warnings: 0,
      },
      {
        sharedWorkspaceLockfile: true,
        expectedConfig: undefined,
        expectedSource: { packageConfigs },
        warnings: 1,
      },
      {
        sharedWorkspaceLockfile: undefined,
        expectedConfig: undefined,
        expectedSource: { packageConfigs },
        warnings: 1,
      },
    ])(
      'checks sharedWorkspaceLockfile=%s',
      async ({
        sharedWorkspaceLockfile,
        expectedConfig,
        expectedSource,
        warnings,
      }) => {
        await writePackageJson({
          packageManager: 'pnpm@12.4.0',
          pnpm: { packageConfigs, nodeLinker: 'isolated' },
        })
        await writeWorkspaceYaml(stringify({ sharedWorkspaceLockfile }))
        const result = await migratePnpmSettings({ cwd: testDir })
        const workspace = await readWorkspaceYaml()
        const remaining = JSON.parse(
          await readWorkspaceFile('package.json'),
        ).pnpm
        expect(workspace.packageConfigs).toStrictEqual(expectedConfig)
        expect(remaining).toStrictEqual(expectedSource)
        expect(result.warnings).toHaveLength(warnings)
      },
    )

    it.each([
      {
        strategy: 'discard',
        shared: true,
        expectedConfig: undefined,
        expectedSource: { packageConfigs, sharedWorkspaceLockfile: false },
      },
      {
        strategy: 'merge',
        shared: true,
        expectedConfig: undefined,
        expectedSource: { packageConfigs, sharedWorkspaceLockfile: false },
      },
      {
        strategy: 'overwrite',
        shared: false,
        expectedConfig: packageConfigs,
        expectedSource: undefined,
      },
    ] as const)(
      'uses %s to resolve lockfile mode',
      async ({ strategy, shared, expectedConfig, expectedSource }) => {
        await writePackageJson({
          packageManager: 'pnpm@12.4.0',
          pnpm: { packageConfigs, sharedWorkspaceLockfile: false },
        })
        await writeWorkspaceYaml('sharedWorkspaceLockfile: true')
        await migratePnpmSettings({ cwd: testDir, strategy })
        const workspace = await readWorkspaceYaml()
        expect(workspace.sharedWorkspaceLockfile).toBe(shared)
        expect(workspace.packageConfigs).toStrictEqual(expectedConfig)
        const remaining = JSON.parse(
          await readWorkspaceFile('package.json'),
        ).pnpm
        expect(remaining).toStrictEqual(expectedSource)
      },
    )

    it('checks the effective mode for existing packageConfigs', async () => {
      const original = stringify({ packageConfigs })
      await writeWorkspaceYaml(original)
      await writePackageJson({ packageManager: 'pnpm@12.4.0' })
      await expect(migratePnpmSettings({ cwd: testDir })).rejects.toThrow(
        'sharedWorkspaceLockfile: false',
      )
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await writeNpmrc('shared-workspace-lockfile=false')
      await migratePnpmSettings({ cwd: testDir })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        packageConfigs,
        sharedWorkspaceLockfile: false,
      })
    })
  })

  it.each([
    {
      sharedWorkspaceLockfile: false,
      expectedConfig: { app: { saveExact: true } },
    },
    { sharedWorkspaceLockfile: true, expectedConfig: undefined },
    { sharedWorkspaceLockfile: undefined, expectedConfig: undefined },
  ])(
    'checks project npmrc lockfile mode %s',
    async ({ sharedWorkspaceLockfile, expectedConfig }) => {
      await writePackageJson({
        packageManager: 'pnpm@12.4.0',
        pnpm: { sharedWorkspaceLockfile },
      })
      await writeWorkspaceYaml('packages: [packages/*]')
      await writeWorkspaceFile(
        'packages/app/package.json',
        JSON.stringify({ name: 'app' }),
      )
      await writeWorkspaceFile(
        'packages/app/.npmrc',
        ['save-exact=true', 'node-linker=hoisted'].join('\n'),
      )
      const result = await migratePnpmSettings({ cwd: testDir })
      const workspace = await readWorkspaceYaml()
      expect(workspace.packageConfigs).toStrictEqual(expectedConfig)
      const npmrc = await readWorkspaceFile('packages/app/.npmrc')
      expect(npmrc).toContain('node-linker=hoisted')
      expect(npmrc.includes('save-exact=true')).toBe(
        sharedWorkspaceLockfile !== false,
      )
      expect(result.warnings.length).toBeGreaterThan(0)
    },
  )

  it.each(['12.3.4', '12.4.0'])(
    'preserves explicit behavior settings for %s',
    async version => {
      const settings = {
        minimumReleaseAge: 60,
        minimumReleaseAgeStrict: true,
        scriptShell: './scripts/shell',
        sideEffectsCache: { read: true, write: false },
      }
      await writePackageJson({
        packageManager: `pnpm@${version}`,
        pnpm: settings,
      })
      await migratePnpmSettings({ cwd: testDir })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
    },
  )
})
