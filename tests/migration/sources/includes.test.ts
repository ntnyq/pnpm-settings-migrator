import { link, symlink } from 'node:fs/promises'
import { join } from 'pathe'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmIncludeSettings, PnpmWorkspace } from '../../../src'
import * as fsUtils from '../../../src/utils/fs'
import { createTestWorkspace } from '../../helpers'

const strategyCases = [
  {
    strategy: 'discard',
    expected: ['old'],
    retained: { hoistPattern: ['new'] },
  },
  { strategy: 'merge', expected: ['old', 'new'], retained: undefined },
  { strategy: 'overwrite', expected: ['new'], retained: undefined },
] as const

const fileAliasCases = [
  { kind: 'symlink', createLink: symlink },
  { kind: 'hardlink', createLink: link },
] as const

const invalidIncludes = [
  null,
  true,
  [],
  { './config.json': ['saveExact'] },
  { './*.yaml': '*' },
  { '/absolute.yaml': '*' },
  { 'https://example.com/policy.yaml': '*' },
  { policy: '*' },
  { policy: ['packages'] },
  { policy: ['bootConfig'] },
  { './a.yaml': ['include'] },
  { './a.yaml': ['missing'] },
  { './a.yaml': ['catalogs.'] },
  { './a.yaml': ['saveExact', 'saveExact'] },
  { './a.yaml': ['nodePackageMap', 'nodePackageMapType'] },
]

const readonlyCases = (['discard', 'merge', 'overwrite'] as const).flatMap(
  strategy => [
    { strategy, value: true, retained: undefined, warning: false },
    { strategy, value: false, retained: { saveExact: false }, warning: true },
  ],
)

const incompatiblePinCases = [
  '10.34.7',
  '11.28.7',
  '12.14.0',
  '12.15.0-rc.1',
  '^12.15.0',
  '13.0.0',
  undefined,
].map(version => ({ version, packageManager: version && `pnpm@${version}` }))

describe('include ownership migration', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    writeWorkspaceFile,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('workspace-includes')
  const targetVersion = '12.15.0'

  /**
   * Install a read-only config dependency fixture without invoking package code.
   *
   * @param settings - YAML settings supplied by the installed package
   * @returns A promise resolved after its manifest and entry are written
   */
  async function writePolicy(settings: unknown): Promise<void> {
    await writeWorkspaceFile(
      'node_modules/.pnpm-config/@acme/policy/package.json',
      JSON.stringify({
        name: '@acme/policy',
        version: '1.0.0',
        pnpm: { config: 'config.yaml' },
      }),
    )
    await writeWorkspaceFile(
      'node_modules/.pnpm-config/@acme/policy/config.yaml',
      stringify(settings),
    )
  }

  it('exports the include declaration type', () => {
    expectTypeOf<PnpmIncludeSettings>().toExtend<PnpmWorkspace['include']>()
  })

  it('writes reserved absent values to their local owner and preserves root bytes', async () => {
    const root =
      '# root stays intact\ninclude:\n  ./config/policy.yaml: [saveExact]\n'
    await writeWorkspaceYaml(root)
    await writeWorkspaceFile('config/policy.yaml', '# local policy\n{}\n')
    await writePackageJson({ pnpm: { saveExact: true } })
    const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(root)
    expect(parse(await readWorkspaceFile('config/policy.yaml'))).toStrictEqual({
      saveExact: true,
    })
    await expect(readWorkspaceFile('config/policy.yaml')).resolves.toContain(
      '# local policy',
    )
    expect(result.changedFiles).toContain(join(testDir, 'config/policy.yaml'))
    expect(result.changedFiles).not.toContain(
      join(testDir, 'pnpm-workspace.yaml'),
    )
    expect(result.settingsChanges).toStrictEqual([
      { key: 'saveExact', before: undefined, after: true },
    ])
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion })).changedFiles,
    ).toStrictEqual([])
  })

  it.each(strategyCases)(
    'applies $strategy inside the local owner',
    async ({ strategy, expected, retained }) => {
      await writeWorkspaceYaml(
        stringify({ include: { './policy.yml': ['hoistPattern'] } }),
      )
      await writeWorkspaceFile('policy.yml', '# pattern\nhoistPattern: [old]\n')
      await writePackageJson({ pnpm: { hoistPattern: ['new'] } })
      await migratePnpmSettings({ cwd: testDir, targetVersion, strategy })
      expect(parse(await readWorkspaceFile('policy.yml'))).toStrictEqual({
        hoistPattern: expected,
      })
      await expect(readWorkspaceFile('policy.yml')).resolves.toContain(
        '# pattern',
      )
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        include: { './policy.yml': ['hoistPattern'] },
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it('keeps wildcard ownership limited to fields actually defined in its file', async () => {
    await writeWorkspaceYaml(stringify({ include: { './policy.yaml': '*' } }))
    await writeWorkspaceFile('policy.yaml', 'saveExact: false\n')
    await writePackageJson({ pnpm: { saveExact: true, savePrefix: '~' } })
    await migratePnpmSettings({
      cwd: testDir,
      targetVersion,
      strategy: 'overwrite',
    })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      include: { './policy.yaml': '*' },
      savePrefix: '~',
    })
    expect(parse(await readWorkspaceFile('policy.yaml'))).toStrictEqual({
      saveExact: true,
    })
  })

  it.each([
    {
      strategy: 'discard',
      path: './old_modules',
      source: 'modules-dir=./vendor\n',
    },
    {
      strategy: 'merge',
      path: './old_modules',
      source: 'modules-dir=./vendor\n',
    },
    { strategy: 'overwrite', path: '../vendor', source: undefined },
  ] as const)(
    'cleans npmrc paths only after the local owner applies them with $strategy',
    async ({ strategy, path, source }) => {
      await writeWorkspaceYaml(
        stringify({ include: { './config/layout.yaml': ['modulesDir'] } }),
      )
      await writeWorkspaceFile(
        'config/layout.yaml',
        'modulesDir: ./old_modules\n',
      )
      await writeNpmrc('modules-dir=./vendor\n')
      await migratePnpmSettings({ cwd: testDir, targetVersion, strategy })
      expect(
        parse(await readWorkspaceFile('config/layout.yaml')).modulesDir,
      ).toBe(path)
      await expect(
        readWorkspaceFile('.npmrc').catch(() => undefined),
      ).resolves.toBe(source)
    },
  )

  it('rebases paths, local catalog specifiers, and workspace overrides into the owner', async () => {
    const include = {
      './config/layout.yaml': [
        'modulesDir',
        'pnpmfile',
        'patchedDependencies',
        'packages',
        'catalog',
        'overrides',
        'scriptShell',
      ],
    }
    await writeWorkspaceYaml(stringify({ include }))
    await writeWorkspaceFile(
      'config/layout.yaml',
      'modulesDir: ./old_modules\npnpmfile: ./hook.cjs\n',
    )
    const incoming = {
      modulesDir: './node_modules',
      pnpmfile: ['./.pnpmfile.cjs'],
      packages: ['packages/*', '!packages/excluded'],
      patchedDependencies: { 'foo@1': 'patches/foo.patch' },
      catalog: { foo: 'file:./fixtures/foo', bar: '^1' },
      overrides: {
        foo: 'workspace:./packages/foo',
        bar: 'link:./packages/bar',
      },
      scriptShell: './bin/shell',
    }
    await writePackageJson({ pnpm: incoming })
    await migratePnpmSettings({
      cwd: testDir,
      targetVersion,
      strategy: 'overwrite',
    })
    expect(parse(await readWorkspaceFile('config/layout.yaml'))).toStrictEqual({
      modulesDir: '../node_modules',
      pnpmfile: ['../.pnpmfile.cjs'],
      packages: ['../packages/*', '!../packages/excluded'],
      patchedDependencies: { 'foo@1': '../patches/foo.patch' },
      catalog: { foo: 'file:../fixtures/foo', bar: '^1' },
      overrides: {
        foo: 'workspace:../packages/foo',
        bar: 'link:../packages/bar',
      },
      scriptShell: '../bin/shell',
    })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({ include })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('keeps existing bare local specifiers path-shaped when merging a catalog', async () => {
    await writeWorkspaceYaml(
      stringify({
        include: { './config/catalog.yaml': ['catalog', 'overrides'] },
      }),
    )
    await writeWorkspaceFile(
      'config/catalog.yaml',
      stringify({
        catalog: { foo: '../dependency' },
        overrides: { foo: 'workspace:../dependency' },
      }),
    )
    await writePackageJson({
      pnpm: { catalog: { bar: '^1' }, overrides: { bar: '^1' } },
    })
    await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(parse(await readWorkspaceFile('config/catalog.yaml'))).toStrictEqual(
      {
        catalog: { foo: '../dependency', bar: '^1' },
        overrides: { foo: 'workspace:../dependency', bar: '^1' },
      },
    )
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion })).changedFiles,
    ).toStrictEqual([])
  })

  it('rebases normalized protocol paths and workspace dot paths', async () => {
    await writeWorkspaceYaml(
      stringify({
        include: { './config/catalog.yaml': ['catalog', 'overrides'] },
      }),
    )
    await writeWorkspaceFile('config/catalog.yaml', '{}\n')
    await writePackageJson({
      pnpm: {
        catalog: { foo: 'file:/./dependency', bar: 'link:/../dependency' },
        overrides: { foo: 'workspace:.', bar: 'workspace:..' },
      },
    })
    await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(parse(await readWorkspaceFile('config/catalog.yaml'))).toStrictEqual(
      {
        catalog: { foo: 'file:../dependency', bar: 'link:../../dependency' },
        overrides: { foo: 'workspace:..', bar: 'workspace:../..' },
      },
    )
  })

  it('preserves writable legacy settings when their replacement is owned by a package', async () => {
    await writePolicy({ allowBuilds: { bar: true } })
    const root = stringify({
      include: { '@acme/policy': ['allowBuilds'] },
      configDependencies: { '@acme/policy': '1.0.0' },
      onlyBuiltDependencies: ['foo'],
    })
    await writeWorkspaceYaml(root)
    await writePackageJson({})
    const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(root)
    expect(result.warnings.join()).toContain('read-only config dependency')
    expect(result.changedFiles).toStrictEqual([])
  })

  it('discovers subprojects and lockfile mode from local include settings', async () => {
    await writeWorkspaceYaml(
      stringify({
        include: {
          './config/projects.yaml': [
            'packages',
            'sharedWorkspaceLockfile',
            'packageConfigs',
          ],
        },
      }),
    )
    await writeWorkspaceFile(
      'config/projects.yaml',
      "packages: ['../packages/*']\nsharedWorkspaceLockfile: false\n",
    )
    await writeWorkspaceFile(
      'packages/app/package.json',
      JSON.stringify({ name: 'app' }),
    )
    await writeWorkspaceFile('packages/app/.npmrc', 'save-exact=true\n')
    await writePackageJson({ packageManager: 'pnpm@12.15.0' })
    await migratePnpmSettings({ cwd: testDir })
    expect(
      parse(await readWorkspaceFile('config/projects.yaml')).packageConfigs,
    ).toStrictEqual({ app: { saveExact: true } })
    await expect(readWorkspaceFile('packages/app/.npmrc')).rejects.toThrow(
      'ENOENT',
    )
  })

  it('splits catalogs between named owners and the unowned root', async () => {
    const include = {
      './frontend.yaml': ['catalogs.frontend'],
      './other.yaml': ['catalogs.backend', 'catalog'],
    }
    await writeWorkspaceYaml(stringify({ include }))
    await writeWorkspaceFile(
      'frontend.yaml',
      'catalogs:\n  frontend:\n    vue: ^3\n',
    )
    await writeWorkspaceFile('other.yaml', '{}\n')
    await writePackageJson({
      pnpm: {
        catalog: { shared: '^1' },
        catalogs: {
          frontend: { vite: '^8' },
          backend: { hono: '^4' },
          extra: { foo: '^1' },
        },
      },
    })
    await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(parse(await readWorkspaceFile('frontend.yaml'))).toStrictEqual({
      catalogs: { frontend: { vue: '^3', vite: '^8' } },
    })
    expect(parse(await readWorkspaceFile('other.yaml'))).toStrictEqual({
      catalog: { shared: '^1' },
      catalogs: { backend: { hono: '^4' } },
    })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      include,
      catalogs: { extra: { foo: '^1' } },
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('reserves catalogs added later with the catalogs selector', async () => {
    await writeWorkspaceYaml(
      stringify({ include: { './catalogs.yaml': ['catalogs'] } }),
    )
    await writeWorkspaceFile('catalogs.yaml', '{}\n')
    await writePackageJson({ pnpm: { catalogs: { future: { foo: '^1' } } } })
    await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(parse(await readWorkspaceFile('catalogs.yaml'))).toStrictEqual({
      catalogs: { future: { foo: '^1' } },
    })
    expect((await readWorkspaceYaml()).catalogs).toBeUndefined()
  })

  it.each([null, {}])(
    'preserves empty catalog containers %j in their local owner',
    async catalogs => {
      await writeWorkspaceYaml(
        stringify({ include: { './catalogs.yaml': ['catalogs'] } }),
      )
      await writeWorkspaceFile('catalogs.yaml', '{}\n')
      await writePackageJson({ pnpm: { catalogs } })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(parse(await readWorkspaceFile('catalogs.yaml'))).toStrictEqual({
        catalogs,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it('cannot clear a borrowed catalog map through a null root container', async () => {
    await writePolicy({ catalogs: { shared: { foo: '^1' } } })
    await writeWorkspaceYaml(
      stringify({
        include: { '@acme/policy': ['catalogs'] },
        configDependencies: { '@acme/policy': '1.0.0' },
      }),
    )
    await writePackageJson({ pnpm: { catalogs: null, saveExact: true } })
    await migratePnpmSettings({
      cwd: testDir,
      targetVersion,
      strategy: 'overwrite',
    })
    expect((await readWorkspaceYaml()).catalogs).toBeUndefined()
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ catalogs: null })
  })

  it('normalizes aliases in the same delegated owner', async () => {
    await writeWorkspaceYaml(
      stringify({
        include: {
          './policy.yaml': ['audit', 'virtualStoreType', 'registries'],
        },
      }),
    )
    await writeWorkspaceFile(
      'policy.yaml',
      'auditLevel: high\nenableGlobalVirtualStore: false\nnamedRegistries:\n  work: https://registry.example/\n',
    )
    await writePackageJson({})
    await migratePnpmSettings({
      cwd: testDir,
      targetVersion,
      replaceDeprecated: true,
    })
    expect(parse(await readWorkspaceFile('policy.yaml'))).toStrictEqual({
      audit: { level: 'high' },
      virtualStoreType: 'project',
      registries: { 'https://registry.example/': { prefix: 'work' } },
    })
    expect((await readWorkspaceYaml()).audit).toBeUndefined()
  })

  it('removes normalized keys inherited through YAML merges without repeated changes', async () => {
    await writeWorkspaceYaml(
      stringify({ include: { './policy.yaml': ['audit'] } }),
    )
    await writeWorkspaceFile(
      'policy.yaml',
      '# inherited policy\n<<: { auditLevel: high }\n',
    )
    await writePackageJson({})
    await migratePnpmSettings({
      cwd: testDir,
      targetVersion,
      replaceDeprecated: true,
    })
    expect(
      parse(await readWorkspaceFile('policy.yaml'), { merge: true }),
    ).toStrictEqual({ audit: { level: 'high' } })
    await expect(readWorkspaceFile('policy.yaml')).resolves.toContain(
      '# inherited policy',
    )
    expect(
      (
        await migratePnpmSettings({
          cwd: testDir,
          targetVersion,
          replaceDeprecated: true,
        })
      ).changedFiles,
    ).toStrictEqual([])
  })

  it.each(readonlyCases)(
    'keeps config dependency values read-only with $strategy and source $value',
    async ({ strategy, value, retained, warning }) => {
      await writePolicy({ saveExact: true })
      const include = { '@acme/policy': ['saveExact'] }
      await writeWorkspaceYaml(
        stringify({ include, configDependencies: { '@acme/policy': '1.0.0' } }),
      )
      await writePackageJson({ pnpm: { saveExact: value, savePrefix: '~' } })
      const original = await readWorkspaceFile(
        'node_modules/.pnpm-config/@acme/policy/config.yaml',
      )
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion,
        strategy,
      })
      expect(result.warnings.length > 0).toBe(warning)
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        include,
        configDependencies: { '@acme/policy': '1.0.0' },
        savePrefix: '~',
      })
      await expect(
        readWorkspaceFile('node_modules/.pnpm-config/@acme/policy/config.yaml'),
      ).resolves.toBe(original)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it('cleans represented policy subsets without a false retention warning', async () => {
    await writePolicy({ catalogs: { policy: { foo: '^1', bar: '^2' } } })
    await writeWorkspaceYaml(
      stringify({
        include: { '@acme/policy': ['catalogs.policy'] },
        configDependencies: { '@acme/policy': '1.0.0' },
      }),
    )
    await writePackageJson({ pnpm: { catalogs: { policy: { foo: '^1' } } } })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion })).warnings,
    ).toStrictEqual([])
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('reports conflicting npmrc values even when package settings match the policy', async () => {
    await writePolicy({ saveExact: true })
    await writeWorkspaceYaml(
      stringify({
        include: { '@acme/policy': ['saveExact'] },
        configDependencies: { '@acme/policy': '1.0.0' },
      }),
    )
    await writePackageJson({ pnpm: { saveExact: true } })
    await writeNpmrc('save-exact=false\n')
    expect(
      (
        await migratePnpmSettings({ cwd: testDir, targetVersion })
      ).warnings.join(),
    ).toContain('read-only config dependency')
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'save-exact=false\n',
    )
  })

  it('retains explicit skill disabling instead of treating an empty list as represented', async () => {
    await writePolicy({ skills: { dirs: ['.agents/skills'] } })
    await writeWorkspaceYaml(
      stringify({
        include: { '@acme/policy': ['skills'] },
        configDependencies: { '@acme/policy': '1.0.0' },
      }),
    )
    await writePackageJson({ pnpm: { skills: { dirs: [] } } })
    expect(
      (
        await migratePnpmSettings({ cwd: testDir, targetVersion })
      ).warnings.join(),
    ).toContain('read-only config dependency')
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ skills: { dirs: [] } })
  })

  it('retains values delegated to a config dependency that is not installed', async () => {
    await writeWorkspaceYaml(
      stringify({
        include: { '@acme/policy': ['saveExact'] },
        configDependencies: { '@acme/policy': '1.0.0' },
      }),
    )
    await writePackageJson({ pnpm: { saveExact: true, savePrefix: '~' } })
    const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(result.warnings.join()).toContain('read-only config dependency')
    expect((await readWorkspaceYaml()).saveExact).toBeUndefined()
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ saveExact: true })
  })

  it('retains settings when the installed policy does not match the proposed version', async () => {
    await writePolicy({ saveExact: true })
    await writeWorkspaceYaml(
      stringify({
        include: { '@acme/policy': ['saveExact'] },
        configDependencies: { '@acme/policy': '1.0.0' },
      }),
    )
    await writePackageJson({
      pnpm: {
        configDependencies: { '@acme/policy': '2.0.0' },
        saveExact: true,
      },
    })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion,
      strategy: 'overwrite',
    })
    expect((await readWorkspaceYaml()).configDependencies).toStrictEqual({
      '@acme/policy': '2.0.0',
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ saveExact: true })
    expect(result.warnings.join()).toContain('read-only config dependency')
    expect(result.settingsChanges).toContainEqual({
      key: 'saveExact',
      before: true,
      after: undefined,
    })
  })

  it.each([
    {
      strategy: 'discard',
      version: '1.0.0',
      retained: { configDependencies: { '@acme/policy': '2.0.0' } },
    },
    {
      strategy: 'merge',
      version: '1.0.0',
      retained: { configDependencies: { '@acme/policy': '2.0.0' } },
    },
    { strategy: 'overwrite', version: '2.0.0', retained: { saveExact: true } },
  ] as const)(
    'resolves installed policies using the $strategy result of local declarations',
    async ({ strategy, version, retained }) => {
      await writePolicy({ saveExact: true })
      await writeWorkspaceYaml(
        stringify({
          include: {
            './dependencies.yaml': ['configDependencies'],
            '@acme/policy': ['saveExact'],
          },
        }),
      )
      await writeWorkspaceFile(
        'dependencies.yaml',
        stringify({ configDependencies: { '@acme/policy': '1.0.0' } }),
      )
      await writePackageJson({
        pnpm: {
          configDependencies: { '@acme/policy': '2.0.0' },
          saveExact: true,
        },
      })
      await migratePnpmSettings({ cwd: testDir, targetVersion, strategy })
      expect(
        parse(await readWorkspaceFile('dependencies.yaml')).configDependencies,
      ).toStrictEqual({ '@acme/policy': version })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'rejects default catalog alias collisions before any writes with %s',
    async strategy => {
      const root = stringify({ include: { './catalog.yaml': ['catalog'] } })
      const local = stringify({ catalogs: { default: { foo: '^1' } } })
      const incoming = { catalog: { bar: '^1' } }
      await writeWorkspaceYaml(root)
      await writeWorkspaceFile('catalog.yaml', local)
      await writePackageJson({ pnpm: incoming })
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion, strategy }),
      ).rejects.toThrow(/default.*catalog|catalog.*default/iu)
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(root)
      await expect(readWorkspaceFile('catalog.yaml')).resolves.toBe(local)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(incoming)
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'does not treat generated replacements as values supplied by a borrowed alias with %s',
    async strategy => {
      await writePolicy({ permissions: { bar: { build: true } } })
      await writeWorkspaceYaml(
        stringify({
          include: { '@acme/policy': ['allowBuilds'] },
          configDependencies: { '@acme/policy': '1.0.0' },
        }),
      )
      await writePackageJson({ pnpm: { onlyBuiltDependencies: ['foo'] } })
      await writeNpmrc('only-built-dependencies[]=foo\n')
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion,
        strategy,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ onlyBuiltDependencies: ['foo'] })
      expect((await readWorkspaceYaml()).allowBuilds).toBeUndefined()
      expect(result.warnings.join()).toContain('read-only config dependency')
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'only-built-dependencies[]=foo\n',
      )
    },
  )

  it.each(fileAliasCases)(
    'rejects writable aliases of a read-only package entry through a $kind',
    async ({ createLink }) => {
      await writePolicy({})
      await writeWorkspaceYaml(
        stringify({
          include: {
            './writable.yaml': ['savePrefix'],
            '@acme/policy': ['saveExact'],
          },
          configDependencies: { '@acme/policy': '1.0.0' },
        }),
      )
      const original = await readWorkspaceFile(
        'node_modules/.pnpm-config/@acme/policy/config.yaml',
      )
      await createLink(
        join(testDir, 'node_modules/.pnpm-config/@acme/policy/config.yaml'),
        join(testDir, 'writable.yaml'),
      )
      await writePackageJson({ pnpm: { savePrefix: '~' } })
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('read-only config dependency')
      await expect(
        readWorkspaceFile('node_modules/.pnpm-config/@acme/policy/config.yaml'),
      ).resolves.toBe(original)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ savePrefix: '~' })
    },
  )

  it('migrates incoming package delegations and declarations together', async () => {
    await writePolicy({ saveExact: true })
    const incoming = {
      include: { '@acme/policy': ['saveExact'] },
      configDependencies: { '@acme/policy': '1.0.0' },
      saveExact: true,
    }
    await writePackageJson({ pnpm: incoming })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion })).warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      include: incoming.include,
      configDependencies: incoming.configDependencies,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('does not normalize borrowed aliases or rebase their catalog specifiers', async () => {
    const policy = { enableGlobalVirtualStore: false, catalog: { foo: '^1' } }
    await writePolicy(policy)
    await writeWorkspaceYaml(
      stringify({
        include: { '@acme/policy': ['virtualStoreType', 'catalog'] },
        configDependencies: { '@acme/policy': '1.0.0' },
      }),
    )
    await writePackageJson({ pnpm: { saveExact: true } })
    await migratePnpmSettings({
      cwd: testDir,
      targetVersion,
      replaceDeprecated: true,
    })
    expect(
      parse(
        await readWorkspaceFile(
          'node_modules/.pnpm-config/@acme/policy/config.yaml',
        ),
      ),
    ).toStrictEqual(policy)
    expect((await readWorkspaceYaml()).virtualStoreType).toBeUndefined()
  })

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'keeps mixed read-only catalog conflicts in their source with %s',
    async strategy => {
      await writePolicy({ catalogs: { shared: { foo: '^1' } } })
      await writeWorkspaceYaml(
        stringify({
          include: { '@acme/policy': ['catalogs.shared'] },
          configDependencies: { '@acme/policy': '1.0.0' },
        }),
      )
      const incoming = {
        catalogs: { shared: { foo: '^2' }, local: { bar: '^1' } },
      }
      await writePackageJson({ pnpm: incoming })
      await migratePnpmSettings({ cwd: testDir, targetVersion, strategy })
      expect((await readWorkspaceYaml()).catalogs).toStrictEqual({
        local: { bar: '^1' },
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(incoming)
    },
  )

  it.each(['12.14.0', '12.15.0-rc.1', '^12.15.0', '13.0.0'])(
    'retains incoming declarations for unconfirmed or preceding pin %s',
    async version => {
      const include = { './missing.yaml': ['saveExact'] }
      await writePackageJson({
        packageManager: `pnpm@${version}`,
        pnpm: { include, saveExact: true },
      })
      expect(
        (await migratePnpmSettings({ cwd: testDir })).warnings.join(),
      ).toContain('include')
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ include })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
    },
  )

  it.each(incompatiblePinCases)(
    'rejects existing includes before file reads for pin $version',
    async ({ packageManager }) => {
      const original = stringify({
        include: { './missing.yaml': ['saveExact'] },
      })
      await writeWorkspaceYaml(original)
      await writePackageJson({
        packageManager,
        pnpm: { saveExact: true },
      })
      await expect(migratePnpmSettings({ cwd: testDir })).rejects.toThrow(
        /include|incompatible/iu,
      )
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ saveExact: true })
    },
  )

  it('preserves source files when cleanup is disabled and stays idempotent', async () => {
    await writeWorkspaceFile('policy.yaml', '{}\n')
    const pnpm = {
      include: { './policy.yaml': ['saveExact'] },
      saveExact: true,
    }
    await writePackageJson({ pnpm })
    await writeNpmrc('save-exact=true\n')
    const options = {
      cwd: testDir,
      targetVersion,
      cleanPackageJson: false,
      cleanNpmrc: false,
    }
    await migratePnpmSettings(options)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(pnpm)
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-exact=true\n')
    expect((await migratePnpmSettings(options)).changedFiles).toStrictEqual([])
  })

  it('reports newly adopted include values against the actual previous workspace', async () => {
    await writeWorkspaceFile('policy.yaml', 'saveExact: true\n')
    const include = { './policy.yaml': ['saveExact'] }
    await writePackageJson({ pnpm: { include } })
    const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(result.settingsChanges).toContainEqual({
      key: 'include',
      before: undefined,
      after: include,
    })
    expect(result.settingsChanges).toContainEqual({
      key: 'saveExact',
      before: undefined,
      after: true,
    })
  })

  it('supports a local config dependency declaration shared by package includes', async () => {
    await writePolicy({ saveExact: true })
    const include = {
      './config.yaml': ['configDependencies'],
      '@acme/policy': ['saveExact'],
    }
    await writeWorkspaceFile(
      'config.yaml',
      stringify({ configDependencies: { '@acme/policy': '1.0.0' } }),
    )
    await writeWorkspaceYaml(stringify({ include }))
    await writePackageJson({ pnpm: { saveExact: true } })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion })).warnings,
    ).toStrictEqual([])
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
    expect((await readWorkspaceYaml()).configDependencies).toBeUndefined()
  })

  it('keeps unrepresented npmrc source values after local owner conflicts', async () => {
    await writeWorkspaceYaml(
      stringify({ include: { './policy.yaml': ['saveExact'] } }),
    )
    await writeWorkspaceFile('policy.yaml', 'saveExact: true\n')
    await writePackageJson({ pnpm: { saveExact: true } })
    await writeNpmrc('save-exact=false\n')
    await migratePnpmSettings({ cwd: testDir, targetVersion })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'save-exact=false\n',
    )
  })

  it.each([
    { entry: undefined, content: 'saveExact: true\n' },
    { entry: '/absolute.yaml', content: 'saveExact: true\n' },
    { entry: 'policy.json', content: '{}' },
    { entry: '../outside.yaml', content: 'saveExact: true\n' },
    { entry: 'policy.yaml', content: 'savePrefix: ~\n' },
    { entry: 'policy.yaml', content: 'include: {}\n' },
  ])(
    'rejects invalid installed entry $entry before source writes',
    async ({ entry, content }) => {
      await writeWorkspaceYaml(
        stringify({
          include: { policy: ['saveExact'] },
          configDependencies: { policy: '1.0.0' },
        }),
      )
      await writeWorkspaceFile(
        'node_modules/.pnpm-config/policy/package.json',
        JSON.stringify({ version: '1.0.0', pnpm: { config: entry } }),
      )
      await writeWorkspaceFile(
        'node_modules/.pnpm-config/policy/policy.yaml',
        content,
      )
      await writeWorkspaceFile(
        'node_modules/.pnpm-config/policy/policy.json',
        content,
      )
      await writeWorkspaceFile(
        'node_modules/.pnpm-config/outside.yaml',
        content,
      )
      await writePackageJson({ pnpm: { saveExact: true } })
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow(/include|config dependency/iu)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ saveExact: true })
      await expect(
        readWorkspaceFile('node_modules/.pnpm-config/policy/policy.yaml'),
      ).resolves.toBe(content)
    },
  )

  it('rejects a package entry symlink escaping the installed package', async () => {
    await writeWorkspaceYaml(
      stringify({
        include: { policy: ['saveExact'] },
        configDependencies: { policy: '1.0.0' },
      }),
    )
    await writeWorkspaceFile(
      'node_modules/.pnpm-config/policy/package.json',
      JSON.stringify({ version: '1.0.0', pnpm: { config: 'entry.yaml' } }),
    )
    await writeWorkspaceFile('outside.yaml', 'saveExact: true\n')
    await symlink(
      join(testDir, 'outside.yaml'),
      join(testDir, 'node_modules/.pnpm-config/policy/entry.yaml'),
    )
    await writePackageJson({ pnpm: { saveExact: true } })
    await expect(
      migratePnpmSettings({ cwd: testDir, targetVersion }),
    ).rejects.toThrow('inside its package')
  })

  it('rejects undeclared config dependency owners', async () => {
    await writeWorkspaceYaml(stringify({ include: { policy: ['saveExact'] } }))
    await writePackageJson({ pnpm: { saveExact: true } })
    await expect(
      migratePnpmSettings({ cwd: testDir, targetVersion }),
    ).rejects.toThrow('declared config dependencies')
  })

  it('rejects missing local files without cleaning source declarations', async () => {
    const pnpm = {
      include: { './missing.yaml': ['saveExact'] },
      saveExact: true,
    }
    await writePackageJson({ pnpm })
    await expect(
      migratePnpmSettings({ cwd: testDir, targetVersion }),
    ).rejects.toThrow('ENOENT')
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(pnpm)
  })

  it('preserves absolute, home, and environment paths in local includes', async () => {
    const include = {
      './config/layout.yaml': [
        'modulesDir',
        'storeDir',
        'pnpmfile',
        'scriptShell',
      ],
    }
    await writeWorkspaceYaml(stringify({ include }))
    const local = {
      modulesDir: '/absolute/modules',
      storeDir: '~/store',
      // eslint-disable-next-line no-template-curly-in-string -- Preserve the dynamic path literally.
      pnpmfile: '${HOOK}',
      scriptShell: 'bash',
    }
    const original = stringify(local)
    await writeWorkspaceFile('config/layout.yaml', original)
    await writePackageJson({ pnpm: { saveExact: true } })
    await migratePnpmSettings({ cwd: testDir, targetVersion })
    await expect(readWorkspaceFile('config/layout.yaml')).resolves.toBe(
      original,
    )
    expect((await readWorkspaceYaml()).modulesDir).toBeUndefined()
  })

  it.each([
    { catalog: ['foo'] },
    { catalog: { foo: false } },
    { catalogs: false },
    { catalogs: { frontend: null } },
    { catalogs: { frontend: { foo: '^1', bad: false } } },
  ])('retains complete invalid incoming catalog values %j', async invalid => {
    await writeWorkspaceYaml(
      stringify({ include: { './catalogs.yaml': ['catalogs'] } }),
    )
    await writeWorkspaceFile('catalogs.yaml', '{}\n')
    await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
    expect(
      (
        await migratePnpmSettings({ cwd: testDir, targetVersion })
      ).warnings.join(),
    ).toContain('incompatible')
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(invalid)
    expect((await readWorkspaceYaml()).saveExact).toBe(true)
    expect(parse(await readWorkspaceFile('catalogs.yaml'))).toStrictEqual({})
  })

  it.each(invalidIncludes)(
    'retains an invalid incoming index %j without reading sources',
    async include => {
      await writePackageJson({ pnpm: { include, saveExact: true } })
      expect(
        (
          await migratePnpmSettings({ cwd: testDir, targetVersion })
        ).warnings.join(),
      ).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ include })
    },
  )

  it.each(invalidIncludes)(
    'rejects an invalid existing index %j before writes',
    async include => {
      const original = stringify({ include })
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow(
        /include|incompatible|mapping|YAML|array|Flow sequence/iu,
      )
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ saveExact: true })
    },
  )

  it.each([
    { include: { './a.yaml': ['saveExact'], './b.yaml': ['saveExact'] } },
    { include: { './a.yaml': ['catalogs'], './b.yaml': ['catalogs.foo'] } },
    { include: { './a.yaml': ['audit'] }, auditLevel: 'high' },
    {
      include: { './a.yaml': ['catalog'] },
      catalogs: { default: { foo: '^1' } },
    },
  ])('rejects reservation conflicts %j before source cleanup', async root => {
    await writeWorkspaceFile('a.yaml', '{}\n')
    await writeWorkspaceFile('b.yaml', '{}\n')
    await writeWorkspaceYaml(stringify(root))
    await writePackageJson({ pnpm: { saveExact: true } })
    await expect(
      migratePnpmSettings({ cwd: testDir, targetVersion }),
    ).rejects.toThrow('ownership')
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({ saveExact: true })
  })

  it.each([
    { include: { './a.yaml': ['saveExact'] }, content: 'savePrefix: ~\n' },
    { include: { './a.yaml': '*' }, content: 'include: {}\n' },
    {
      include: { './a.yaml': '*' },
      content: 'bootConfig: { unknown: true }\n',
    },
    { include: { './a.yaml': '*' }, content: '- array\n' },
    { include: { './a.yaml': '*' }, content: 'saveExact: [\n' },
    { include: { './a.yaml': '*' }, content: 'catalogs: false\n' },
  ])(
    'rejects invalid included contents $content before all writes',
    async ({ include, content }) => {
      await writeWorkspaceYaml(stringify({ include }))
      await writeWorkspaceFile('a.yaml', content)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('save-prefix=~\n')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow(
        /include|incompatible|mapping|YAML|array|Flow sequence/iu,
      )
      await expect(readWorkspaceFile('a.yaml')).resolves.toBe(content)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-prefix=~\n')
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ saveExact: true })
    },
  )

  it('detects ownership hidden by YAML merge keys', async () => {
    await writeWorkspaceYaml(
      'include:\n  ./a.yaml: [saveExact]\n<<: { saveExact: true }\n',
    )
    await writeWorkspaceFile('a.yaml', '{}\n')
    await writePackageJson({ pnpm: { savePrefix: '~' } })
    await expect(
      migratePnpmSettings({ cwd: testDir, targetVersion }),
    ).rejects.toThrow('ownership')
  })

  it.each([
    { kind: 'symlink', createLink: symlink },
    { kind: 'hardlink', createLink: link },
  ])('rejects duplicate local files through $kind', async ({ createLink }) => {
    await writeWorkspaceFile('a.yaml', 'saveExact: true\n')
    await createLink(join(testDir, 'a.yaml'), join(testDir, 'b.yaml'))
    await writeWorkspaceYaml(
      stringify({ include: { './a.yaml': '*', './b.yaml': '*' } }),
    )
    await writePackageJson({})
    await expect(
      migratePnpmSettings({ cwd: testDir, targetVersion }),
    ).rejects.toThrow('distinct')
  })

  it('retains all legacy sources if a local destination write fails', async () => {
    await writeWorkspaceYaml(
      stringify({ include: { './policy.yaml': ['saveExact'] } }),
    )
    await writeWorkspaceFile('policy.yaml', '{}\n')
    await writePackageJson({ pnpm: { saveExact: true } })
    await writeNpmrc('save-exact=true\n')
    const spy = vi
      .spyOn(fsUtils, 'fsWriteFileIfChanged')
      .mockRejectedValueOnce(new Error('write failed'))
    try {
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('write failed')
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ saveExact: true })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'save-exact=true\n',
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('preserves symlinked local owners and updates the physical file', async () => {
    await writeWorkspaceFile('physical.yaml', 'saveExact: false\n')
    await symlink(join(testDir, 'physical.yaml'), join(testDir, 'policy.yaml'))
    await writeWorkspaceYaml(
      stringify({ include: { './policy.yaml': ['saveExact'] } }),
    )
    await writePackageJson({ pnpm: { saveExact: true } })
    await migratePnpmSettings({
      cwd: testDir,
      targetVersion,
      strategy: 'overwrite',
    })
    expect(parse(await readWorkspaceFile('physical.yaml'))).toStrictEqual({
      saveExact: true,
    })
    expect(parse(await readWorkspaceFile('policy.yaml'))).toStrictEqual({
      saveExact: true,
    })
  })
})
