import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWorkspace } from './helpers'

/**
 * Hoisted failure switch used to verify source retention after a write error.
 */
const writeFailure = vi.hoisted(() => ({
  packageJson: false,
  workspace: false,
  cleanup: false,
}))

vi.mock(import('../src/utils/fs'), async importOriginal => {
  const actual = await importOriginal<typeof import('../src/utils/fs')>()

  return {
    ...actual,
    fsWriteFileIfChanged: vi.fn<typeof actual.fsWriteFileIfChanged>(
      async (path, content) => {
        if (
          String(path).endsWith('/package.json') &&
          (writeFailure.packageJson ||
            (writeFailure.cleanup &&
              !Object.hasOwn(JSON.parse(content), 'pnpm')))
        ) {
          throw Object.assign(
            new Error('simulated package.json write failure'),
            {
              code: 'EACCES',
            },
          )
        }

        if (writeFailure.workspace && path.endsWith('/pnpm-workspace.yaml')) {
          throw new Error('simulated workspace write failure')
        }

        return await actual.fsWriteFileIfChanged(path, content)
      },
    ),
  }
})

import { migratePnpmSettings } from '../src/core'

describe('migratePnpmSettings/reliability', () => {
  const {
    readWorkspaceFile,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('reliability')

  // eslint-disable-next-line vitest/no-hooks -- Reset failure injection between independent cases.
  beforeEach(() => {
    writeFailure.packageJson = false
    writeFailure.workspace = false
    writeFailure.cleanup = false
  })

  it('keeps the workspace runtime when its manifest destination fails', async () => {
    await writePackageJson({})
    await writeWorkspaceYaml('useNodeVersion: 22.13.0\n')
    writeFailure.packageJson = true

    await expect(
      migratePnpmSettings({ cwd: testDir, compatibility: 'v11' }),
    ).rejects.toThrow('simulated package.json write failure')

    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      'useNodeVersion: 22.13.0\n',
    )
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual(
      {},
    )
  })

  it('keeps package settings when the workspace write fails after runtime staging', async () => {
    await writePackageJson({ pnpm: { saveExact: true } })
    await writeWorkspaceYaml('useNodeVersion: 22.13.0\n')
    writeFailure.workspace = true

    await expect(
      migratePnpmSettings({ cwd: testDir, compatibility: 'v11' }),
    ).rejects.toThrow('simulated workspace write failure')

    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual({
      pnpm: { saveExact: true },
      devEngines: { runtime: { name: 'node', version: '22.13.0' } },
    })
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      'useNodeVersion: 22.13.0\n',
    )
  })

  it('can safely retry after final package cleanup fails', async () => {
    await writePackageJson({ pnpm: { saveExact: true } })
    await writeWorkspaceYaml('useNodeVersion: 22.13.0\n')
    writeFailure.cleanup = true

    await expect(
      migratePnpmSettings({ cwd: testDir, compatibility: 'v11' }),
    ).rejects.toThrow('simulated package.json write failure')

    expect(JSON.parse(await readWorkspaceFile('package.json'))).toMatchObject({
      pnpm: { saveExact: true },
      devEngines: { runtime: { version: '22.13.0' } },
    })
    writeFailure.cleanup = false
    await migratePnpmSettings({ cwd: testDir, compatibility: 'v11' })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('keeps .npmrc intact when package.json persistence fails', async () => {
    await writePackageJson({ name: 'test-workspace' })
    await writeNpmrc('use-node-version=22.13.0')
    writeFailure.packageJson = true

    await expect(
      migratePnpmSettings({ compatibility: 'v11', cwd: testDir }),
    ).rejects.toThrow('simulated package.json write failure')

    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'use-node-version=22.13.0',
    )
  })
})
