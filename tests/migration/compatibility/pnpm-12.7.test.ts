import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const existingSettings = {
  forceIgnoresPlatform: false,
  publishWaitTimeout: 500,
  reporter: 'ndjson',
}

const settings = {
  forceIgnoresPlatform: true,
  publishWaitTimeout: 0,
  reporter: 'silent',
} satisfies PnpmWorkspace

describe('pnpm 12.7 settings', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('pnpm-12.7')

  it('exposes the new public settings', () => {
    expectTypeOf<PnpmWorkspace['forceIgnoresPlatform']>().toEqualTypeOf<
      boolean | undefined
    >()
    expectTypeOf<PnpmWorkspace['publishWaitTimeout']>().toEqualTypeOf<
      number | undefined
    >()
  })

  it.each(['12.7.0', '12.8.0', '12.8.1', '12.8.2', '12.7.0+sha512.abc'])(
    'migrates and cleans manifest settings for %s',
    async targetVersion => {
      await writePackageJson({
        packageManager: `pnpm@${targetVersion}`,
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
    'pnpm@12.6.0',
    'pnpm@12.7.0-rc.1',
    'pnpm@^12.7.0',
    'pnpm@13.0.0',
    undefined,
  ])('retains new settings for older or unconfirmed pin %s', async version => {
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
  })

  it.each([
    {
      targetVersion: '12.6.0',
      expected: {},
      retained:
        'force-ignores-platform=true\npublish-wait-timeout=0\nreporter=silent\n',
    },
    { targetVersion: '12.7.0', expected: settings, retained: '' },
  ])(
    'uses explicit target $targetVersion and cleans only supported npmrc settings',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({ packageManager: 'pnpm@12.6.0' })
      await writeNpmrc(
        'force-ignores-platform=true\npublish-wait-timeout=0\nreporter=silent\nsave-exact=true\nregistry=https://registry.npmjs.org/\n',
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        ...expected,
        saveExact: true,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        `${retained}registry=https://registry.npmjs.org/\n`,
      )
    },
  )

  it.each([
    { forceIgnoresPlatform: 'true' },
    { publishWaitTimeout: -1 },
    { publishWaitTimeout: 1.5 },
    { publishWaitTimeout: '100' },
    { publishWaitTimeout: Number.MAX_SAFE_INTEGER + 1 },
    { reporter: 'verbose' },
    { reporter: false },
    // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
    { userAgent: 'agent/${SECRET}' },
  ])('retains invalid or ignored settings %j', async invalid => {
    await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.7.0',
    })
    expect(result.warnings.join()).toContain('incompatible')
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(invalid)
  })

  it.each(['-1', '1.5', 'invalid', '9007199254740992'])(
    'retains invalid npmrc timeout %s',
    async timeout => {
      await writePackageJson({})
      await writeNpmrc(`publish-wait-timeout=${timeout}\nsave-exact=true`)
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.7.0',
      })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        `publish-wait-timeout=${timeout}\n`,
      )
    },
  )

  it.each([
    'default',
    'append-only',
    'ndjson',
    'silent',
    // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
    '${REPORTER:-silent}',
  ])('preserves accepted reporter %s', async reporter => {
    await writePackageJson({ pnpm: { reporter } })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.7.0' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({ reporter })
  })

  it.each([
    { targetVersion: '12.6.0', workspace: settings },
    { targetVersion: '12.7.0', workspace: { publishWaitTimeout: -1 } },
  ])(
    'validates existing workspaces before writes for $targetVersion',
    async ({ targetVersion, workspace }) => {
      const original = stringify(workspace)
      await writePackageJson({})
      await writeWorkspaceYaml(original)
      await writeNpmrc('save-exact=true')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-exact=true')
    },
  )

  it.each([
    { strategy: 'discard', expected: existingSettings, retained: settings },
    { strategy: 'merge', expected: existingSettings, retained: settings },
    { strategy: 'overwrite', expected: settings, retained: undefined },
  ] as const)(
    'preserves conflicts with $strategy',
    async ({ strategy, expected, retained }) => {
      await writePackageJson({ pnpm: settings })
      await writeWorkspaceYaml(stringify(existingSettings))
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.7.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )
})
