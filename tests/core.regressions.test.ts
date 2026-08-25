import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../src/core'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/regressions', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('regressions')

  it('cleans exact v10 keys without deleting prefix matches', async () => {
    await writeNpmrc('tag-version-prefix=v\nnode-linker=hoisted')

    await migratePnpmSettings({ compatibility: 'v10', cwd: testDir })

    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'tag-version-prefix=v\n',
    )
    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      nodeLinker: 'hoisted',
    })
  })

  it('retains overlapping arrays from package.json and .npmrc', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { hoistPattern: ['*types*'] },
    })
    await writeNpmrc('hoist-pattern[]=*eslint*')

    await migratePnpmSettings({ compatibility: 'v10', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      hoistPattern: ['*types*', '*eslint*'],
    })
    await expect(readWorkspaceFile('.npmrc')).resolves.not.toContain(
      'hoist-pattern',
    )
  })

  it('preserves comments and anchors in unchanged YAML nodes', async () => {
    await writeWorkspaceYaml(
      [
        '# workspace packages',
        'packages:',
        "  - 'packages/*' # package glob",
        'catalog:',
        '  vue: &vue-version ^3.5.0 # shared version',
        '  vue-router: *vue-version',
      ].join('\n'),
    )
    await writePackageJson({
      name: 'test-workspace',
      pnpm: { overrides: { foo: '1.0.0' } },
    })

    await migratePnpmSettings({ cwd: testDir })
    const updated = await readWorkspaceFile('pnpm-workspace.yaml')

    expect(updated).toContain('# workspace packages')
    expect(updated).toContain('# package glob')
    expect(updated).toContain('&vue-version')
    expect(updated).toContain('# shared version')
    expect(updated).toContain('*vue-version')
    expect(updated).toContain('overrides:')
  })

  it('migrates documented v10 settings omitted by the old whitelist', async () => {
    await writeNpmrc(
      [
        'block-exotic-subdeps=true',
        'child-concurrency=3',
        'dangerously-allow-all-builds=false',
        'ignore-scripts=true',
        'minimum-release-age=1440',
        'trust-policy=no-downgrade',
      ].join('\n'),
    )

    await migratePnpmSettings({ compatibility: 'v10', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      blockExoticSubdeps: true,
      childConcurrency: '3',
      dangerouslyAllowAllBuilds: false,
      ignoreScripts: true,
      minimumReleaseAge: '1440',
      trustPolicy: 'no-downgrade',
    })
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe('\n')
  })
})
