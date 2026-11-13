import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const targetVersion = '12.19.0'
const settings = {
  projectScopedOptionalPeers: true,
  lockfile: {
    format: 'v13',
    includeResolutionSettings: true,
    integrityTarget: 'tar',
  },
} satisfies PnpmWorkspace
const lockfileSection =
  '[lockfile]\nformat=v13\nincludeResolutionSettings=true\nintegrityTarget=tar\n'
const npmrc = `project-scoped-optional-peers=true\n${lockfileSection}`
const existing = {
  projectScopedOptionalPeers: false,
  lockfile: { format: 'v9', includeResolutionSettings: true },
}
const incoming = {
  projectScopedOptionalPeers: true,
  lockfile: { format: 'v13' },
}

describe('pnpm 12.19 optional peers and lockfile formats', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    writeWorkspaceFile,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.19')

  it.each([
    { packageManager: 'pnpm@12.19.0' },
    { packageManager: 'pnpm@12.20.0' },
    {
      devEngines: {
        packageManager: { name: 'pnpm', version: '12.19.0+build.1' },
      },
    },
  ])('infers an exact target and preserves the pin %j', async declaration => {
    await writePackageJson({ ...declaration, pnpm: settings })
    expect(
      (await migratePnpmSettings({ cwd: testDir })).warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual(
      declaration,
    )
  })

  it.each(['12.18.0', '11.28.11', '10.34.9'])(
    'retains whole objects and migrates unrelated settings before the boundary %s',
    async version => {
      await writePackageJson({ pnpm: { ...settings, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: version,
      })
      expect(result.warnings.join()).toContain('lockfile')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(settings)
    },
  )

  it.each(['pnpm@^12.19.0', 'pnpm@12.19.0-rc.1', 'pnpm@13.0.0', undefined])(
    'keeps new capabilities conservative for %s',
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
      version: targetVersion,
      pin: '12.18.0',
      expected: settings,
      retained: lockfileSection,
    },
    { version: '12.18.0', pin: targetVersion, expected: {}, retained: npmrc },
    {
      version: targetVersion,
      pin: '11.28.11',
      expected: settings,
      retained: lockfileSection,
    },
  ])(
    'applies explicit $version precedence to npmrc sources',
    async ({ version, pin, expected, retained }) => {
      await writePackageJson({ packageManager: `pnpm@${pin}` })
      await writeNpmrc(`save-exact=true\n${npmrc}`)
      await migratePnpmSettings({ cwd: testDir, targetVersion: version })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
        ...expected,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(retained)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).packageManager,
      ).toBe(`pnpm@${pin}`)
    },
  )

  it.each([
    { projectScopedOptionalPeers: false, lockfile: { format: 'v9' } },
    { projectScopedOptionalPeers: null, lockfile: { format: null } },
    { lockfile: { format: '$' + '{LOCKFILE_FORMAT:-v13}' } },
    { lockfile: true },
    { lockfile: false },
    { lockfile: {} },
  ])('preserves explicit valid values %j', async pnpm => {
    await writePackageJson({ pnpm })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion })).warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(pnpm)
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual(
      {},
    )
  })

  const invalidSettings = [
    { projectScopedOptionalPeers: 'yes' },
    { projectScopedOptionalPeers: [] },
    { projectScopedOptionalPeers: {} },
    { lockfile: { format: 'v10', includeResolutionSettings: true } },
    { lockfile: { format: 13 } },
    { lockfile: { format: ['v13'] } },
    { lockfile: { format: 'v13', unknown: true } },
    { lockfile: { format: 'v13', integrityTarget: 'invalid' } },
    { lockfile: { format: 'v13', includeResolutionSettings: [] } },
  ]

  it.each(invalidSettings)(
    'retains the complete invalid setting %j',
    async pnpm => {
      await writePackageJson({ pnpm: { ...pnpm, saveExact: true } })
      expect(
        (
          await migratePnpmSettings({ cwd: testDir, targetVersion })
        ).warnings.join(),
      ).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(pnpm)
    },
  )

  it.each([
    ...invalidSettings.map(pnpm => ({ version: targetVersion, pnpm })),
    { version: '12.18.0', pnpm: settings },
  ])(
    'rejects incompatible existing settings before writes %j',
    async ({ version, pnpm }) => {
      const yaml = stringify(pnpm)
      await writeWorkspaceYaml(yaml)
      await writeNpmrc('save-exact=true\n')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion: version }),
      ).rejects.toThrow(/lockfile|projectScopedOptionalPeers/u)
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(yaml)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'save-exact=true\n',
      )
    },
  )

  it('preserves workspace-only settings in a subproject npmrc', async () => {
    await writeWorkspaceYaml(
      'packages: [packages/*]\nsharedWorkspaceLockfile: false\n',
    )
    await writeWorkspaceFile('packages/app/package.json', '{"name":"app"}')
    await writeWorkspaceFile('packages/app/.npmrc', `save-exact=true\n${npmrc}`)
    await migratePnpmSettings({ cwd: testDir, targetVersion })
    await expect(readWorkspaceFile('packages/app/.npmrc')).resolves.toBe(npmrc)
    expect((await readWorkspaceYaml()).packageConfigs).toStrictEqual({
      app: { saveExact: true },
    })
  })

  it.each([
    { strategy: 'discard', expected: existing, retained: incoming },
    { strategy: 'merge', expected: existing, retained: incoming },
    {
      strategy: 'overwrite',
      expected: {
        ...incoming,
        lockfile: { ...existing.lockfile, ...incoming.lockfile },
      },
      retained: undefined,
    },
  ] as const)(
    'respects conflicts and cleanup with $strategy',
    async ({ strategy, expected, retained }) => {
      await writeWorkspaceYaml(stringify(existing))
      await writePackageJson({ pnpm: incoming })
      await migratePnpmSettings({ cwd: testDir, targetVersion, strategy })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
      expect(
        (await migratePnpmSettings({ cwd: testDir, targetVersion, strategy }))
          .changedFiles,
      ).toStrictEqual([])
    },
  )
})
