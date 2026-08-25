import consola from 'consola'
import { stripAnsi } from 'consola/utils'
import { describe, expect, it, vi } from 'vitest'
import { migratePnpmSettings } from '../src/core'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/strategy', () => {
  const { readWorkspaceYaml, testDir, writePackageJson, writeWorkspaceYaml } =
    createTestWorkspace('strategy')

  it('throws for invalid strategy', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { foo: '1.0.0' } },
    })

    await expect(
      migratePnpmSettings({
        cwd: testDir,
        // @ts-expect-error invalid strategy for runtime validation
        strategy: 'invalid',
      }),
    ).rejects.toThrow(
      'Invalid strategy: invalid. Expected one of: discard, merge, overwrite',
    )
  })

  it('uses discard strategy to keep existing values', async () => {
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\n\noverrides:\n  foo: 1.0.0\n',
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { bar: '2.0.0' }, packages: ['apps/*'] },
    })

    await migratePnpmSettings({ cwd: testDir, strategy: 'discard' })
    const workspace = await readWorkspaceYaml()

    expect(workspace.packages).toStrictEqual(['packages/*'])
    expect(workspace.overrides).toStrictEqual({ bar: '2.0.0', foo: '1.0.0' })
  })

  it('reports only settings changed by the final merge result', async () => {
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\n\noverrides:\n  foo: 1.0.0\n',
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { bar: '2.0.0' }, packages: ['apps/*'] },
    })
    const info = vi.spyOn(consola, 'info').mockImplementation(() => {})
    const log = vi.spyOn(consola, 'log').mockImplementation(() => {})

    await migratePnpmSettings({ cwd: testDir, strategy: 'discard' })

    expect(info).toHaveBeenCalledWith('1 setting changed')
    const messages = log.mock.calls.map(([message]) =>
      stripAnsi(String(message)),
    )
    expect(messages).toStrictEqual([
      '  overrides:',
      '    foo: 1.0.0',
      '+   bar: 2.0.0',
    ])

    info.mockRestore()
    log.mockRestore()
  })

  it('can hide the settings diff', async () => {
    await writeWorkspaceYaml('packages:\n  - packages/*\n')
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { packages: ['apps/*'] },
    })
    const info = vi.spyOn(consola, 'info').mockImplementation(() => {})
    const log = vi.spyOn(consola, 'log').mockImplementation(() => {})

    await migratePnpmSettings({
      cwd: testDir,
      showChanges: false,
      strategy: 'overwrite',
    })

    const messages = info.mock.calls.map(([message]) =>
      stripAnsi(String(message)),
    )
    expect(messages).not.toContain('1 setting changed')
    expect(log).not.toHaveBeenCalled()

    info.mockRestore()
    log.mockRestore()
  })

  it('uses overwrite strategy to prioritize incoming values', async () => {
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\n\noverrides:\n  foo: 1.0.0\n',
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { bar: '2.0.0' }, packages: ['apps/*'] },
    })

    await migratePnpmSettings({ cwd: testDir, strategy: 'overwrite' })
    const workspace = await readWorkspaceYaml()

    expect(workspace.packages).toStrictEqual(['apps/*'])
    expect(workspace.overrides).toStrictEqual({ bar: '2.0.0', foo: '1.0.0' })
  })

  it('uses merge strategy to dedupe arrays and keep existing primitives', async () => {
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\n  - common\n\noverrides:\n  foo: 1.0.0\n\nshamefullyHoist: true\n',
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { bar: '2.0.0' }, packages: ['apps/*', 'common'] },
    })

    await migratePnpmSettings({ cwd: testDir, strategy: 'merge' })
    const workspace = await readWorkspaceYaml()

    expect(workspace.packages).toStrictEqual(['packages/*', 'common', 'apps/*'])
    expect(workspace.overrides).toStrictEqual({ bar: '2.0.0', foo: '1.0.0' })
    expect(workspace.shamefullyHoist).toBe(true)
  })
})
