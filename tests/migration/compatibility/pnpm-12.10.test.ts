import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type {
  PnpmLoadedNodeLinkerSettings,
  PnpmLockfileSettings,
  PnpmWorkspace,
} from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  nodeLinker: { type: 'loaded', excluded: ['esbuild'] },
  lockfile: { includeResolutionSettings: false },
  failIfNoMatch: true,
} satisfies PnpmWorkspace

const existingSettings = {
  nodeLinker: { type: 'loaded', excluded: ['vitest'] },
  lockfile: { includeResolutionSettings: true },
  failIfNoMatch: false,
} satisfies PnpmWorkspace

describe('pnpm 12.10 settings', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.10')

  it('exports loaded linker and lockfile option types', () => {
    expectTypeOf<PnpmLoadedNodeLinkerSettings>().toExtend<
      PnpmWorkspace['nodeLinker']
    >()
    expectTypeOf<PnpmLockfileSettings>().toExtend<PnpmWorkspace['lockfile']>()
    expectTypeOf<'loaded'>().toExtend<PnpmWorkspace['nodeLinker']>()
  })

  it.each(['12.10.0', '12.10.0+sha512.abc'])(
    'migrates and cleans the new settings for %s',
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
    'pnpm@12.9.1',
    'pnpm@12.10.0-rc.1',
    'pnpm@^12.10.0',
    'pnpm@13.0.0',
    undefined,
  ])(
    'preserves the new settings for older or unconfirmed pin %s',
    async version => {
      await writePackageJson({
        packageManager: version,
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
      targetVersion: '12.9.1',
      expected: { lockfile: true },
      retained: 'node-linker=loaded\nfail-if-no-match=true\n',
    },
    {
      targetVersion: '12.10.0',
      expected: { nodeLinker: 'loaded', failIfNoMatch: true, lockfile: true },
      retained: '',
    },
  ])(
    'uses explicit target $targetVersion and cleans only consumed npmrc settings',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({ packageManager: 'pnpm@12.9.1' })
      await writeNpmrc(
        'node-linker=loaded\nfail-if-no-match=true\nlockfile=true\nregistry=https://registry.npmjs.org/\n',
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        `${retained}registry=https://registry.npmjs.org/\n`,
      )
    },
  )

  it.each([
    { nodeLinker: 1 },
    { nodeLinker: 'unknown' },
    { nodeLinker: { excluded: ['esbuild'] } },
    { nodeLinker: { type: 'unknown' } },
    { nodeLinker: { type: 'isolated' } },
    { nodeLinker: { type: 'loaded', exclude: ['esbuild'] } },
    { nodeLinker: { type: 'loaded', excluded: 'esbuild' } },
    { nodeLinker: { type: 'loaded', excluded: [false] } },
    { nodeLinker: { type: 'loaded', excluded: null } },
    { nodeLinker: { type: 'loaded', excluded: ['esbuild'], hoist: false } },
    { nodeLinker: ['loaded'] },
    { lockfile: { includeResolutionSettings: 'false' } },
    { lockfile: { includeResolutionSettings: false, unknown: true } },
    { lockfile: [] },
    { lockfile: 'wrong' },
    { lockfile: 1 },
    { failIfNoMatch: 'true' },
  ])('retains invalid nested settings %j intact', async invalid => {
    await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.10.0',
    })
    expect(result.warnings.join()).toContain('incompatible')
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(invalid)
  })

  it.each([
    { nodeLinker: 'isolated' },
    { nodeLinker: 'hoisted' },
    { nodeLinker: 'pnp' },
    // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
    { nodeLinker: '${NODE_LINKER:-isolated}' },
    { nodeLinker: null, lockfile: null },
    { nodeLinker: 'loaded' },
    { nodeLinker: { type: 'loaded' } },
    { nodeLinker: { type: 'loaded', excluded: [] } },
    { lockfile: {} },
    { lockfile: { includeResolutionSettings: null } },
    { lockfile: false, failIfNoMatch: false },
  ])('accepts optional and defaulted forms %j', async valid => {
    await writePackageJson({ pnpm: valid })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.10.0',
    })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(valid)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('keeps v11 failIfNoMatch while retaining unsupported new value shapes', async () => {
    await writePackageJson({ pnpm: settings })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.5' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      failIfNoMatch: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({
      nodeLinker: settings.nodeLinker,
      lockfile: settings.lockfile,
    })
  })

  it('preserves a valid existing workspace byte for byte', async () => {
    const original = stringify(settings)
    await writePackageJson({ packageManager: 'pnpm@12.10.0' })
    await writeWorkspaceYaml(original)
    const result = await migratePnpmSettings({ cwd: testDir })
    expect(result.changedFiles).toStrictEqual([])
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it.each([
    { targetVersion: '12.9.1', workspace: settings },
    {
      targetVersion: '12.10.0',
      workspace: { nodeLinker: { type: 'loaded', excluded: [1] } },
    },
    {
      targetVersion: '12.10.0',
      workspace: { lockfile: { includeResolutionSettings: 'true' } },
    },
  ])(
    'rejects incompatible existing values for $targetVersion before writing',
    async ({ targetVersion, workspace }) => {
      const original = stringify(workspace)
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('node-linker=isolated')
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'node-linker=isolated',
      )
    },
  )

  it.each([
    { strategy: 'discard', expected: existingSettings, retained: settings },
    {
      strategy: 'merge',
      expected: {
        ...existingSettings,
        nodeLinker: { type: 'loaded', excluded: ['vitest', 'esbuild'] },
      },
      retained: { lockfile: settings.lockfile, failIfNoMatch: true },
    },
    { strategy: 'overwrite', expected: settings, retained: undefined },
  ] as const)(
    'applies $strategy and cleans only applied source settings',
    async ({ strategy, expected, retained }) => {
      await writePackageJson({ pnpm: settings })
      await writeWorkspaceYaml(stringify(existingSettings))
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.10.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )
})
