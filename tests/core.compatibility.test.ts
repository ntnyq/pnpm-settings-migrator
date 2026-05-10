import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../src/core'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/compatibility', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
  } = createTestWorkspace('compatibility')

  it('migrates non auth/registry .npmrc settings in v11', async () => {
    await writeNpmrc(
      [
        'node-linker=hoisted',
        'save-exact=true',
        'registry=https://registry.npmjs.org/',
        '//registry.npmjs.org/:_authToken=' + '$' + '{NPM_TOKEN}',
      ].join('\n'),
    )

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace).toMatchObject({ nodeLinker: 'hoisted', saveExact: true })
    expect(workspace.registry).toBeUndefined()
  })

  it('keeps auth/registry lines in .npmrc and cleans migrated lines in v11', async () => {
    await writeNpmrc(
      [
        'node-linker=hoisted',
        'save-exact=true',
        'registry=https://registry.npmjs.org/',
        '@my-org:registry=https://registry.example.com/',
        '//registry.npmjs.org/:_authToken=' + '$' + '{NPM_TOKEN}',
      ].join('\n'),
    )

    await migratePnpmSettings({
      cleanNpmrc: true,
      compatibility: 'v11',
      cwd: testDir,
    })
    const updatedNpmrc = await readWorkspaceFile('.npmrc')

    expect(updatedNpmrc).not.toContain('node-linker=')
    expect(updatedNpmrc).not.toContain('save-exact=')
    expect(updatedNpmrc).toContain('registry=https://registry.npmjs.org/')
    expect(updatedNpmrc).toContain(
      '@my-org:registry=https://registry.example.com/',
    )
    expect(updatedNpmrc).toContain(
      '//registry.npmjs.org/:_authToken=' + '$' + '{NPM_TOKEN}',
    )
  })

  it('only removes keys that were migrated when cleaning .npmrc in v11', async () => {
    await writeNpmrc(
      [
        'node-linker=hoisted',
        'save-exact=true',
        'registry=https://registry.npmjs.org/',
        '# keep comments',
        'broken-line-without-equals',
      ].join('\n'),
    )

    await migratePnpmSettings({
      cleanNpmrc: true,
      compatibility: 'v11',
      cwd: testDir,
    })
    const updatedNpmrc = await readWorkspaceFile('.npmrc')

    expect(updatedNpmrc).toContain('registry=https://registry.npmjs.org/')
    expect(updatedNpmrc).toContain('# keep comments')
    expect(updatedNpmrc).toContain('broken-line-without-equals')
    expect(updatedNpmrc).not.toContain('node-linker=hoisted')
    expect(updatedNpmrc).not.toContain('save-exact=true')
  })

  it('keeps legacy npmrc whitelist behavior in v10 mode', async () => {
    await writeNpmrc(
      'node-linker=hoisted\nignored-optional-dependencies[]=fsevents',
    )

    await migratePnpmSettings({ compatibility: 'v10', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.ignoredOptionalDependencies).toEqual(['fsevents'])
    expect(workspace.nodeLinker).toBeUndefined()
  })

  it('normalizes legacy build settings to allowBuilds in v11', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        ignoredBuiltDependencies: ['core-js'],
        neverBuiltDependencies: ['fsevents'],
        onlyBuiltDependencies: ['esbuild'],
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.allowBuilds).toEqual({
      'core-js': false,
      esbuild: true,
      fsevents: false,
    })
  })

  it('renames allowNonAppliedPatches to allowUnusedPatches in v11', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        allowNonAppliedPatches: true,
        ignorePatchFailures: true,
      },
    })

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.allowUnusedPatches).toBe(true)
    expect(workspace.ignorePatchFailures).toBeUndefined()
  })

  it('auto-detects v11 from packageManager', async () => {
    await writePackageJson({
      name: 'test-workspace',
      packageManager: 'pnpm@11.0.0',
      pnpm: { onlyBuiltDependencies: ['esbuild'] },
    })

    await migratePnpmSettings({ cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.allowBuilds).toEqual({ esbuild: true })
  })

  it('auto mode defaults to v10 behavior when packageManager is missing', async () => {
    await writeNpmrc(
      'node-linker=hoisted\nignored-optional-dependencies[]=fsevents',
    )

    await migratePnpmSettings({ compatibility: 'auto', cwd: testDir })
    const workspace = await readWorkspaceYaml()

    expect(workspace.ignoredOptionalDependencies).toEqual(['fsevents'])
    expect(workspace.nodeLinker).toBeUndefined()
  })
})
