import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  autoInstallPeersFromHighestMatch: false,
  externalDependencies: ['example'],
}

const versionCases = [
  '11.28.6',
  '11.28.7',
  '11.28.7+build.1',
  '11.28.7-rc.1',
  '^11.28.7',
].map(version => {
  const supported = ['11.28.7', '11.28.7+build.1'].includes(version)
  return {
    version,
    supported,
    expected: { saveExact: true, ...(supported ? settings : {}) },
    retained: supported ? undefined : settings,
  }
})

describe('pnpm 11.28.7 peer and external settings', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('pnpm-11.28.7')

  it.each(versionCases)(
    'gates settings at $version',
    async ({ version, supported, expected, retained }) => {
      await writePackageJson({
        packageManager: `pnpm@${version}`,
        pnpm: { ...settings, saveExact: true },
      })
      const result = await migratePnpmSettings({ cwd: testDir })
      expect(result.warnings.length > 0).toBe(!supported)
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each([
    { autoInstallPeersFromHighestMatch: 'false' },
    { autoInstallPeersFromHighestMatch: [] },
    { externalDependencies: 'example' },
    { externalDependencies: [1] },
    { externalDependencies: {} },
  ])('retains invalid values %j and rejects existing ones', async invalid => {
    await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
    expect(
      (
        await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.7' })
      ).warnings.join(),
    ).toContain('incompatible')
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(invalid)
    const original = stringify(invalid)
    await writeWorkspaceYaml(original)
    await expect(
      migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.7' }),
    ).rejects.toThrow('incompatible')
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it('exports nullable peer and external settings', () => {
    expectTypeOf<{
      autoInstallPeersFromHighestMatch: null
      externalDependencies: null
    }>().toExtend<PnpmWorkspace>()
  })

  it('preserves null and empty arrays', async () => {
    const valid = {
      autoInstallPeersFromHighestMatch: null,
      externalDependencies: [],
    }
    await writePackageJson({ pnpm: valid })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.7' }))
        .warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(valid)
  })
})
