import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const targetVersion = '12.23.0'
const previousVersion = '12.22.0'
const settings = {
  access: 'restricted',
  editor: null,
  nodeLinker: {
    type: 'isolated',
    hoist: { public: ['*eslint*'], private: [] },
  },
  referenceTime: '2025-01-02T03:04:05+02:00',
  versioning: { ignore: ['internal'], includePrivatePackages: false },
  warnUnusedOverrides: false,
} satisfies PnpmWorkspace

describe('pnpm 12.23 workspace fields', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.23')

  it('migrates the new fields using an exact inferred target', async () => {
    const { access, warnUnusedOverrides, ...manifestSettings } = settings
    await writePackageJson({
      packageManager: `pnpm@${targetVersion}`,
      pnpm: manifestSettings,
    })
    await writeNpmrc(
      `access=${access}\nwarn-unused-overrides=${warnUnusedOverrides}\n`,
    )
    expect(
      (await migratePnpmSettings({ cwd: testDir })).warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
    await expect(readWorkspaceFile('.npmrc')).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual({
      packageManager: `pnpm@${targetVersion}`,
    })
  })

  it.each([
    `pnpm@${previousVersion}`,
    'pnpm@^12.23.0',
    'pnpm@12.23.0-rc.1',
    'pnpm@13.0.0',
    undefined,
  ])(
    'retains complete settings without confirmed support at %s',
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
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(settings)
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
    },
  )

  it('keeps legacy linker and versioning forms on the preceding release', async () => {
    const pnpm = {
      nodeLinker: { type: 'loaded', excluded: ['vite'] },
      versioning: { ignore: ['internal'] },
    }
    await writePackageJson({ pnpm })
    expect(
      (
        await migratePnpmSettings({
          cwd: testDir,
          targetVersion: previousVersion,
        })
      ).warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(pnpm)
  })

  it.each([
    { nodeLinker: { type: 'isolated', hoist: false } },
    { nodeLinker: { type: 'isolated', hoist: null } },
    { nodeLinker: { type: 'isolated', hoist: { private: null } } },
    { nodeLinker: { type: 'pnp' } },
    { nodeLinker: { type: 'hoisted', hoistingLimits: 'dependencies' } },
    {
      nodeLinker: {
        type: 'hoisted',
        hoistingLimits: '$' + '{LIMIT:-dependencies}',
      },
    },
    {
      versioning: { includePrivatePackages: '$' + '{PRIVATE_PACKAGES:-false}' },
    },
    { warnUnusedOverrides: '$' + '{WARN_UNUSED:-false}' },
    { referenceTime: '2024-02-29 02:04:05.123456789z' },
    { referenceTime: '2024-12-31T23:59:60Z' },
    { noProxy: null },
    { noProxy: false },
  ])('accepts supported values %j', async pnpm => {
    await writePackageJson({ pnpm })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion })).warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(pnpm)
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual(
      {},
    )
  })

  it.each([
    { access: false },
    { editor: 'configured-editor' },
    { noProxy: ['localhost'] },
    { nodeLinker: { type: 'isolated', hoist: { public: [42], private: [] } } },
    { nodeLinker: { type: 'isolated', hoist: { publc: ['*'] } } },
    { nodeLinker: { type: 'hoisted', hoistingLimits: 'global' } },
    { nodeLinker: { type: 'hoisted', excluded: [] } },
    { nodeLinker: { type: 'pnp', hoist: true } },
    { referenceTime: 42 },
    { referenceTime: '2025-02-30T01:00:00Z' },
    { referenceTime: '2025-01-02T24:00:00Z' },
    { referenceTime: '2025-01-02T01:00:00Z\n' },
    { referenceTime: '2999-01-01T00:00:00Z' },
    { referenceTime: '$' + '{REFERENCE_TIME}' },
    { versioning: { ignore: ['internal'], includePrivatePackages: 'no' } },
    {
      versioning: {
        includePrivatePackages: false,
        changelog: { storag: 'registry' },
      },
    },
    { versioning: { includePrivatePackages: false, epics: [{ lead: 'app' }] } },
    { warnUnusedOverrides: 'maybe' },
  ])('retains invalid or refused source values %j', async pnpm => {
    await writePackageJson({ pnpm: { ...pnpm, saveExact: true } })
    const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(result.warnings.join()).toContain(Object.keys(pnpm)[0])
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(pnpm)
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
  })

  it.each([
    { version: targetVersion, nodeLinker: { type: 'isolated', hoist: ['*'] } },
    { version: previousVersion, nodeLinker: settings.nodeLinker },
  ])(
    'rejects incompatible existing linker objects before writing %j',
    async ({ version, nodeLinker }) => {
      const workspace = stringify({ nodeLinker })
      await writeWorkspaceYaml(workspace)
      await writeNpmrc('save-exact=true\n')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion: version }),
      ).rejects.toThrow('nodeLinker')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        workspace,
      )
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'save-exact=true\n',
      )
    },
  )

  const existingLinker = {
    type: 'isolated',
    hoist: { private: ['a', '!a', 'a'] },
  }
  const incomingLinker = { type: 'hoisted', hoistingLimits: 'dependencies' }
  const retainedLinker = { nodeLinker: incomingLinker }

  it.each([
    { strategy: 'discard', expected: existingLinker, retained: retainedLinker },
    { strategy: 'merge', expected: existingLinker, retained: retainedLinker },
    { strategy: 'overwrite', expected: incomingLinker, retained: undefined },
  ] as const)(
    'keeps options for the $strategy linker type when types conflict',
    async ({ strategy, expected, retained }) => {
      await writeWorkspaceYaml(stringify({ nodeLinker: existingLinker }))
      await writePackageJson({ pnpm: retainedLinker })
      await migratePnpmSettings({ cwd: testDir, strategy, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        nodeLinker: expected,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  const incomingPatterns = {
    nodeLinker: {
      type: 'isolated',
      hoist: { private: ['two'], public: ['public-*'] },
    },
  }

  it.each([
    {
      strategy: 'discard',
      hoist: { private: ['one'], public: ['public-*'] },
      retained: incomingPatterns,
    },
    {
      strategy: 'merge',
      hoist: { private: ['one', 'two'], public: ['public-*'] },
      retained: undefined,
    },
    {
      strategy: 'overwrite',
      hoist: { private: ['two'], public: ['public-*'] },
      retained: undefined,
    },
  ] as const)(
    'uses $strategy for options of the same linker type',
    async ({ strategy, hoist, retained }) => {
      const existing = { type: 'isolated', hoist: { private: ['one'] } }
      await writeWorkspaceYaml(stringify({ nodeLinker: existing }))
      await writePackageJson({ pnpm: incomingPatterns })
      await migratePnpmSettings({ cwd: testDir, strategy, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        nodeLinker: { type: 'isolated', hoist },
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )
})
