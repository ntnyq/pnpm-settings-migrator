import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../../../src/core'
import { fsExists } from '../../../src/utils/fs'
import { createTestWorkspace } from '../../helpers'

describe('migratePnpmSettings/Yarn resolutions', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('yarn-resolutions')

  it('converts resolutions to overrides when enabled', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { foo: '1.0.0' } },
      resolutions: { bar: '2.0.0' },
    })

    await migratePnpmSettings({ cwd: testDir, yarnResolutions: true })
    const workspace = await readWorkspaceYaml()

    expect(workspace.overrides).toMatchObject({ bar: '2.0.0', foo: '1.0.0' })
  })

  it('does not migrate resolutions when disabled', async () => {
    await writePackageJson({
      name: 'test-workspace',
      resolutions: { bar: '2.0.0' },
    })

    await migratePnpmSettings({ cwd: testDir, yarnResolutions: false })

    const workspaceExists = await fsExists(`${testDir}/pnpm-workspace.yaml`)
    expect(workspaceExists).toBe(false)
  })

  it('handles resolutions cleanup toggles', async () => {
    await writePackageJson({
      name: 'test-workspace',
      resolutions: { bar: '2.0.0' },
    })
    await migratePnpmSettings({
      cleanPackageJson: true,
      cwd: testDir,
      yarnResolutions: true,
    })
    let updated = JSON.parse(await readWorkspaceFile('package.json'))
    expect(updated.resolutions).toBeUndefined()

    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { foo: '1.0.0' } },
      resolutions: { bar: '2.0.0' },
    })
    await migratePnpmSettings({
      cleanPackageJson: true,
      cwd: testDir,
      yarnResolutions: false,
    })
    updated = JSON.parse(await readWorkspaceFile('package.json'))
    expect(updated.resolutions).toStrictEqual({ bar: '2.0.0' })
  })

  it.each([
    ['discard', '1.0.0', true],
    ['merge', '1.0.0', true],
    ['overwrite', '2.0.0', false],
  ] as const)(
    'cleans Yarn resolutions applied by the %s strategy',
    async (strategy, fooVersion, keepsSource) => {
      await writeWorkspaceYaml('overrides:\n  foo: 1.0.0\n')
      await writePackageJson({
        name: 'test-workspace',
        resolutions: { foo: '2.0.0' },
      })

      await migratePnpmSettings({
        compatibility: 'v11',
        cwd: testDir,
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toMatchObject({
        overrides: { foo: fooVersion },
      })
      const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
      expect(Object.hasOwn(packageJson, 'resolutions')).toBe(keepsSource)
    },
  )

  it('retains only Yarn resolutions that conflict with pnpm overrides', async () => {
    await writePackageJson({
      pnpm: { overrides: { foo: '1.0.0' } },
      resolutions: { foo: '2.0.0', bar: '3.0.0' },
    })

    await migratePnpmSettings({ cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      overrides: { foo: '1.0.0', bar: '3.0.0' },
    })
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual({
      resolutions: { foo: '2.0.0' },
    })
  })

  it('translates global Yarn selectors and retains unsupported paths', async () => {
    await writePackageJson({
      resolutions: {
        '**/foo': '1.0.0',
        '**/@scope/bar': '2.0.0',
        'parent/**/child': '3.0.0',
      },
    })

    const result = await migratePnpmSettings({ cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      overrides: { foo: '1.0.0', '@scope/bar': '2.0.0' },
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).resolutions,
    ).toStrictEqual({ 'parent/**/child': '3.0.0' })
    expect(result.warnings.join('\n')).toContain('parent/**/child')
  })

  it('leaves ambiguous translated Yarn selectors in their source', async () => {
    await writePackageJson({ resolutions: { foo: '1.0.0', '**/foo': '2.0.0' } })
    const before = await readWorkspaceFile('package.json')

    const result = await migratePnpmSettings({ cwd: testDir })

    expect(result.changedFiles).toStrictEqual([])
    expect(result.warnings.join('\n')).toContain('foo')
    await expect(readWorkspaceFile('package.json')).resolves.toBe(before)
  })
})
