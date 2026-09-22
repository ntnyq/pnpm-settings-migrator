import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../../../src'
import { createTestWorkspace } from '../../helpers'

describe('target version migration behavior', () => {
  const {
    testDir,
    readWorkspaceYaml,
    readWorkspaceFile,
    writePackageJson,
    writeNpmrc,
  } = createTestWorkspace('target-version')

  it.each(['12.4.0', '12.5.0', '12.6.0'])(
    'migrates supported fields targeting %s without changing packageManager',
    async targetVersion => {
      await writePackageJson({
        packageManager: 'pnpm@10.34.5',
        pnpm: { pipelines: { ci: ['test'] } },
      })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        pipelines: { ci: ['test'] },
      })
      const manifest = JSON.parse(await readWorkspaceFile('package.json'))
      expect(manifest.packageManager).toBe('pnpm@10.34.5')
      expect(manifest.pnpm).toBeUndefined()
    },
  )

  it('uses the detected minor with compatibility v12', async () => {
    await writePackageJson({
      packageManager: 'pnpm@12.4.0',
      pnpm: { pipelineBase: 'main' },
    })
    await migratePnpmSettings({ cwd: testDir, compatibility: 'v12' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      pipelineBase: 'main',
    })
  })

  it('honors an explicit older version despite a newer packageManager', async () => {
    const pnpm = { pipelineBase: 'main' }
    await writePackageJson({ packageManager: 'pnpm@12.4.0', pnpm })
    await writeNpmrc('node-linker=isolated')
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.3.4',
    })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      nodeLinker: 'isolated',
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(pnpm)
    expect(result.warnings.join()).toContain('pnpm 12.3.4')
  })

  it('rejects conflicts before reading or writing configuration files', async () => {
    await writePackageJson({ pnpm: { pipelineBase: 'main' } })
    await writeNpmrc('node-linker=isolated')
    const original = await readWorkspaceFile('package.json')
    await expect(
      migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v11',
        targetVersion: '12.4.0',
      }),
    ).rejects.toThrow('conflicts with compatibility')
    await expect(readWorkspaceFile('package.json')).resolves.toBe(original)
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'node-linker=isolated',
    )
  })
})
