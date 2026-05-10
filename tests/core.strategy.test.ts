import { describe, expect, it } from 'vitest'
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

    expect(workspace.packages).toEqual(['packages/*'])
    expect(workspace.overrides).toEqual({ bar: '2.0.0', foo: '1.0.0' })
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

    expect(workspace.packages).toEqual(['apps/*'])
    expect(workspace.overrides).toEqual({ bar: '2.0.0', foo: '1.0.0' })
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

    expect(workspace.packages).toEqual(['packages/*', 'common', 'apps/*'])
    expect(workspace.overrides).toEqual({ bar: '2.0.0', foo: '1.0.0' })
    expect(workspace.shamefullyHoist).toBeTruthy()
  })
})
