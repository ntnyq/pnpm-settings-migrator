import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../../../src/core'
import { fsExists } from '../../../src/utils/fs'
import { createTestWorkspace } from '../../helpers'

describe('migratePnpmSettings/runtime migration', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('runtime')

  describe.each(['v11', 'v12'] as const)(
    '%s runtime sibling retention',
    compatibility => {
      it.each(['discard', 'merge', 'overwrite'] as const)(
        'retains the complete legacy runtime object with %s',
        async strategy => {
          const executionEnv = { nodeVersion: '22.13.0', custom: 'preserve' }
          await writePackageJson({ pnpm: { executionEnv, saveExact: true } })
          const result = await migratePnpmSettings({
            cwd: testDir,
            compatibility,
            strategy,
          })

          await expect(readWorkspaceYaml()).resolves.toStrictEqual({
            saveExact: true,
          })
          expect(
            JSON.parse(await readWorkspaceFile('package.json')),
          ).toStrictEqual({
            pnpm: { executionEnv },
          })
          expect(result.packageJsonRuntimeChanged).toBe(false)
          expect(result.warnings.join()).toContain('executionEnv')
          await expect(
            migratePnpmSettings({ cwd: testDir, compatibility, strategy }),
          ).resolves.toMatchObject({ changedFiles: [] })
        },
      )

      it('retains an INI runtime section with unmigrated fields', async () => {
        const npmrc = '[execution-env]\nnodeVersion=22.13.0\ncustom=preserve\n'
        await writeNpmrc(npmrc)
        await writePackageJson({ pnpm: { saveExact: true } })
        const result = await migratePnpmSettings({
          cwd: testDir,
          compatibility,
        })
        await expect(readWorkspaceFile('.npmrc')).resolves.toBe(npmrc)
        expect(
          JSON.parse(await readWorkspaceFile('package.json')),
        ).toStrictEqual({})
        expect(result.warnings.join()).toContain('execution-env')
      })

      it('rejects workspace runtime siblings before writing either destination', async () => {
        const workspace =
          'executionEnv:\n  nodeVersion: 22.13.0\n  custom: preserve\n'
        await writeWorkspaceYaml(workspace)
        await writePackageJson({ pnpm: { saveExact: true } })
        const manifest = await readWorkspaceFile('package.json')
        await expect(
          migratePnpmSettings({ cwd: testDir, compatibility }),
        ).rejects.toThrow('executionEnv')
        await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
          workspace,
        )
        await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      })
    },
  )

  it('moves useNodeVersion to package.json devEngines.runtime in v11', async () => {
    await writePackageJson({
      name: 'test-workspace',
      packageManager: 'pnpm@11.0.0',
      pnpm: { useNodeVersion: '22.14.0' },
    })

    await migratePnpmSettings({ cwd: testDir })
    const workspace = await readWorkspaceYaml()
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))

    expect(workspace.useNodeVersion).toBeUndefined()
    expect(packageJson.devEngines.runtime).toStrictEqual({
      name: 'node',
      version: '22.14.0',
    })
    expect(packageJson.pnpm).toBeUndefined()
  })

  it('moves root executionEnv.nodeVersion to devEngines.runtime in v11', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        executionEnv: { nodeVersion: '22.15.0' },
        ignoreDepScripts: true,
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))

    expect(workspace.executionEnv).toBeUndefined()
    expect(workspace.ignoreDepScripts).toBeUndefined()
    expect(packageJson.devEngines.runtime).toStrictEqual({
      name: 'node',
      version: '22.15.0',
    })
    expect(packageJson.pnpm).toStrictEqual({ ignoreDepScripts: true })
  })

  it.each([
    ['discard', '20.0.0', { useNodeVersion: '22.0.0' }],
    ['merge', '20.0.0', { useNodeVersion: '22.0.0' }],
    ['overwrite', '22.0.0', undefined],
  ] as const)(
    'keeps unapplied runtime settings under the %s strategy',
    async (strategy, runtimeVersion, expectedPnpm) => {
      await writeWorkspaceYaml('useNodeVersion: 20.0.0\n')
      await writePackageJson({
        name: 'test-workspace',
        pnpm: { useNodeVersion: '22.0.0' },
      })

      await migratePnpmSettings({
        compatibility: 'v11',
        cwd: testDir,
        strategy,
      })

      const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
      expect(packageJson.devEngines.runtime).toStrictEqual({
        name: 'node',
        version: runtimeVersion,
      })
      expect(packageJson.pnpm).toStrictEqual(expectedPnpm)
    },
  )

  it('keeps unrelated source values unchanged during runtime migration', async () => {
    const pnpm = {
      useNodeVersion: '22.13.0',
      auditConfig: { ignoreCves: ['CVE-original'] },
    }
    await writePackageJson({ pnpm })

    await migratePnpmSettings({
      cwd: testDir,
      compatibility: 'v11',
      cleanPackageJson: false,
    })

    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(pnpm)
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      auditConfig: { ignoreGhsas: ['CVE-original'] },
    })
  })

  it('keeps source runtimes when an existing declaration cannot accept them', async () => {
    await writePackageJson({
      devEngines: { runtime: { name: 'bun', version: '1.2.0' } },
      pnpm: { useNodeVersion: '22.13.0' },
    })
    await writeNpmrc('use-node-version=22.13.0\n')

    const result = await migratePnpmSettings({
      cwd: testDir,
      compatibility: 'v11',
    })

    expect(result.warnings.join('\n')).toContain('devEngines.runtime')
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ useNodeVersion: '22.13.0' })
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'use-node-version=22.13.0\n',
    )
  })

  it.each([
    { name: 'bun', version: '1.2.0' },
    { name: 'node', version: '24.0.0' },
  ])(
    'preserves all files when workspace runtime conflicts with $name',
    async runtime => {
      await writePackageJson({
        devEngines: { runtime },
        pnpm: { saveExact: true },
      })
      await writeWorkspaceYaml('useNodeVersion: 22.13.0\n')
      await writeNpmrc('node-linker=isolated\n')
      const before = await readWorkspaceFile('package.json')

      await expect(
        migratePnpmSettings({ cwd: testDir, compatibility: 'v11' }),
      ).rejects.toThrow('devEngines.runtime')

      await expect(readWorkspaceFile('package.json')).resolves.toBe(before)
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        'useNodeVersion: 22.13.0\n',
      )
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'node-linker=isolated\n',
      )
    },
  )

  it('cleans runtime sources already represented by the same Node declaration', async () => {
    await writePackageJson({
      devEngines: {
        runtime: [
          { name: 'bun', version: '1.2.0' },
          { name: 'node', version: '22.13.0' },
        ],
      },
    })
    await writeWorkspaceYaml('useNodeVersion: 22.13.0\n')
    await writeNpmrc('use-node-version=22.13.0\n')

    const result = await migratePnpmSettings({
      cwd: testDir,
      compatibility: 'v11',
    })

    expect(result.warnings).toStrictEqual([])
    expect(result.packageJsonRuntimeChanged).toBe(false)
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({})
    await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(false)
  })
})
