import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import { createTestWorkspace } from '../../helpers'

describe('pnpm 11.28 patch validation', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('pnpm-11.28-validation')

  const invalidSettings = [
    { targetVersion: '11.28.3', settings: { allowBuilds: false } },
    { targetVersion: '11.28.3', settings: { allowBuilds: [] } },
    { targetVersion: '11.28.3', settings: { allowBuilds: 'yes' } },
    {
      targetVersion: '11.28.3',
      settings: { allowBuilds: { valid: true, invalid: 1 } },
    },
    {
      targetVersion: '11.28.3',
      settings: { allowBuilds: { valid: '>=1', invalid: null } },
    },
    { targetVersion: '11.28.4', settings: { allowUnusedPatches: 'false' } },
    {
      targetVersion: '11.28.4',
      settings: { ignoredOptionalDependencies: 'fsevents' },
    },
    {
      targetVersion: '11.28.4',
      settings: { ignoredOptionalDependencies: ['fsevents', false] },
    },
    { targetVersion: '11.28.4', settings: { requiredScripts: false } },
    {
      targetVersion: '11.28.4',
      settings: { requiredScripts: ['build', {}] },
    },
    { targetVersion: '11.28.5', settings: { httpProxy: false } },
    { targetVersion: '11.28.5', settings: { httpsProxy: null } },
    { targetVersion: '11.28.5', settings: { httpsProxy: ['https://proxy'] } },
  ]

  it.each(invalidSettings)(
    'retains invalid $settings intact at $targetVersion',
    async ({ settings, targetVersion }) => {
      await writePackageJson({ pnpm: { ...settings, saveExact: true } })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(settings)
    },
  )

  it.each(invalidSettings)(
    'rejects existing $settings before writing at $targetVersion',
    async ({ settings, targetVersion }) => {
      await writePackageJson({})
      const original = stringify(settings)
      await writeWorkspaceYaml(original)
      await writeNpmrc('save-exact=true')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-exact=true')
      await expect(readWorkspaceFile('package.json')).resolves.toBe('{}')
    },
  )

  it.each([
    { targetVersion: '11.28.2', settings: { allowBuilds: false } },
    {
      targetVersion: '11.28.3',
      settings: { allowUnusedPatches: 'false', requiredScripts: 'build' },
    },
    { targetVersion: '11.28.4', settings: { httpsProxy: null } },
  ])(
    'preserves the preceding $targetVersion behavior',
    async ({ settings, targetVersion }) => {
      await writePackageJson({ pnpm: settings })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
    },
  )

  it('accepts boolean and string permissions, empty lists, and empty proxies', async () => {
    const settings = {
      allowBuilds: { allowed: true, refused: false, range: '>=1', empty: '' },
      allowUnusedPatches: false,
      ignoredOptionalDependencies: [],
      requiredScripts: [''],
      httpProxy: '',
      httpsProxy: 'https://proxy.example',
    }
    await writePackageJson({ pnpm: settings })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '11.28.5',
    })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('accepts null optional settings as upstream does', async () => {
    const settings = {
      allowBuilds: null,
      allowUnusedPatches: null,
      ignoredOptionalDependencies: null,
      requiredScripts: null,
    }
    await writePackageJson({ pnpm: settings })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '11.28.5',
    })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
  })

  it('normalizes npmrc lists and booleans while preserving invalid values', async () => {
    await writePackageJson({})
    await writeNpmrc(
      'allow-unused-patches=false\nignored-optional-dependencies=fsevents\nrequired-scripts[]=build\nhttp-proxy=false\n',
    )
    await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.5' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      allowUnusedPatches: false,
      ignoredOptionalDependencies: ['fsevents'],
      requiredScripts: ['build'],
    })
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'http-proxy=false\n',
    )
  })

  it('retains invalid legacy patch flags instead of generating an invalid replacement', async () => {
    await writePackageJson({
      pnpm: { allowNonAppliedPatches: 'false', saveExact: true },
    })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '11.28.4',
    })
    expect(result.warnings.join()).toContain('allowNonAppliedPatches')
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ allowNonAppliedPatches: 'false' })
  })
})
