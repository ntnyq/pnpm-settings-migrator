import consola from 'consola'
import { join } from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import { migratePnpmSettings } from '../../src/core'
import { fsExists } from '../../src/utils/fs'
import { createTestWorkspace } from '../helpers'

describe('migratePnpmSettings/result', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    writeWorkspaceFile,
    readWorkspaceFile,
  } = createTestWorkspace('result')

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'tracks package.json cleanup without a settings diff with %s',
    async strategy => {
      await writeWorkspaceYaml('saveExact: true\n')
      await writePackageJson({ pnpm: { saveExact: true } })
      const result = await migratePnpmSettings({ cwd: testDir, strategy })

      expect(result).toMatchObject({
        changedFiles: [join(testDir, 'package.json')],
        settingsChanges: [],
        sourceSettingsCleaned: true,
        packageJsonRuntimeChanged: false,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')),
      ).not.toHaveProperty('pnpm')
      await expect(
        migratePnpmSettings({ cwd: testDir, strategy }),
      ).resolves.toMatchObject({
        changedFiles: [],
        settingsChanges: [],
        sourceSettingsCleaned: false,
      })
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'reports no changes with cleanup disabled and identical settings with %s',
    async strategy => {
      await writeWorkspaceYaml('saveExact: true\n')
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('save-exact=true\n')
      const before = await readWorkspaceFile('package.json')
      const result = await migratePnpmSettings({
        cwd: testDir,
        strategy,
        cleanPackageJson: false,
        cleanNpmrc: false,
      })
      expect(result).toMatchObject({
        changedFiles: [],
        settingsChanges: [],
        sourceSettingsCleaned: false,
      })
      await expect(readWorkspaceFile('package.json')).resolves.toBe(before)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'save-exact=true\n',
      )
    },
  )

  it.each(['v10', 'v11'] as const)(
    'tracks npmrc cleanup for %s',
    async compatibility => {
      await writeWorkspaceYaml('saveExact: true\n')
      await writeNpmrc('save-exact=true\n')
      const result = await migratePnpmSettings({ cwd: testDir, compatibility })
      expect(result).toMatchObject({
        changedFiles: [join(testDir, '.npmrc')],
        settingsChanges: [],
        sourceSettingsCleaned: true,
      })
      await expect(fsExists(join(testDir, '.npmrc'))).resolves.toBe(
        compatibility === 'v10',
      )
    },
  )

  it('tracks subproject npmrc cleanup with no settings diff', async () => {
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\n\npackageConfigs:\n  app:\n    saveExact: true\n',
    )
    await writeWorkspaceFile('packages/app/package.json', '{"name":"app"}')
    await writeWorkspaceFile('packages/app/.npmrc', 'save-exact=true\n')
    const result = await migratePnpmSettings({
      cwd: testDir,
      compatibility: 'v11',
    })
    expect(result).toMatchObject({
      changedFiles: [join(testDir, 'packages/app/.npmrc')],
      settingsChanges: [],
      sourceSettingsCleaned: true,
    })
    await expect(fsExists(join(testDir, 'packages/app/.npmrc'))).resolves.toBe(
      false,
    )
  })

  it('tracks runtime migration even without workspace changes or cleanup', async () => {
    await writeWorkspaceYaml('{}\n')
    await writePackageJson({ pnpm: { useNodeVersion: '22.19.0' } })
    const result = await migratePnpmSettings({
      cwd: testDir,
      compatibility: 'v11',
      cleanPackageJson: false,
    })
    expect(result).toMatchObject({
      changedFiles: [join(testDir, 'package.json')],
      settingsChanges: [],
      sourceSettingsCleaned: false,
      packageJsonRuntimeChanged: true,
    })
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toMatchObject({
      pnpm: { useNodeVersion: '22.19.0' },
      devEngines: { runtime: { name: 'node', version: '22.19.0' } },
    })
  })

  it('tracks formatting changes independently of settings changes', async () => {
    await writeWorkspaceYaml('saveExact: true\nnodeLinker: hoisted\n')
    await writeNpmrc('save-exact=true\n')
    const result = await migratePnpmSettings({
      cwd: testDir,
      cleanNpmrc: false,
    })
    expect(result).toMatchObject({
      changedFiles: [join(testDir, 'pnpm-workspace.yaml')],
      settingsChanges: [],
      sourceSettingsCleaned: false,
    })
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      'saveExact: true\n\nnodeLinker: hoisted\n',
    )
  })

  it('returns warnings and throws errors without logging from the library', async () => {
    const spies = (
      ['info', 'warn', 'error', 'log', 'success', 'fail'] as const
    ).map(method => vi.spyOn(consola, method).mockImplementation(() => {}))
    try {
      await writePackageJson({ pnpm: { thirdPartySetting: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v11',
      })
      expect(result.warnings).toHaveLength(1)
      expect(result.changedFiles).toStrictEqual([])
      await writeWorkspaceFile('package.json', '{')
      await expect(migratePnpmSettings({ cwd: testDir })).rejects.toThrow(
        /JSON/u,
      )
      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled()
      }
    } finally {
      vi.restoreAllMocks()
    }
  })
})
