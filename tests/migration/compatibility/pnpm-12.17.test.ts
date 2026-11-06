import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const releaseSettings = {
  gitTagVersion: false,
  publishBranch: 'release',
} satisfies PnpmWorkspace
const overrides = {
  'foo:prod': 'npm:replacement@1',
  '@scope/*:optional': '-',
  'parent-*@>=1>@scope/child@^2:peer': '2 || 3',
  'foo@*': 'link:./foo',
}
const settings = { ...releaseSettings, overrides }
const targetVersion = '12.17.0'
const preceding = '12.16.1'
const npmrc = 'git-tag-version=false\npublish-branch=release\n'
const registry = 'registry=https://registry.npmjs.org/\n'

describe('pnpm 12.17 workspace settings and overrides', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    writeWorkspaceFile,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.17')

  it.each([
    { packageManager: 'pnpm@12.17.0' },
    {
      devEngines: {
        packageManager: { name: 'pnpm', version: '12.17.0+build.1' },
      },
    },
  ])(
    'infers the release and preserves its declaration %j',
    async declaration => {
      await writePackageJson({ ...declaration, pnpm: settings })
      expect(
        (await migratePnpmSettings({ cwd: testDir })).warnings,
      ).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
      expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual(
        declaration,
      )
    },
  )

  it.each([
    'pnpm@12.16.1',
    'pnpm@^12.17.0',
    'pnpm@12.17.0-rc.1',
    'pnpm@13.0.0',
    undefined,
  ])(
    'retains the complete settings for an older or unconfirmed v12 target %s',
    async packageManager => {
      await writePackageJson({
        packageManager,
        pnpm: { ...settings, saveExact: true },
      })
      expect(
        (
          await migratePnpmSettings({ cwd: testDir, compatibility: 'v12' })
        ).warnings.join(),
      ).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(settings)
    },
  )

  it.each([
    {
      version: targetVersion,
      pin: preceding,
      migrated: releaseSettings,
      retained: registry,
    },
    {
      version: preceding,
      pin: targetVersion,
      migrated: {},
      retained: npmrc + registry,
    },
    {
      version: '11.28.10',
      pin: targetVersion,
      migrated: releaseSettings,
      retained: registry,
    },
  ])(
    'migrates root npmrc values for the explicit $version target',
    async ({ version, pin, migrated, retained }) => {
      await writeNpmrc(`${npmrc}save-exact=true\n${registry}`)
      await writePackageJson({ packageManager: `pnpm@${pin}` })
      await migratePnpmSettings({ cwd: testDir, targetVersion: version })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
        ...migrated,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(retained)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).packageManager,
      ).toBe(`pnpm@${pin}`)
    },
  )

  it.each([
    { gitTagVersion: null, publishBranch: null },
    { gitTagVersion: true, publishBranch: '' },
    { publishBranch: '$' + '{RELEASE_BRANCH}' },
  ])('preserves explicit release settings %j', async pnpm => {
    await writePackageJson({ pnpm })
    await migratePnpmSettings({ cwd: testDir, targetVersion })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(pnpm)
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual(
      {},
    )
  })

  const invalid = [
    { gitTagVersion: 'false' },
    { publishBranch: false },
    ...[
      'lib:dev',
      'lib@1:unknown',
      'lib:peer>child',
      'lib@1:peer>child',
      'lib@:peer',
      '*@',
      '@scope/*@',
      'p>@scope/*@',
      'p>dep@:prod',
      'bad/name*:optional',
      'lib:peer:prod',
      'lib@link:./local',
      'p@workspace:*>child',
    ].map(selector => ({ overrides: { valid: '1.0.0', [selector]: '-' } })),
    { overrides: { 'lib:prod': '1.0.0', sibling: ['2.0.0'] } },
  ]

  it.each(invalid)(
    'retains the entire invalid source setting %j',
    async pnpm => {
      await writePackageJson({ pnpm: { ...pnpm, saveExact: true } })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(pnpm)
    },
  )

  it.each([preceding, '11.28.10', '10.34.9'])(
    'distinguishes package name globs from existing range and protocol selectors at %s',
    async version => {
      await writePackageJson({
        pnpm: { overrides: { 'parent-*>dep': '2.0.0', foo: '1.0.0' } },
      })
      await writeNpmrc(
        '[overrides]\nfoo@*=1.0.0\nparent@*>bar@*=2.0.0\nfoo@link:./local=file:./other\nfoo@npm:peer=npm:other\n',
      )
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: version,
      })
      expect(result.warnings.join()).toContain('overrides')
      expect((await readWorkspaceYaml()).overrides).toStrictEqual({
        'foo@*': '1.0.0',
        'parent@*>bar@*': '2.0.0',
        'foo@link:./local': 'file:./other',
        'foo@npm:peer': 'npm:other',
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm.overrides,
      ).toStrictEqual({
        'parent-*>dep': '2.0.0',
        foo: '1.0.0',
      })
    },
  )

  it.each([preceding, '11.28.10', '10.34.9'])(
    'preserves unsupported npmrc overrides at %s',
    async version => {
      const section = '[overrides]\n# keep siblings\nlib-*=1.0.0\nvalid=2.0.0\n'
      await writeNpmrc(`save-exact=true\n${section}`)
      expect(
        (
          await migratePnpmSettings({ cwd: testDir, targetVersion: version })
        ).warnings.join(),
      ).toContain('overrides')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(section)
    },
  )

  it.each([
    ['pnpm@^12.16.1', 'pkg@link:./old'],
    ['pnpm@12.17.0-rc.1', 'pkg@npm:peer'],
    ['pnpm@13.0.0', 'pkg@link:./old'],
    [undefined, 'pkg@npm:peer'],
  ] as const)(
    'migrates only shared override syntax for an unconfirmed v12 target %s',
    async (packageManager, selector) => {
      const pnpm = { overrides: { [selector]: 'link:./new' } }
      await writePackageJson({ packageManager, pnpm })
      await writeNpmrc('[overrides]\nother@*=link:./new\n')
      const result = await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v12',
      })
      expect(result.warnings.join()).toContain('overrides')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        overrides: { 'other@*': 'link:./new' },
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(pnpm)
    },
  )

  it.each([
    { version: preceding, pnpm: settings },
    { version: targetVersion, pnpm: { publishBranch: [] } },
    { version: targetVersion, pnpm: { overrides: { 'pkg:dev': '-' } } },
    { version: '10.34.9', pnpm: { overrides: { 'p*>dep': '-' } } },
  ])(
    'rejects incompatible existing settings before writes at $version',
    async ({ version, pnpm }) => {
      const yaml = stringify(pnpm)
      await writeWorkspaceYaml(yaml)
      await writeNpmrc('save-exact=true\n')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion: version }),
      ).rejects.toThrow(/overrides|publishBranch/u)
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(yaml)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'save-exact=true\n',
      )
    },
  )

  it.each([
    { app: { overrides, savePrefix: '~' } },
    [{ match: ['app'], overrides, savePrefix: '~' }],
  ])(
    'checks overrides in both packageConfigs forms before cleanup',
    async packageConfigs => {
      await writeWorkspaceYaml('sharedWorkspaceLockfile: false\n')
      await writePackageJson({ pnpm: { packageConfigs } })
      expect(
        (
          await migratePnpmSettings({ cwd: testDir, targetVersion: preceding })
        ).warnings.join(),
      ).toContain('packageConfigs')
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({
        packageConfigs,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        sharedWorkspaceLockfile: false,
      })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect((await readWorkspaceYaml()).packageConfigs).toStrictEqual(
        packageConfigs,
      )
      expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual(
        {},
      )
    },
  )

  it('retains a subproject override section until the selected version can apply it', async () => {
    const ini = '[overrides]\nfoo:optional=-\n'
    await writeWorkspaceYaml(
      'packages: [packages/*]\nsharedWorkspaceLockfile: false\n',
    )
    await writeWorkspaceFile('packages/app/package.json', '{"name":"app"}')
    await writeWorkspaceFile('packages/app/.npmrc', ini)
    expect(
      (
        await migratePnpmSettings({ cwd: testDir, targetVersion: preceding })
      ).warnings.join(),
    ).toContain('overrides')
    await expect(readWorkspaceFile('packages/app/.npmrc')).resolves.toBe(ini)
    expect((await readWorkspaceYaml()).packageConfigs).toBeUndefined()
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion })).warnings,
    ).toStrictEqual([])
    expect((await readWorkspaceYaml()).packageConfigs).toStrictEqual({
      app: { overrides: { 'foo:optional': '-' } },
    })
  })

  const existing = { 'lib-*': '1.0.0', '*-core': '2.0.0' }
  const incoming = { '*-core': '2.0.0', 'lib-*': '1.0.0' }

  it('keeps release settings out of subproject configuration', async () => {
    await writeWorkspaceYaml(
      'packages: [packages/*]\nsharedWorkspaceLockfile: false\n',
    )
    await writeWorkspaceFile('packages/app/package.json', '{"name":"app"}')
    await writeWorkspaceFile('packages/app/.npmrc', `${npmrc}save-exact=true\n`)
    const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(result.warnings.join()).toContain('Kept subproject settings')
    await expect(readWorkspaceFile('packages/app/.npmrc')).resolves.toBe(npmrc)
    expect((await readWorkspaceYaml()).packageConfigs).toStrictEqual({
      app: { saveExact: true },
    })
  })

  it('preserves deprecated peer and optional policies alongside explicit overrides', async () => {
    const pnpm = {
      ignoredOptionalDependencies: ['old-optional'],
      peerDependencyRules: { ignoreMissing: ['old-peer'] },
      overrides,
    }
    await writePackageJson({ pnpm })
    await migratePnpmSettings({
      cwd: testDir,
      targetVersion,
      replaceDeprecated: true,
    })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(pnpm)
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual(
      {},
    )
  })

  it('appends Yarn translations after the original pnpm selectors', async () => {
    const pnpm = { overrides: { 'lib@*': '1.0.0', lib: '2.0.0' } }
    await writePackageJson({
      pnpm,
      resolutions: { lib: '3.0.0', extra: '4.0.0' },
    })
    await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(Object.entries((await readWorkspaceYaml()).overrides)).toStrictEqual(
      [
        ['lib@*', '1.0.0'],
        ['lib', '2.0.0'],
        ['extra', '4.0.0'],
      ],
    )
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual({
      resolutions: { lib: '3.0.0' },
    })
  })

  it('retains conflicting and invalid Yarn entries alongside an incompatible pnpm map', async () => {
    const pnpm = { overrides: { good: '1.0.0', 'lib:dev': '-' } }
    await writePackageJson({
      pnpm,
      resolutions: {
        '**/good': '2.0.0',
        'favicon.ico': '1.0.0',
        extra: '3.0.0',
      },
    })
    const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(result.warnings.join()).toContain(
      'explicit pnpm override was retained',
    )
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      overrides: { extra: '3.0.0' },
    })
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual({
      pnpm,
      resolutions: { '**/good': '2.0.0', 'favicon.ico': '1.0.0' },
    })
  })

  it.each([
    'overrides: &rules\n  lib-*: 1.0.0\n  "*-core": 2.0.0\ncatalog: *rules\n',
    'catalog: &rules\n  lib-*: 1.0.0\n  "*-core": 2.0.0\noverrides: *rules\n',
    'catalog: &rules\n  lib-*: 1.0.0\n  "*-core": 2.0.0\noverrides:\n  <<: *rules\n',
  ])(
    'preserves selector order across YAML aliases when sorting',
    async yaml => {
      await writeWorkspaceYaml(yaml)
      await writePackageJson({ pnpm: { ...releaseSettings } })
      await migratePnpmSettings({ cwd: testDir, targetVersion, sortKeys: true })
      expect(
        Object.entries(
          parse(await readWorkspaceFile('pnpm-workspace.yaml'), { merge: true })
            .overrides,
        ),
      ).toStrictEqual(Object.entries(existing))
    },
  )

  it.each([
    { app: { overrides: { 'lib:dev': '-' } } },
    [{ match: ['app'], overrides: { 'lib@:peer': '-' } }],
  ])(
    'rejects invalid overrides in an included packageConfigs before writes',
    async packageConfigs => {
      const root =
        'sharedWorkspaceLockfile: false\ninclude:\n  ./policy.yaml: [packageConfigs]\n'
      const owner = stringify({ packageConfigs })
      await writeWorkspaceYaml(root)
      await writeWorkspaceFile('policy.yaml', owner)
      await writeNpmrc('git-tag-version=false\n')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('packageConfigs')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(root)
      await expect(readWorkspaceFile('policy.yaml')).resolves.toBe(owner)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'git-tag-version=false\n',
      )
    },
  )

  describe.each([
    { path: 'pnpm-workspace.yaml', root: '{}\n' },
    {
      path: 'config/policy.yaml',
      root: 'include:\n  ./config/policy.yaml: [overrides]\n',
    },
  ])('overrides in $path', ({ path, root }) => {
    it.each([
      {
        strategy: 'discard',
        expected: existing,
        retained: { overrides: incoming },
        changed: false,
      },
      {
        strategy: 'merge',
        expected: existing,
        retained: { overrides: incoming },
        changed: false,
      },
      {
        strategy: 'overwrite',
        expected: incoming,
        retained: undefined,
        changed: true,
      },
    ] as const)(
      'respects equally specific selectors and source cleanup under $strategy',
      async ({ strategy, expected, retained, changed }) => {
        await writeWorkspaceYaml(root)
        await writeWorkspaceFile(path, stringify({ overrides: existing }))
        await writePackageJson({
          pnpm: { overrides: incoming, saveExact: true },
        })
        const result = await migratePnpmSettings({
          cwd: testDir,
          targetVersion,
          strategy,
          sortKeys: true,
        })
        await expect(readWorkspaceFile(path)).resolves.toContain(
          stringify({ overrides: expected }).trim(),
        )
        expect(
          JSON.parse(await readWorkspaceFile('package.json')).pnpm,
        ).toStrictEqual(retained)
        expect(
          result.settingsChanges.some(change => change.key === 'overrides'),
        ).toBe(changed)
        expect(
          (
            await migratePnpmSettings({
              cwd: testDir,
              targetVersion,
              strategy,
              sortKeys: true,
            })
          ).changedFiles,
        ).toStrictEqual([])
      },
    )
  })
})
