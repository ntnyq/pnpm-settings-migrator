import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../src/core'
import { fsExists } from '../src/utils'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/base', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('base')

  it('warns when no .npmrc or package.json exists', async () => {
    await expect(migratePnpmSettings({ cwd: testDir })).resolves.toBeUndefined()
  })

  it('migrates pnpm settings from package.json', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        overrides: { foo: '1.0.0' },
        peerDependencyRules: { ignoreMissing: ['react'] },
      },
    })

    await migratePnpmSettings({ cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace).toMatchObject({
      overrides: { foo: '1.0.0' },
      peerDependencyRules: { ignoreMissing: ['react'] },
    })
  })

  it('migrates pnpm settings from .npmrc', async () => {
    await writeNpmrc(
      'ignored-optional-dependencies[]=fsevents\nignored-optional-dependencies[]=@esbuild/*',
    )

    await migratePnpmSettings({ cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.ignoredOptionalDependencies).toEqual([
      'fsevents',
      '@esbuild/*',
    ])
  })

  it('merges settings from package.json and .npmrc', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { foo: '1.0.0' } },
    })
    await writeNpmrc('ignored-optional-dependencies[]=fsevents')

    await migratePnpmSettings({ cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace).toMatchObject({
      ignoredOptionalDependencies: ['fsevents'],
      overrides: { foo: '1.0.0' },
    })
  })

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
    expect(workspaceExists).toBeFalsy()
  })

  it('preserves existing pnpm-workspace.yaml data', async () => {
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\ncatalog:\n  vue: ^3.0.0\n',
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { foo: '1.0.0' } },
    })

    await migratePnpmSettings({ cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace).toMatchObject({
      catalog: { vue: '^3.0.0' },
      overrides: { foo: '1.0.0' },
      packages: ['packages/*'],
    })
  })

  it('cleans package.json when cleanPackageJson is true', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { foo: '1.0.0' } },
      version: '1.0.0',
    })

    await migratePnpmSettings({ cleanPackageJson: true, cwd: testDir })
    const updated = JSON.parse(await readWorkspaceFile('package.json'))

    expect(updated).toMatchObject({ name: 'test-workspace', version: '1.0.0' })
    expect(updated.pnpm).toBeUndefined()
  })

  it('does not clean package.json when cleanPackageJson is false', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { foo: '1.0.0' } },
    })

    await migratePnpmSettings({ cleanPackageJson: false, cwd: testDir })
    const updated = JSON.parse(await readWorkspaceFile('package.json'))

    expect(updated.pnpm).toEqual({ overrides: { foo: '1.0.0' } })
  })

  it('cleans pnpm keys from .npmrc when cleanNpmrc is true', async () => {
    await writeNpmrc(
      'ignored-optional-dependencies[]=fsevents\nregistry=https://registry.npmjs.org/',
    )

    await migratePnpmSettings({ cleanNpmrc: true, cwd: testDir })
    const updated = await readWorkspaceFile('.npmrc')

    expect(updated).not.toContain('ignored-optional-dependencies')
    expect(updated).toContain('registry=https://registry.npmjs.org/')
  })

  it('does not clean .npmrc when cleanNpmrc is false', async () => {
    await writeNpmrc(
      'ignored-optional-dependencies[]=fsevents\nregistry=https://registry.npmjs.org/',
    )

    await migratePnpmSettings({ cleanNpmrc: false, cwd: testDir })
    const updated = await readWorkspaceFile('.npmrc')

    expect(updated).toContain('ignored-optional-dependencies[]=fsevents')
  })

  it('preserves indentation from package.json', async () => {
    await writePackageJson(
      { name: 'test-workspace', pnpm: { overrides: { foo: '1.0.0' } } },
      4,
    )

    await migratePnpmSettings({ cleanPackageJson: true, cwd: testDir })
    const updated = await readWorkspaceFile('package.json')

    expect(updated).toContain('    "name": "test-workspace"')
  })

  it('supports newlineBetween true/false', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        overrides: { foo: '1.0.0' },
        peerDependencyRules: { ignoreMissing: ['react'] },
      },
    })

    await migratePnpmSettings({
      cleanPackageJson: false,
      cwd: testDir,
      newlineBetween: true,
    })
    const withBreaks = await readWorkspaceFile('pnpm-workspace.yaml')
    expect(withBreaks).toContain('\n\npeerDependencyRules:')

    await migratePnpmSettings({
      cleanPackageJson: false,
      cwd: testDir,
      newlineBetween: false,
    })
    const withoutBreaks = await readWorkspaceFile('pnpm-workspace.yaml')
    expect(withoutBreaks).not.toContain('\n\npeerDependencyRules:')
  })

  it('warns when no migratable settings exist', async () => {
    await writePackageJson({ name: 'test-workspace', version: '1.0.0' })
    await writeNpmrc('registry=https://registry.npmjs.org/')

    await expect(migratePnpmSettings({ cwd: testDir })).resolves.toBeUndefined()

    const workspaceExists = await fsExists(`${testDir}/pnpm-workspace.yaml`)
    expect(workspaceExists).toBeFalsy()
  })

  it('removes empty overrides object', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        overrides: {},
        peerDependencyRules: { ignoreMissing: ['react'] },
      },
    })

    await migratePnpmSettings({ cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.overrides).toBeUndefined()
    expect(workspace.peerDependencyRules).toEqual({ ignoreMissing: ['react'] })
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
    expect(updated.resolutions).toEqual({ bar: '2.0.0' })
  })
})
