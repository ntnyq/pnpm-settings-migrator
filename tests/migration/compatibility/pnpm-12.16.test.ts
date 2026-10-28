import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import type { PnpmWorkspace } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const settings = {
  strictSsl: true,
  localAddress: '127.0.0.1',
  runtime: false,
  requiredScripts: ['build'],
  tag: 'next',
} satisfies PnpmWorkspace

const invalidSettings = [
  { strictSsl: 'false' },
  { localAddress: false },
  { runtime: 'false' },
  { requiredScripts: 'build' },
  { requiredScripts: ['build', false] },
  { tag: 1 },
]

const versionCases = ['12.15.0', '12.16.0'].map(targetVersion => ({
  targetVersion,
  packageManager: targetVersion === '12.16.0' ? 'pnpm@12.15.0' : 'pnpm@12.16.0',
  expected: {
    saveExact: true,
    ...(targetVersion === '12.16.0' ? settings : {}),
  },
  retained: targetVersion === '12.16.0' ? undefined : settings,
}))

const npmrc =
  'strict-ssl=true\nlocal-address=127.0.0.1\nruntime=false\nrequired-scripts[]=build\ntag=next\n'
const npmrcCases = versionCases.map(entry => ({
  ...entry,
  retainedNpmrc: `${entry.targetVersion === '12.16.0' ? '' : npmrc}registry=https://registry.npmjs.org/\n`,
}))

const strategyCases = [
  {
    strategy: 'discard',
    expected: ['build'],
    retained: { requiredScripts: ['test'] },
  },
  { strategy: 'merge', expected: ['build', 'test'], retained: undefined },
  { strategy: 'overwrite', expected: ['test'], retained: undefined },
] as const

const machine = { symlinkedLockfileTargetDirs: ['/tmp'], ci: false }
const machineCases = ['12.15.0', '12.16.0'].map(targetVersion => ({
  targetVersion,
  expected: {
    saveExact: true,
    ...(targetVersion === '12.15.0' ? { scriptsPrependNodePath: true } : {}),
  },
  retained: {
    ...machine,
    ...(targetVersion === '12.15.0' ? {} : { scriptsPrependNodePath: true }),
  },
  retainedNpmrc: `symlinked-lockfile-target-dirs[]=/tmp\n${targetVersion === '12.15.0' ? '' : 'scripts-prepend-node-path=true\n'}`,
}))

const unconfirmedCases = [
  '12.15.0',
  '^12.16.0',
  '12.16.0-rc.1',
  '13.0.0',
  undefined,
].map(version => ({ packageManager: version && `pnpm@${version}` }))

describe('pnpm 12.16 settings', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.16')

  it.each(['12.16.0', '12.16.1', '12.16.0+build.1'])(
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
      expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual(
        {
          packageManager: `pnpm@${version}`,
        },
      )
    },
  )

  it.each(unconfirmedCases)(
    'retains settings for the unsupported or unconfirmed pin $packageManager',
    async ({ packageManager }) => {
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

  it.each(versionCases)(
    'uses the explicit target over a conflicting project pin at $targetVersion',
    async ({ targetVersion, packageManager, expected, retained }) => {
      await writePackageJson({
        packageManager,
        pnpm: { ...settings, saveExact: true },
      })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each(npmrcCases)(
    'migrates and cleans supported npmrc values at $targetVersion',
    async ({ targetVersion, expected, retainedNpmrc }) => {
      await writeNpmrc(
        `${npmrc}save-exact=true\nregistry=https://registry.npmjs.org/\n`,
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(retainedNpmrc)
    },
  )

  it.each(invalidSettings)('retains invalid settings %j', async invalid => {
    await writePackageJson({ pnpm: { ...invalid, saveExact: true } })
    expect(
      (
        await migratePnpmSettings({ cwd: testDir, targetVersion: '12.16.0' })
      ).warnings.join(),
    ).toContain('incompatible')
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(invalid)
  })

  it.each([
    ...invalidSettings.map(invalid => ({ invalid, targetVersion: '12.16.0' })),
    ...Object.entries(settings).map(([key, value]) => ({
      invalid: { [key]: value },
      targetVersion: '12.15.0',
    })),
    { invalid: { scriptsPrependNodePath: true }, targetVersion: '12.16.0' },
    { invalid: { ci: false }, targetVersion: '12.15.0' },
    { invalid: { ci: false }, targetVersion: '12.16.0' },
    {
      invalid: { symlinkedLockfileTargetDirs: ['/tmp'] },
      targetVersion: '12.16.0',
    },
  ])(
    'blocks incompatible existing YAML %j before writes',
    async ({ invalid, targetVersion }) => {
      const original = stringify(invalid)
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

  it.each([
    {
      strictSsl: null,
      localAddress: null,
      runtime: null,
      requiredScripts: null,
      tag: null,
    },
    { localAddress: 'invalid-address', requiredScripts: [], tag: '' },
    // eslint-disable-next-line no-template-curly-in-string -- Preserve placeholders without expansion.
    { localAddress: '${SOURCE_IP}', tag: '${DIST_TAG}' },
  ])('preserves optional and string values %j', async valid => {
    await writePackageJson({ pnpm: valid })
    await migratePnpmSettings({ cwd: testDir, targetVersion: '12.16.0' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual(valid)
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toBeUndefined()
  })

  it.each(strategyCases)(
    'merges requirements and cleans only represented values with $strategy',
    async ({ strategy, expected, retained }) => {
      await writeWorkspaceYaml(stringify({ requiredScripts: ['build'] }))
      await writePackageJson({ pnpm: { requiredScripts: ['test'] } })
      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '12.16.0',
        strategy,
      })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        requiredScripts: expected,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
    },
  )

  it.each(machineCases)(
    'retains global settings and gates scriptsPrependNodePath at $targetVersion',
    async ({ targetVersion, expected, retained, retainedNpmrc }) => {
      await writePackageJson({
        pnpm: { ...machine, scriptsPrependNodePath: true, saveExact: true },
      })
      await writeNpmrc(
        'symlinked-lockfile-target-dirs[]=/tmp\nscripts-prepend-node-path=true\n',
      )
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(retained)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(retainedNpmrc)
    },
  )
})
