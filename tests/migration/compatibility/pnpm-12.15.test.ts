import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmBootConfigSettings, PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  bootConfig: {
    minimumReleaseAge: 0,
    minimumReleaseAgeExclude: ['policy'],
    minimumReleaseAgeStrict: true,
    minimumReleaseAgeIgnoreMissingTime: false,
    trustPolicy: 'no-downgrade',
    trustPolicyExclude: ['policy'],
    trustPolicyIgnoreAfter: 60,
  },
  maxTarballUnpackedSize: 1048576,
  lockfile: { includeResolutionSettings: true, integrityTarget: 'tar' },
  registries: {
    'https://registry.example/npm/': {
      serverType: 'pnpr',
      prefix: 'work',
      networkConcurrency: 2,
    },
  },
} satisfies PnpmWorkspace

const legacyRegistries = {
  default: 'https://registry.npmjs.org/',
  'https://registry.example/': { serverType: 'artifactory' },
}

const invalidSettings = [
  { bootConfig: true },
  { bootConfig: [] },
  { bootConfig: { unknown: null } },
  { bootConfig: { minimumReleaseAge: -1 } },
  { bootConfig: { minimumReleaseAge: 1.5 } },
  { bootConfig: { minimumReleaseAge: Number.MAX_SAFE_INTEGER + 1 } },
  { bootConfig: { minimumReleaseAgeExclude: 'policy' } },
  { bootConfig: { trustPolicyExclude: [false] } },
  { bootConfig: { minimumReleaseAgeStrict: 'true' } },
  { bootConfig: { minimumReleaseAgeIgnoreMissingTime: 1 } },
  { bootConfig: { trustPolicy: 'strict' } },
  { bootConfig: { trustPolicyIgnoreAfter: -1 } },
  { maxTarballUnpackedSize: -1 },
  { maxTarballUnpackedSize: 1.5 },
  { maxTarballUnpackedSize: '1024' },
  { maxTarballUnpackedSize: Number.MAX_SAFE_INTEGER + 1 },
  { lockfile: { integrityTarget: 'tgz' } },
  { lockfile: { integrityTarget: false } },
  { lockfile: { integrityTarget: 'tar', unknown: null } },
  { registries: legacyRegistries },
  {
    registries: {
      'https://registry.example/': { serverType: 'pnpr', unknown: null },
    },
  },
  {
    registries: {
      'https://registry.example/': { serverType: 'pnpr', ecosystem: 'pypi' },
    },
  },
]

const unconfirmedCases = [
  '12.14.0',
  '11.28.6',
  '11.28.7',
  '^12.15.0',
  '12.15.0-rc.1',
  '13.0.0',
  undefined,
].map(version => {
  const supportsLimit = version === '11.28.7'
  const retained: Partial<typeof settings> = { ...settings }
  if (supportsLimit) {
    delete retained.maxTarballUnpackedSize
  }
  return {
    version,
    packageManager: version && `pnpm@${version}`,
    retained,
    expected: {
      saveExact: true,
      ...(supportsLimit
        ? { maxTarballUnpackedSize: settings.maxTarballUnpackedSize }
        : {}),
    },
  }
})

const npmrcCases = ['11.28.6', '11.28.7', '12.14.0', '12.15.0'].map(
  targetVersion => {
    const supported = ['11.28.7', '12.15.0'].includes(targetVersion)
    return {
      targetVersion,
      expected: {
        saveExact: true,
        ...(supported ? { maxTarballUnpackedSize: 1024 } : {}),
      },
      retained: `${supported ? '' : 'max-tarball-unpacked-size=1024\n'}registry=https://registry.npmjs.org/\n`,
    }
  },
)

const existing = { lockfile: { integrityTarget: 'resource' } }
const incoming = { lockfile: { integrityTarget: 'tar' } }
const strategyCases = [
  { strategy: 'discard', expected: existing, retained: incoming },
  { strategy: 'merge', expected: existing, retained: incoming },
  { strategy: 'overwrite', expected: incoming, retained: undefined },
] as const

describe('pnpm 12.15 settings', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    writeWorkspaceFile,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('pnpm-12.15')

  it('exports the boot policy type', () => {
    expectTypeOf<PnpmBootConfigSettings>().toExtend<
      PnpmWorkspace['bootConfig']
    >()
  })

  it.each(['12.15.0', '12.15.0+build.1'])(
    'migrates settings inferred from %s without rewriting the pin',
    async version => {
      await writePackageJson({
        packageManager: `pnpm@${version}`,
        pnpm: settings,
      })
      expect(
        (await migratePnpmSettings({ cwd: testDir })).warnings,
      ).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
      const manifest = JSON.parse(await readWorkspaceFile('package.json'))
      expect(manifest.pnpm).toBeUndefined()
      expect(manifest.packageManager).toBe(`pnpm@${version}`)
    },
  )

  it.each(unconfirmedCases)(
    'retains unsupported sections for $version',
    async ({ packageManager, expected, retained }) => {
      await writePackageJson({
        packageManager,
        pnpm: { ...settings, saveExact: true },
      })
      expect(
        (await migratePnpmSettings({ cwd: testDir })).warnings.join(),
      ).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each(['12.2.0', '12.8.2', '12.9.0', '12.14.0'])(
    'retains mixed registry maps with serverType at %s',
    async targetVersion => {
      await writePackageJson({ pnpm: { registries: legacyRegistries } })
      expect(
        (
          await migratePnpmSettings({ cwd: testDir, targetVersion })
        ).warnings.join(),
      ).toContain('registries')
      await expect(readWorkspaceYaml()).rejects.toMatchObject({
        code: 'ENOENT',
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ registries: legacyRegistries })
    },
  )

  it.each(['12.2.0', '12.8.2', '12.9.0', '12.14.0'])(
    'rejects existing mixed registry maps with serverType at %s before writes',
    async targetVersion => {
      const original = stringify({ registries: legacyRegistries })
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('save-prefix=~\n')
      const manifest = await readWorkspaceFile('package.json')

      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow(/incompatible.*registries/u)
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-prefix=~\n')
    },
  )

  it.each(invalidSettings)('retains invalid sections %j', async invalid => {
    await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
    expect(
      (
        await migratePnpmSettings({ cwd: testDir, targetVersion: '12.15.0' })
      ).warnings.join(),
    ).toContain('incompatible')
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(invalid)
  })

  it.each(['11.28.6', '11.28.7', '12.2.0', '12.8.2', '12.9.0', '12.14.0'])(
    'retains a pnpr-only registry declaration at %s',
    async targetVersion => {
      const unsupported = {
        registries: { 'https://registry.example/': { serverType: 'pnpr' } },
      }
      await writePackageJson({ pnpm: { ...unsupported, saveExact: true } })
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
      ).toStrictEqual(unsupported)
    },
  )

  it.each([
    ...invalidSettings.map(invalid => ({ invalid, targetVersion: '12.15.0' })),
    ...['11.28.6', '11.28.7', '12.2.0', '12.8.2', '12.9.0', '12.14.0'].map(
      targetVersion => ({
        invalid: {
          registries: { 'https://registry.example/': { serverType: 'pnpr' } },
        },
        targetVersion,
      }),
    ),
    ...Object.entries(settings).map(([key, value]) => ({
      invalid: { [key]: value },
      targetVersion: '12.14.0',
    })),
  ])(
    'rejects incompatible existing values %j before writes',
    async ({ invalid, targetVersion }) => {
      const original = stringify(invalid)
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('save-prefix=~')
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-prefix=~')
    },
  )

  it.each([
    {
      bootConfig: null,
      maxTarballUnpackedSize: null,
      lockfile: { integrityTarget: null },
    },
    {
      bootConfig: {},
      maxTarballUnpackedSize: 0,
      lockfile: { integrityTarget: 'resource' },
    },
    {
      bootConfig: {
        minimumReleaseAge: null,
        minimumReleaseAgeStrict: null,
        trustPolicy: null,
        trustPolicyExclude: [],
      },
    },
    { registries: { 'https://registry.example/': { serverType: 'pnpr' } } },
  ])('preserves optional settings %j', async valid => {
    await writePackageJson({ pnpm: valid })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion: '12.15.0' }))
        .warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(valid)
  })

  it.each(npmrcCases)(
    'gates numeric npmrc limits at $targetVersion',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({ packageManager: 'pnpm@12.14.0' })
      await writeNpmrc(
        'max-tarball-unpacked-size=1024\nsave-exact=true\nregistry=https://registry.npmjs.org/\n',
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(retained)
    },
  )

  it.each(strategyCases)(
    'keeps unrepresented nested values with $strategy',
    async ({ strategy, expected, retained }) => {
      await writeWorkspaceYaml(stringify(existing))
      await writePackageJson({ pnpm: incoming })
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.15.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it('preserves valid existing sections while migrating unrelated values', async () => {
    await writeWorkspaceYaml(stringify(settings))
    await writePackageJson({ pnpm: { saveExact: true } })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion: '12.15.0' }))
        .warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      ...settings,
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  // eslint-disable-next-line no-template-curly-in-string -- Preserve dynamic configuration without expansion.
  it.each(['-1', '1.5', '9007199254740992', '${LIMIT}'])(
    'retains unsafe npmrc unpack limit %s',
    async value => {
      await writePackageJson({ packageManager: 'pnpm@12.15.0' })
      await writeNpmrc(`max-tarball-unpacked-size=${value}\nsave-exact=true\n`)
      expect(
        (await migratePnpmSettings({ cwd: testDir })).warnings.join(),
      ).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        `max-tarball-unpacked-size=${value}\n`,
      )
    },
  )

  it('migrates legacy include declarations to the root workspace', async () => {
    const include = { './policy.yaml': ['saveExact'] }
    await writeWorkspaceFile('policy.yaml', 'saveExact: true\n')
    await writePackageJson({ pnpm: { include, savePrefix: '~' } })
    expect(
      (await migratePnpmSettings({ cwd: testDir, targetVersion: '12.15.0' }))
        .warnings,
    ).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      include,
      savePrefix: '~',
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'blocks existing includes before any writes with %s',
    async strategy => {
      const original = stringify({
        include: { './policy.yaml': ['saveExact'] },
      })
      await writeWorkspaceYaml(original)
      await writeWorkspaceFile('policy.yaml', 'saveExact: true\n')
      await writePackageJson({ pnpm: { saveExact: false } })
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({
          cwd: testDir,
          targetVersion: '12.14.0',
          strategy,
        }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('policy.yaml')).resolves.toBe(
        'saveExact: true\n',
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
    },
  )
})
