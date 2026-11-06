import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmPackagePermissions, PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  permissions: {
    example: { build: 'review build', skills: ['guide', 'migrate'] },
    denied: { skills: [] },
  },
  supportedArchitectures: [
    'current',
    'freebsd-x64',
    'darwin-arm64-macos_14_0',
    'linux-x64-napi8',
    'linux-x64-node127',
  ],
} satisfies PnpmWorkspace

const legacyPlatforms = [
  'current',
  'linux-x64',
  'linux-amd64-glibc',
  'linux-arm64-musllinux_1_1',
  'linux-x64-manylinux_2_28',
  'aarch64-apple-darwin',
  'x86_64-unknown-linux-musl',
  'powerpc64-unknown-linux-gnu',
  'x86_64-pc-windows-msvc',
  'x86_64-manylinux_2_28',
]

const invalidSettings = [
  { permissions: { example: null } },
  { tasks: { build: null } },
  { auditConfig: { ignoreGhsas: null } },
  { catalogs: { example: null } },
  { pipelines: { build: null } },
  { packageExtensions: { example: null } },
  { packageExtensions: { example: { peerDependenciesMeta: { peer: null } } } },
  { permissions: { example: { skills: 'review skills' } } },
  { permissions: { example: { skills: ['guide', false] } } },
  { permissions: { example: { skills: { guide: true } } } },
  { permissions: { example: { build: [] } } },
  { permissions: { example: { skills: true, mcp: true } } },
  ...[
    false,
    'wasm32',
    'linux-wasm32',
    'freebsd-enten',
    'enten-x64',
    'freebsd-x64-musl',
    'linux-x64-napi',
    'linux-x64-macos_14_0',
    'linux-x64-musl-manylinux_2_28',
    'linux-x64-napi8-musl',
    'linux-x64-napi8-node127',
    'linux-x64-node01',
    'linux-x64-node4294967296',
    'darwin-arm64-macos_14_00',
    'linux-x64-',
    'linux-x64\n',
    'linux-x64-manylinux_2',
    'linux-x64-musl-gnu',
  ].map(entry => ({ supportedArchitectures: ['current', entry] })),
]

const pythonArrayFields = [
  'extras',
  'groups',
  'versions',
  'overrides',
  'constraints',
]
const pythonNullCases = pythonArrayFields.flatMap(field => [
  {
    field,
    targetVersion: '12.17.0',
    expected: { saveExact: true, python: { [field]: null } },
    retained: undefined,
    hasWarning: false,
  },
  {
    field,
    targetVersion: '12.18.0',
    expected: { saveExact: true },
    retained: { python: { [field]: null } },
    hasWarning: true,
  },
])

const versioningNullSettings = [
  { versioning: { fixed: null } },
  { versioning: { epics: null } },
  { versioning: { ignore: null } },
  { versioning: { lanes: null } },
  { versioning: { fixed: [null] } },
  { versioning: { epics: [{ lead: 'example', packages: null }] } },
  { remoteSideEffectsCache: { packages: null } },
]

const unconfirmedPins = [
  undefined,
  'pnpm@^12.18.0',
  'pnpm@12.18.0-rc.1',
  'pnpm@13.0.0',
  'pnpm@11.28.11',
]
const legacyNullSettings = {
  auditConfig: { ignoreGhsas: null },
  versioning: { fixed: null },
  remoteSideEffectsCache: { packages: null },
}

describe('pnpm 12.18 value shapes', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
    writeNpmrc,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.18')

  it('exports chosen skill arrays through the public workspace contract', () => {
    expectTypeOf<string[]>().toExtend<PnpmPackagePermissions['skills']>()
    expectTypeOf<typeof settings>().toExtend<PnpmWorkspace>()
  })

  it.each(['12.18.0', '12.18.0+sha512.abc'])(
    'migrates complete value shapes and cleans sources at %s',
    async version => {
      await writePackageJson({
        packageManager: `pnpm@${version}`,
        pnpm: settings,
      })
      const result = await migratePnpmSettings({ cwd: testDir })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each([
    'pnpm@12.17.0',
    'pnpm@11.28.11',
    'pnpm@12.18.0-rc.1',
    'pnpm@^12.18.0',
    'pnpm@13.0.0',
    undefined,
  ])(
    'retains new shapes for preceding or unconfirmed version %s',
    async packageManager => {
      await writePackageJson({
        packageManager,
        pnpm: { ...settings, saveExact: true },
      })
      const result = await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v12',
      })
      expect(result.warnings.join()).toContain('incompatible')
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
      targetVersion: '12.17.0',
      expected: { saveExact: true },
      retained: settings,
    },
    {
      targetVersion: '12.18.0',
      expected: { saveExact: true, ...settings },
      retained: undefined,
    },
  ])(
    'uses explicit target $targetVersion over the project pin',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({
        packageManager: 'pnpm@12.18.0',
        pnpm: { ...settings, saveExact: true },
      })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each(['12.5.0', '12.17.0', '12.18.0'])(
    'preserves legacy platform spellings at %s',
    async targetVersion => {
      await writePackageJson({
        pnpm: { supportedArchitectures: legacyPlatforms },
      })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        supportedArchitectures: legacyPlatforms,
      })
    },
  )

  it.each([
    {
      targetVersion: '12.17.0',
      expected: { saveExact: true },
      retained: 'supported-architectures[]=freebsd-x64\n',
    },
    {
      targetVersion: '12.18.0',
      expected: { saveExact: true, supportedArchitectures: ['freebsd-x64'] },
      retained: '',
    },
  ])(
    'migrates npmrc platform lists at $targetVersion',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({ packageManager: 'pnpm@12.17.0' })
      await writeNpmrc(
        'supported-architectures[]=freebsd-x64\nsave-exact=true\nregistry=https://registry.npmjs.org/\n',
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        `${retained}registry=https://registry.npmjs.org/\n`,
      )
    },
  )

  it.each([
    'aix-ppc64',
    'android-arm64',
    'linux-loong64',
    'linux-mips64el',
    'netbsd-ia32',
    'openbsd-x64',
    'openharmony-arm64',
    'sunos-x64',
    'win32-x64-windows_10_0-electron130',
    'linux-x64-manylinux_2_28-napi8',
    'linux-x64-glibc-node127',
    'linux-arm64-musllinux_1_1-napi0',
  ])('accepts new platform %s only from 12.18', async platform => {
    const source = { supportedArchitectures: [platform] }
    await writePackageJson({ pnpm: { ...source, saveExact: true } })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.17.0' })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(source)
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.18.0' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      ...source,
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it.each(invalidSettings)(
    'retains the entire invalid setting %j',
    async invalid => {
      await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.18.0',
      })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(invalid)
    },
  )

  it.each(pythonNullCases)(
    'handles null python.$field at $targetVersion without losing source values',
    async ({ field, targetVersion, expected, retained, hasWarning }) => {
      await writePackageJson({
        packageManager: 'pnpm@12.17.0',
        pnpm: { saveExact: true, python: { [field]: null } },
      })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(
        result.warnings.some(warning => warning.includes('incompatible')),
      ).toBe(hasWarning)
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each([
    {
      targetVersion: '12.17.0',
      expected: { saveExact: true, auditConfig: { ignoreGhsas: null } },
      retained: undefined,
    },
    {
      targetVersion: '12.18.0',
      expected: { saveExact: true },
      retained: { auditConfig: { ignoreGhsas: null } },
    },
  ])(
    'handles null auditConfig.ignoreGhsas at $targetVersion',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({
        pnpm: { saveExact: true, auditConfig: { ignoreGhsas: null } },
      })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each(['12.17.0', '12.18.0'])(
    'preserves empty Python and audit arrays at %s',
    async targetVersion => {
      const value = {
        python: {
          extras: [],
          groups: [],
          versions: [],
          overrides: [],
          constraints: [],
        },
        auditConfig: { ignoreGhsas: [] },
      }
      await writePackageJson({ pnpm: value })
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(value)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each(versioningNullSettings)(
    'retains newly invalid versioning and cache collections %j',
    async value => {
      await writePackageJson({ pnpm: { ...value, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.18.0',
      })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(value)
    },
  )

  it.each(unconfirmedPins)(
    'retains removed null shapes for an unconfirmed v12 target from %s',
    async packageManager => {
      await writePackageJson({
        packageManager,
        pnpm: { ...legacyNullSettings, saveExact: true },
      })
      const result = await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v12',
      })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(legacyNullSettings)
    },
  )

  it.each(unconfirmedPins)(
    'rejects removed existing null shapes for an unconfirmed v12 target from %s',
    async packageManager => {
      const original = stringify(legacyNullSettings)
      await writeWorkspaceYaml(original)
      await writePackageJson({ packageManager, pnpm: { saveExact: true } })
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, compatibility: 'v12' }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
    },
  )

  it.each(versioningNullSettings)(
    'preserves preceding-release support for %j',
    async value => {
      await writePackageJson({ pnpm: value })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.17.0',
      })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(value)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'validates existing workspace values before any writes with %s',
    async strategy => {
      const original = stringify({
        permissions: { example: { skills: 'review' } },
      })
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('save-prefix=~\n')
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({
          cwd: testDir,
          targetVersion: '12.18.0',
          strategy,
        }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-prefix=~\n')
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'preserves an existing chosen-skill workspace with %s',
    async strategy => {
      const original = stringify(settings)
      await writeWorkspaceYaml(original)
      await writePackageJson({ packageManager: 'pnpm@12.18.0', pnpm: settings })
      await migratePnpmSettings({ cwd: testDir, strategy })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each([
    {
      strategy: 'discard',
      expectedSkills: ['guide'],
      retained: { permissions: { example: { skills: [] } } },
    },
    {
      strategy: 'merge',
      expectedSkills: ['guide'],
      retained: { permissions: { example: { skills: [] } } },
    },
    { strategy: 'overwrite', expectedSkills: [], retained: undefined },
  ] as const)(
    'retains an unapplied empty skill decision with $strategy',
    async ({ strategy, expectedSkills, retained }) => {
      await writeWorkspaceYaml(
        stringify({ permissions: { example: { skills: ['guide'] } } }),
      )
      await writePackageJson({
        pnpm: { permissions: { example: { skills: [] } } },
      })
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.18.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        permissions: { example: { skills: expectedSkills } },
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each([
    { targetVersion: '12.17.0', value: settings },
    {
      targetVersion: '12.18.0',
      value: { supportedArchitectures: ['linux-x64-napi8-node127'] },
    },
    { targetVersion: '12.18.0', value: { auditConfig: { ignoreGhsas: null } } },
    ...versioningNullSettings.map(value => ({
      targetVersion: '12.18.0',
      value,
    })),
    ...pythonArrayFields.map(field => ({
      targetVersion: '12.18.0',
      value: { python: { [field]: null } },
    })),
  ])(
    'rejects an incompatible existing workspace at $targetVersion',
    async ({ targetVersion, value }) => {
      const original = stringify(value)
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
    },
  )
})
