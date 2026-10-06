import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src/core'
import { fsExists } from '../../../src/utils/fs'
import { createTestWorkspace } from '../../helpers'

describe('migratePnpmSettings/packageConfigs lockfile mode', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceFile,
    writeWorkspaceYaml,
  } = createTestWorkspace('package-configs-lockfile')

  describe.each(['11.28.5', '12.4.0'])('pnpm %s', targetVersion => {
    describe.each([
      { packageConfigs: { app: { modulesDir: 'vendor' } } },
      { packageConfigs: [{ match: ['app'], modulesDir: 'vendor' }] },
    ])('root manifest form %#', ({ packageConfigs }) => {
      it.each([
        {
          sharedWorkspaceLockfile: false,
          expectedConfig: packageConfigs,
          expectedSource: undefined,
          warnings: 0,
          cleaned: true,
        },
        {
          sharedWorkspaceLockfile: true,
          expectedConfig: undefined,
          expectedSource: { packageConfigs },
          warnings: 1,
          cleaned: false,
        },
        {
          sharedWorkspaceLockfile: undefined,
          expectedConfig: undefined,
          expectedSource: { packageConfigs },
          warnings: 1,
          cleaned: false,
        },
      ])(
        'checks sharedWorkspaceLockfile=$sharedWorkspaceLockfile before pruning the source',
        async ({
          sharedWorkspaceLockfile,
          expectedConfig,
          expectedSource,
          warnings,
          cleaned,
        }) => {
          await writePackageJson({ pnpm: { packageConfigs } })
          await writeWorkspaceYaml(stringify({ sharedWorkspaceLockfile }))

          const result = await migratePnpmSettings({
            cwd: testDir,
            targetVersion,
          })

          const workspace = await readWorkspaceYaml()
          expect(workspace.packageConfigs).toStrictEqual(expectedConfig)
          expect(
            JSON.parse(await readWorkspaceFile('package.json')).pnpm,
          ).toStrictEqual(expectedSource)
          expect(result.warnings).toHaveLength(warnings)
          expect(result.sourceSettingsCleaned).toBe(cleaned)
        },
      )
    })

    it('keeps root npmrc packageConfigs when lockfiles are shared', async () => {
      const original = '[package-configs.app]\nmodulesDir=vendor\n'
      await writeNpmrc(original)

      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion,
      })

      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(original)
      await expect(fsExists(`${testDir}/pnpm-workspace.yaml`)).resolves.toBe(
        false,
      )
      expect(result.changedFiles).toStrictEqual([])
      expect(result.warnings.join()).toContain(
        `Kept packageConfigs in .npmrc: pnpm ${targetVersion} requires sharedWorkspaceLockfile: false`,
      )
    })

    it('keeps project npmrc settings with the default shared lockfile', async () => {
      await writeWorkspaceYaml('packages: [packages/*]\n')
      await writeWorkspaceFile(
        'packages/app/package.json',
        JSON.stringify({ name: 'app' }),
      )
      await writeWorkspaceFile('packages/app/.npmrc', 'modules-dir=vendor\n')

      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        packages: ['packages/*'],
      })
      await expect(readWorkspaceFile('packages/app/.npmrc')).resolves.toBe(
        'modules-dir=vendor\n',
      )
      expect(result.changedFiles).toStrictEqual([])
      expect(result.warnings.join()).toContain(
        'requires sharedWorkspaceLockfile: false',
      )
    })

    const packageConfigs = { root: { saveExact: true } }

    it.each([
      {
        strategy: 'discard',
        shared: true,
        expectedConfig: undefined,
        expectedSource: { packageConfigs, sharedWorkspaceLockfile: false },
        expectedNpmrc: 'modules-dir=vendor\n',
        npmrcExists: true,
        warnings: 2,
      },
      {
        strategy: 'merge',
        shared: true,
        expectedConfig: undefined,
        expectedSource: { packageConfigs, sharedWorkspaceLockfile: false },
        expectedNpmrc: 'modules-dir=vendor\n',
        npmrcExists: true,
        warnings: 2,
      },
      {
        strategy: 'overwrite',
        shared: false,
        expectedConfig: { ...packageConfigs, app: { modulesDir: 'vendor' } },
        expectedSource: undefined,
        expectedNpmrc: undefined,
        npmrcExists: false,
        warnings: 0,
      },
    ] as const)(
      'checks the merged lockfile mode for root and project sources with $strategy',
      async ({
        strategy,
        shared,
        expectedConfig,
        expectedSource,
        expectedNpmrc,
        npmrcExists,
        warnings,
      }) => {
        await writePackageJson({
          pnpm: { packageConfigs, sharedWorkspaceLockfile: false },
        })
        await writeWorkspaceYaml(
          'packages: [packages/*]\nsharedWorkspaceLockfile: true\n',
        )
        await writeWorkspaceFile(
          'packages/app/package.json',
          JSON.stringify({ name: 'app' }),
        )
        await writeWorkspaceFile('packages/app/.npmrc', 'modules-dir=vendor\n')

        const result = await migratePnpmSettings({
          cwd: testDir,
          targetVersion,
          strategy,
        })

        const workspace = await readWorkspaceYaml()
        const remaining = JSON.parse(
          await readWorkspaceFile('package.json'),
        ).pnpm
        expect(workspace.sharedWorkspaceLockfile).toBe(shared)
        expect(workspace.packageConfigs).toStrictEqual(expectedConfig)
        expect(remaining).toStrictEqual(expectedSource)
        await expect(fsExists(`${testDir}/packages/app/.npmrc`)).resolves.toBe(
          npmrcExists,
        )
        await expect(
          readWorkspaceFile('packages/app/.npmrc').catch(() => undefined),
        ).resolves.toBe(expectedNpmrc)
        expect(result.warnings).toHaveLength(warnings)
      },
    )

    it('rejects existing packageConfigs until the merged mode is compatible', async () => {
      const original = 'packageConfigs:\n  app:\n    modulesDir: vendor\n'
      await writeWorkspaceYaml(original)

      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('requires sharedWorkspaceLockfile: false')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )

      await writeNpmrc('shared-workspace-lockfile=false\n')
      await migratePnpmSettings({ cwd: testDir, targetVersion })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        packageConfigs: { app: { modulesDir: 'vendor' } },
        sharedWorkspaceLockfile: false,
      })
      await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(false)
    })
  })
})
