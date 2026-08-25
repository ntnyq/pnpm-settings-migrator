import { describe, expect, it, vi } from 'vitest'
import { createTestWorkspace } from './helpers'

const writeFailure = vi.hoisted(() => ({ packageJson: false }))

vi.mock(import('../src/utils'), async importOriginal => {
  const actual = await importOriginal<typeof import('../src/utils')>()

  return {
    ...actual,
    fsWriteFile: vi.fn<typeof actual.fsWriteFile>(async (path, content) => {
      if (writeFailure.packageJson && String(path).endsWith('/package.json')) {
        throw Object.assign(new Error('simulated package.json write failure'), {
          code: 'EACCES',
        })
      }

      await actual.fsWriteFile(path, content)
    }),
  }
})

import { migratePnpmSettings } from '../src/core'

describe('migratePnpmSettings/reliability', () => {
  const { readWorkspaceFile, testDir, writeNpmrc, writePackageJson } =
    createTestWorkspace('reliability')

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
