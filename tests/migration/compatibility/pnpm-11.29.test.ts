import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const targetVersion = '11.29.0'
const invalidSettings = {
  localAddress: false,
  minimumReleaseAge: '-10',
  noProxy: ['localhost'],
  sideEffectsCache: { read: true, exclude: [false] },
  strictSsl: 'invalid',
  tasks: { build: null },
}

describe('pnpm 11.29 workspace validation', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-11.29')

  it('retains rejected settings as complete values and migrates unrelated settings', async () => {
    await writePackageJson({ pnpm: { ...invalidSettings, saveExact: true } })
    const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
    for (const key of Object.keys(invalidSettings)) {
      expect(result.warnings.join()).toContain(key)
    }
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(invalidSettings)
  })

  it('preserves v11.28.13 migration for shapes checked at the new boundary', async () => {
    await writePackageJson({ pnpm: invalidSettings })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.13' })
    const { sideEffectsCache, ...otherSettings } = invalidSettings
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(otherSettings)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({
      sideEffectsCache,
    })
  })

  it('accepts a decimal release age and removes only migratable npmrc lines', async () => {
    await writeNpmrc(
      'minimum-release-age=1.5\nno-proxy=false\notp=placeholder\n',
    )
    const settings = {
      localAddress: '127.0.0.1',
      sideEffectsCache: { read: true },
      strictSsl: true,
      tasks: { build: {} },
    }
    await writePackageJson({ pnpm: settings })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion })).warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      ...settings,
      minimumReleaseAge: '1.5',
      noProxy: false,
    })
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe('otp=placeholder\n')
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual(
      {},
    )
  })

  it.each(Object.entries(invalidSettings))(
    'rejects invalid existing %s before writes',
    async (key, value) => {
      const workspace = stringify({ [key]: value })
      await writeWorkspaceYaml(workspace)
      await writeNpmrc('save-exact=true\n')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow(key)
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        workspace,
      )
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'save-exact=true\n',
      )
    },
  )

  it.each(['11.29.0', '12.23.0'])(
    'refuses file OTP values for %s',
    async version => {
      await writePackageJson({ pnpm: { otp: 'placeholder', saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: version,
      })
      expect(result.warnings.join()).toMatch(/project-refused.*"otp"/u)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({
        otp: 'placeholder',
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      await writeWorkspaceYaml('otp: placeholder\n')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion: version }),
      ).rejects.toThrow('refused: "otp"')
    },
  )
})
