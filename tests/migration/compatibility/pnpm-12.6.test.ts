import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  autoDedupe: true,
  saveTypes: true,
  progress: false,
  loglevel: 'warn',
  tagVersionPrefix: '',
  tasks: { build: { concurrencyGroup: 'build', priority: -1 } },
} satisfies PnpmWorkspace

describe('pnpm 12.6 settings', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
    writeNpmrc,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.6')

  it('exposes the new settings through public workspace types', () => {
    expectTypeOf<PnpmWorkspace['autoDedupe']>().toEqualTypeOf<
      boolean | undefined
    >()
    expectTypeOf<PnpmWorkspace['saveTypes']>().toEqualTypeOf<
      boolean | undefined
    >()
    expectTypeOf<
      NonNullable<PnpmWorkspace['tasks']>[string]['priority']
    >().toEqualTypeOf<number | undefined>()
  })

  it.each(['12.6.0', '12.6.0+sha512.abc'])(
    'migrates manifest settings and cleans sources for %s',
    async version => {
      await writePackageJson({
        packageManager: `pnpm@${version}`,
        pnpm: settings,
      })
      const result = await migratePnpmSettings({ cwd: testDir })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each([
    'pnpm@12.5.1',
    'pnpm@12.6.0-rc.1',
    'pnpm@^12.6.0',
    'pnpm@13.0.0',
    undefined,
  ])(
    'preserves settings with an older or unconfirmed pin %s',
    async packageManager => {
      await writePackageJson({
        packageManager,
        pnpm: { ...settings, saveExact: true },
      })
      const result = await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v12',
      })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(settings)
    },
  )

  it.each([
    {
      targetVersion: '12.5.1',
      expected: {},
      retained:
        'auto-dedupe=true\nsave-types=false\nprogress=false\nloglevel=warn\ntag-version-prefix=release-\n',
    },
    {
      targetVersion: '12.6.0',
      expected: {
        autoDedupe: true,
        saveTypes: false,
        progress: false,
        loglevel: 'warn',
        tagVersionPrefix: 'release-',
      },
      retained: '',
    },
  ])(
    'selects and cleans npmrc settings at the boundary $targetVersion',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({})
      await writeNpmrc(
        'auto-dedupe=true\nsave-types=false\nprogress=false\nloglevel=warn\ntag-version-prefix=release-\nnode-linker=isolated\nregistry=https://registry.npmjs.org/',
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        nodeLinker: 'isolated',
        ...expected,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        `${retained}registry=https://registry.npmjs.org/\n`,
      )
    },
  )

  it('keeps v11 progress and loglevel support', async () => {
    await writePackageJson({
      pnpm: {
        progress: false,
        loglevel: 'warn',
        autoDedupe: true,
        saveTypes: true,
      },
    })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '11.27.1' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      progress: false,
      loglevel: 'warn',
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ autoDedupe: true, saveTypes: true })
  })

  it.each([-2_147_483_648, 0, 2_147_483_647])(
    'accepts signed priority %s',
    async priority => {
      await writePackageJson({ pnpm: { tasks: { build: { priority } } } })
      await migratePnpmSettings({ cwd: testDir, targetVersion: '12.6.0' })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        tasks: { build: { priority } },
      })
    },
  )

  it.each([
    { autoDedupe: 'true' },
    { saveTypes: [] },
    { progress: 'false' },
    { loglevel: 'verbose' },
    { tagVersionPrefix: false },
    ...[1.5, '2', 2_147_483_648, -2_147_483_649, null].map(priority => ({
      tasks: { build: { priority, outputs: ['dist/**'] } },
    })),
  ])(
    'retains invalid values without dropping nested fields: %j',
    async invalid => {
      await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.6.0',
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

  it.each([
    { targetVersion: '12.5.1', workspace: settings },
    {
      targetVersion: '12.6.0',
      workspace: { tasks: { build: { priority: 1.5 } } },
    },
    {
      targetVersion: '12.6.0',
      workspace: { macosBackup: { excludeModulesDir: true } },
    },
  ])(
    'rejects an incompatible existing workspace before writes: %j',
    async ({ targetVersion, workspace }) => {
      await writePackageJson({})
      await writeNpmrc('save-exact=true')
      const original = stringify(workspace)
      await writeWorkspaceYaml(original)
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow(/incompatible|project-refused/u)
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-exact=true')
    },
  )

  it('preserves an existing valid workspace without rewriting it', async () => {
    await writePackageJson({ packageManager: 'pnpm@12.6.0' })
    const original = stringify(settings)
    await writeWorkspaceYaml(original)
    const result = await migratePnpmSettings({ cwd: testDir })
    expect(result.changedFiles).toStrictEqual([])
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it.each([
    {
      strategy: 'discard',
      expected: { autoDedupe: false, tasks: { build: { priority: 1 } } },
      retained: { autoDedupe: true, tasks: { build: { priority: 2 } } },
    },
    {
      strategy: 'merge',
      expected: { autoDedupe: false, tasks: { build: { priority: 1 } } },
      retained: { autoDedupe: true, tasks: { build: { priority: 2 } } },
    },
    {
      strategy: 'overwrite',
      expected: { autoDedupe: true, tasks: { build: { priority: 2 } } },
      retained: {},
    },
  ] as const)(
    'preserves conflicts and global-only settings with $strategy',
    async ({ strategy, expected, retained }) => {
      const macosBackup = { excludeModulesDir: true, excludeStoreDir: true }
      await writePackageJson({
        packageManager: 'pnpm@12.6.0',
        pnpm: {
          autoDedupe: true,
          tasks: { build: { priority: 2 } },
          macosBackup,
        },
      })
      await writeWorkspaceYaml(
        'autoDedupe: false\ntasks:\n  build:\n    priority: 1\n',
      )
      await writeNpmrc('macos-backup.exclude-store-dir=true\nsave-types=true')
      const result = await migratePnpmSettings({ cwd: testDir, strategy })
      expect(result.warnings.join()).toContain('project-refused')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        ...expected,
        saveTypes: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ macosBackup, ...retained })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'macos-backup.exclude-store-dir=true\n',
      )
    },
  )
})
