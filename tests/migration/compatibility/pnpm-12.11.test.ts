import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type {
  PnpmPackagePermissions,
  PnpmSkillsSettings,
  PnpmWorkspace,
} from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  permissions: { example: { build: false, skills: true } },
  skills: { dirs: ['.agents/skills'] },
  provenance: false,
} satisfies PnpmWorkspace

const invalidSettings = [
  { permissions: true },
  { permissions: [] },
  { permissions: { example: false } },
  { permissions: { example: [] } },
  { permissions: { example: { build: 1 } } },
  { permissions: { example: { skills: [] } } },
  { permissions: { example: { build: true, mcp: true } } },
  { skills: false },
  { skills: [] },
  { skills: { dirs: '.agents/skills' } },
  { skills: { dirs: [false] } },
  { skills: { dirs: [], unknown: true } },
  { provenance: 'false' },
]

describe('pnpm 12.11 settings', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.11')

  it('exports permission and skill option types', () => {
    expectTypeOf<Record<string, PnpmPackagePermissions>>().toExtend<
      PnpmWorkspace['permissions']
    >()
    expectTypeOf<PnpmSkillsSettings>().toExtend<PnpmWorkspace['skills']>()
    expectTypeOf<null>().toExtend<PnpmWorkspace['provenance']>()
  })

  it.each(['12.11.0', '12.11.1', '12.11.2', '12.11.0+sha512.abc'])(
    'migrates and cleans new settings for %s',
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
    'pnpm@12.10.1',
    'pnpm@12.11.0-rc.1',
    'pnpm@^12.11.0',
    'pnpm@13.0.0',
    undefined,
  ])(
    'retains new settings for older or unconfirmed pin %s',
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
      targetVersion: '12.10.1',
      expected: { saveExact: true },
      retained: 'provenance=false\n',
    },
    {
      targetVersion: '12.11.0',
      expected: { saveExact: true, provenance: false },
      retained: '',
    },
  ])(
    'uses explicit target $targetVersion for npmrc provenance and cleans only applied values',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({ packageManager: 'pnpm@12.10.1' })
      await writeNpmrc(
        'provenance=false\nsave-exact=true\nregistry=https://registry.npmjs.org/\n',
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        `${retained}registry=https://registry.npmjs.org/\n`,
      )
    },
  )

  it.each(invalidSettings)(
    'retains invalid nested values %j intact',
    async invalid => {
      await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.11.0',
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

  it.each([
    { permissions: null, skills: null, provenance: null },
    { permissions: {}, skills: {} },
    { permissions: { example: null } },
    { permissions: { example: {} }, skills: { dirs: null } },
    {
      permissions: { example: { build: null, skills: null } },
      skills: { dirs: [] },
    },
    { permissions: { example: { build: 'review this', skills: '' } } },
  ])('preserves optional and undecided forms %j', async valid => {
    await writePackageJson({ pnpm: valid })
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.11.0',
    })
    expect(result.warnings).toStrictEqual([])
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(valid)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it('retains v11 provenance support without migrating v12 permissions', async () => {
    await writePackageJson({ pnpm: settings })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.5' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      provenance: false,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual({
      permissions: settings.permissions,
      skills: settings.skills,
    })
  })

  it('preserves an existing valid workspace byte for byte', async () => {
    const original = stringify(settings)
    await writePackageJson({ packageManager: 'pnpm@12.11.0' })
    await writeWorkspaceYaml(original)
    const result = await migratePnpmSettings({ cwd: testDir })
    expect(result.changedFiles).toStrictEqual([])
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it.each(invalidSettings)(
    'rejects invalid existing values %j before any writes',
    async invalid => {
      const original = stringify(invalid)
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      await writeNpmrc('provenance=false')
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion: '12.11.0' }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'provenance=false',
      )
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'preserves permissions precedence across sources with %s',
    async strategy => {
      await writeWorkspaceYaml(stringify({ permissions: settings.permissions }))
      await writePackageJson({
        pnpm: { allowBuilds: { example: true }, ...settings },
      })
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.11.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        ...settings,
        allowBuilds: { example: true },
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each([
    {
      strategy: 'discard',
      existingDirs: ['.agents/skills'],
      expectedDirs: ['.agents/skills'],
      retained: { skills: { dirs: [] } },
    },
    {
      strategy: 'merge',
      existingDirs: ['.agents/skills'],
      expectedDirs: ['.agents/skills'],
      retained: { skills: { dirs: [] } },
    },
    {
      strategy: 'overwrite',
      existingDirs: ['.agents/skills'],
      expectedDirs: [],
      retained: undefined,
    },
    {
      strategy: 'discard',
      existingDirs: [],
      expectedDirs: [],
      retained: undefined,
    },
    {
      strategy: 'merge',
      existingDirs: [],
      expectedDirs: [],
      retained: undefined,
    },
    {
      strategy: 'overwrite',
      existingDirs: [],
      expectedDirs: [],
      retained: undefined,
    },
  ] as const)(
    'cleans empty skill directories only when applied with $strategy over $existingDirs',
    async ({ strategy, existingDirs, expectedDirs, retained }) => {
      await writeWorkspaceYaml(stringify({ skills: { dirs: existingDirs } }))
      await writePackageJson({
        pnpm: { skills: { dirs: [] }, saveExact: true },
      })

      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.11.0',
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        skills: { dirs: expectedDirs },
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)

      const repeated = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.11.0',
        strategy,
      })
      expect(repeated.changedFiles).toStrictEqual([])
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each([
    {
      strategy: 'discard',
      expected: {
        permissions: { example: { build: true, skills: true } },
        skills: { dirs: ['.claude/skills'] },
        provenance: true,
      },
      retained: settings,
    },
    {
      strategy: 'merge',
      expected: {
        permissions: { example: { build: true, skills: true } },
        skills: { dirs: ['.claude/skills', '.agents/skills'] },
        provenance: true,
      },
      retained: { permissions: settings.permissions, provenance: false },
    },
    { strategy: 'overwrite', expected: settings, retained: undefined },
  ] as const)(
    'applies $strategy to nested permissions and skill directories without removing unapplied values',
    async ({ strategy, expected, retained }) => {
      const existing = {
        permissions: { example: { build: true } },
        skills: { dirs: ['.claude/skills'] },
        provenance: true,
      }
      await writeWorkspaceYaml(stringify(existing))
      await writePackageJson({ pnpm: settings })
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.11.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )
})
