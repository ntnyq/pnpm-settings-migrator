import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import { createTestWorkspace } from '../../helpers'

describe('pnpm 11.28 settings', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('pnpm-11.28')

  it.each([
    {
      targetVersion: '11.27.1',
      expected: {},
      retained: 'force-ignores-platform=false\n',
    },
    {
      targetVersion: '11.28.0',
      expected: { forceIgnoresPlatform: false },
      retained: '',
    },
    {
      targetVersion: '11.28.2',
      expected: { forceIgnoresPlatform: false },
      retained: '',
    },
  ])(
    'gates forceIgnoresPlatform at $targetVersion without changing v11 reporter support',
    async ({ targetVersion, expected, retained }) => {
      await writePackageJson({ pnpm: { reporter: 'silent' } })
      await writeNpmrc(
        'force-ignores-platform=false\nregistry=https://registry.npmjs.org/\n',
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        reporter: 'silent',
        ...expected,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        `${retained}registry=https://registry.npmjs.org/\n`,
      )
    },
  )

  it.each(['11.28.0', '11.28.2'])(
    'retains dynamic userAgent sources for %s',
    async targetVersion => {
      await writePackageJson({
        // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
        pnpm: { userAgent: 'agent/${SECRET}', saveExact: true },
      })
      // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
      await writeNpmrc('user-agent=${SECRET}\n')
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
        // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
      ).toStrictEqual({ userAgent: 'agent/${SECRET}' })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
        'user-agent=${SECRET}\n',
      )
    },
  )

  it.each([
    null,
    [],
    'patch.diff',
    { foo: 123 },
    { good: 'good.patch', bad: false },
  ])(
    'retains the entire invalid patch map %j at 11.28.1',
    async patchedDependencies => {
      await writePackageJson({ pnpm: { patchedDependencies, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '11.28.1',
      })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ patchedDependencies })
    },
  )

  it.each(['11.28.0', '11.28.1', '11.28.2'])(
    'normalizes scalar npmrc packages before validation for %s',
    async targetVersion => {
      await writePackageJson({ packageManager: `pnpm@${targetVersion}` })
      await writeNpmrc(
        'packages=packages/*\nregistry=https://registry.npmjs.org/\n',
      )
      const result = await migratePnpmSettings({ cwd: testDir })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        packages: ['packages/*'],
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'registry=https://registry.npmjs.org/\n',
      )
    },
  )

  it.each([
    ['discard', ['apps/*'], 'packages=packages/*\n'],
    ['merge', ['apps/*', 'packages/*'], ''],
    ['overwrite', ['packages/*'], ''],
  ] as const)(
    'preserves scalar npmrc package conflicts with %s',
    async (strategy, packages, retainedNpmrc) => {
      await writePackageJson({})
      await writeWorkspaceYaml(stringify({ packages: ['apps/*'] }))
      await writeNpmrc(
        'packages=packages/*\nregistry=https://registry.npmjs.org/\n',
      )
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '11.28.1',
        strategy,
      })
      expect(result.warnings).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({ packages })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        `${retainedNpmrc}registry=https://registry.npmjs.org/\n`,
      )
    },
  )

  it.each([
    'packages=',
    'packages=false',
    'packages[]=valid\npackages[]=false',
  ])('retains invalid npmrc package values %s', async invalid => {
    await writePackageJson({})
    await writeNpmrc(`${invalid}\nsave-exact=true\n`)
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '11.28.1',
    })
    expect(result.warnings.join()).toContain('incompatible')
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(`${invalid}\n`)
  })

  it.each([false, 0, '', 'packages/*', ['valid', false]])(
    'retains invalid packages %j at 11.28.1',
    async packages => {
      await writePackageJson({ pnpm: { packages, saveExact: true } })
      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '11.28.1',
      })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ packages })
    },
  )

  it('keeps the preceding 11.28.0 falsy schema behavior', async () => {
    await writePackageJson({
      pnpm: { packages: false, patchedDependencies: null },
    })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.0' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      packages: false,
      patchedDependencies: null,
    })
  })

  it.each([
    { patchedDependencies: { good: 'good.patch', bad: false } },
    { packages: false },
    { packages: 'packages/*' },
  ])('rejects invalid existing workspace %j before writes', async settings => {
    await writePackageJson({})
    const original = stringify(settings)
    await writeWorkspaceYaml(original)
    await writeNpmrc('save-exact=true')
    await expect(
      migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.1' }),
    ).rejects.toThrow('incompatible')
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe('save-exact=true')
  })

  it('preserves valid patch maps and literal user agents', async () => {
    const settings = {
      patchedDependencies: { foo: 'patches/foo.patch' },
      userAgent: 'custom-agent',
    }
    await writePackageJson({ pnpm: settings })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.1' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(settings)
  })
})
