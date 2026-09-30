import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import { createTestWorkspace } from '../../helpers'

describe('pnpm 12.8.2 global shim scope', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('pnpm-12.8')

  it.each([false, { node: 'always', typescript: true }])(
    'retains ignored source globalShims %j at 12.8.2',
    async globalShims => {
      await writePackageJson({
        packageManager: 'pnpm@12.8.2',
        pnpm: { globalShims, saveExact: true },
      })
      await writeNpmrc(
        'global-shims=false\nregistry=https://registry.npmjs.org/\n',
      )
      const result = await migratePnpmSettings({ cwd: testDir })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ globalShims })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'global-shims=false\nregistry=https://registry.npmjs.org/\n',
      )
    },
  )

  it('rejects existing globalShims in 12.8.2 before writing', async () => {
    await writePackageJson({})
    const original = stringify({ globalShims: false })
    await writeWorkspaceYaml(original)
    await expect(
      migratePnpmSettings({ cwd: testDir, targetVersion: '12.8.2' }),
    ).rejects.toThrow('incompatible')
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it('preserves existing globalShims in 12.8.1 without rewriting', async () => {
    await writePackageJson({})
    const original = stringify({ globalShims: false })
    await writeWorkspaceYaml(original)
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.8.1',
    })
    expect(result.changedFiles).toStrictEqual([])
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it('continues migrating globalShims for 12.8.1', async () => {
    await writePackageJson({ pnpm: { globalShims: false } })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.8.1' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      globalShims: false,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })
})
