import { describe, expect, it } from 'vitest'
import { migratePnpmSettings, resolveOptions } from '../src'
import { resolvePnpmTarget } from '../src/features/compatibility/target'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'
import { createTestWorkspace } from './helpers'

/**
 * Versions used to test capability boundaries, including later minors.
 */
const versionCases = [
  ['12.3.4', false],
  ['12.4.0', true],
  ['12.4.1', true],
  ['12.5.0', true],
  ['12.6.0', true],
  ['12.4.0+sha512.abc', true],
  ['12.4.0-rc.1', false],
  ['12.5.0-beta.1', false],
  ['^12.4.0', false],
  ['>=12.0.0', false],
  ['12', false],
  ['12.3.4 || 12.4.0', false],
  ['13.0.0', false],
] as const

describe('resolved pnpm capabilities', () => {
  it.each(versionCases)(
    'infers capability availability from %s',
    (version, expected) => {
      const target = resolvePnpmTarget({
        compatibility: 'auto',
        packageManager: `pnpm@${version}`,
      })
      expect(target.compatibility).toBe('v12')
      expect(target.workspaceSettings.has('pipelines')).toBe(expected)
      expect(target.workspaceSettings.has('packageConfigs')).toBe(expected)
      expect(target.taskSettings.has('outputs')).toBe(expected)
      const fallback = resolvePnpmTarget({
        compatibility: 'auto',
        devPackageManager: { name: 'pnpm', version },
      })
      expect(fallback.workspaceSettings.has('pipelines')).toBe(expected)
    },
  )

  it('uses matching project minor capabilities with an explicit major', () => {
    const target = resolvePnpmTarget({
      compatibility: 'v12',
      packageManager: 'pnpm@12.4.0',
    })
    expect(target.version?.raw).toBe('12.4.0')
    expect(target.workspaceSettings.has('pipelines')).toBe(true)
  })

  it('keeps base capabilities when the project pins a different major', () => {
    const target = resolvePnpmTarget({
      compatibility: 'v12',
      packageManager: 'pnpm@10.34.5',
      devPackageManager: { name: 'pnpm', version: '12.4.0' },
    })
    expect(target.version).toBeUndefined()
    expect(target.workspaceSettings.has('globalShims')).toBe(true)
    expect(target.workspaceSettings.has('pipelines')).toBe(false)
  })

  it('gives packageManager precedence over devEngines', () => {
    const target = resolvePnpmTarget({
      compatibility: 'auto',
      packageManager: 'pnpm@12.3.4',
      devPackageManager: { name: 'pnpm', version: '12.4.0' },
    })
    expect(target.version?.raw).toBe('12.3.4')
    expect(target.workspaceSettings.has('pipelines')).toBe(false)
  })

  it('does not promote a primary range using a precise fallback declaration', () => {
    const target = resolvePnpmTarget({
      compatibility: 'auto',
      packageManager: 'pnpm@^12.0.0',
      devPackageManager: { name: 'pnpm', version: '12.4.0' },
    })
    expect(target.version).toBeUndefined()
    expect(target.workspaceSettings.has('pipelines')).toBe(false)
  })

  it('uses an unambiguous devEngines array', () => {
    const target = resolvePnpmTarget({
      compatibility: 'auto',
      devPackageManager: [
        { name: 'npm', version: '11.0.0' },
        { name: 'pnpm', version: '12.4.0' },
      ],
    })
    expect(target.version?.raw).toBe('12.4.0')
    expect(target.workspaceSettings.has('pipelines')).toBe(true)
  })

  it('keeps the base schema for conflicting devEngines entries', () => {
    const target = resolvePnpmTarget({
      compatibility: 'auto',
      devPackageManager: [
        { name: 'pnpm', version: '12.4.0' },
        { name: 'pnpm', version: '12.3.4' },
      ],
    })
    expect(target.version).toBeUndefined()
    expect(target.workspaceSettings.has('pipelines')).toBe(false)
  })

  it('gives an explicit version precedence over both project declarations', () => {
    const target = resolvePnpmTarget({
      compatibility: 'auto',
      targetVersion: '12.5.0',
      packageManager: 'pnpm@10.34.5',
      devPackageManager: { name: 'pnpm', version: '11.26.0' },
    })
    expect(target.compatibility).toBe('v12')
    expect(target.version?.raw).toBe('12.5.0')
    expect(target.workspaceSettings.has('pipelines')).toBe(true)
  })

  it('preserves v11 packageConfigs without requiring a precise version', () => {
    const target = resolvePnpmTarget({ compatibility: 'v11' })
    expect(target.workspaceSettings.has('packageConfigs')).toBe(true)
    expect(target.workspaceSettings.has('pipelines')).toBe(false)
  })

  it.each([
    ['12.4.0', [12, 4, 1], false],
    ['12.4.1', [12, 4, 1], true],
    ['12.5.0', [12, 4, 1], true],
    ['13.0.0', [12, 4, 1], false],
  ] as const)(
    'compares %s with the full capability minimum %s',
    (version, minimum, expected) => {
      expect(supportsMinimumVersion(parsePnpmVersion(version), minimum)).toBe(
        expected,
      )
    },
  )
})

describe('explicit target version options', () => {
  it.each([
    '12',
    '12.4',
    '^12.4.0',
    '>=12.4.0',
    'pnpm@12.4.0',
    'v12.4.0',
    '12.4.0 || 12.5.0',
    '12.04.0',
    '12.4.0-01',
    '12.4.0+',
    '12.4.0 ',
    '12.4.0\n',
    '',
  ])('rejects imprecise or malformed version %j', targetVersion => {
    expect(() => resolveOptions({ targetVersion })).toThrow(
      'Invalid targetVersion',
    )
  })

  it.each(['12.4.0', '12.5.0', '12.4.0+sha512.abc', '12.4.0-rc.1'])(
    'accepts exact version %s',
    targetVersion => {
      expect(resolveOptions({ targetVersion }).targetVersion).toBe(
        targetVersion,
      )
    },
  )

  it.each(['v10', 'v11'] as const)(
    'rejects an explicit major conflict with %s',
    compatibility => {
      expect(() =>
        resolveOptions({ compatibility, targetVersion: '12.4.0' }),
      ).toThrow('conflicts with compatibility')
    },
  )

  it('rejects the removed minor compatibility enum', () => {
    expect(() =>
      resolveOptions(JSON.parse('{"compatibility":"v12.4"}')),
    ).toThrow('Invalid compatibility')
  })
})

describe('target version migration behavior', () => {
  const {
    testDir,
    readWorkspaceYaml,
    readWorkspaceFile,
    writePackageJson,
    writeNpmrc,
  } = createTestWorkspace('target-version')

  it.each(['12.4.0', '12.5.0', '12.6.0'])(
    'migrates supported fields targeting %s without changing packageManager',
    async targetVersion => {
      await writePackageJson({
        packageManager: 'pnpm@10.34.5',
        pnpm: { pipelines: { ci: ['test'] } },
      })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        pipelines: { ci: ['test'] },
      })
      const manifest = JSON.parse(await readWorkspaceFile('package.json'))
      expect(manifest.packageManager).toBe('pnpm@10.34.5')
      expect(manifest.pnpm).toBeUndefined()
    },
  )

  it('uses the detected minor with compatibility v12', async () => {
    await writePackageJson({
      packageManager: 'pnpm@12.4.0',
      pnpm: { pipelineBase: 'main' },
    })
    await migratePnpmSettings({ cwd: testDir, compatibility: 'v12' })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      pipelineBase: 'main',
    })
  })

  it('honors an explicit older version despite a newer packageManager', async () => {
    const pnpm = { pipelineBase: 'main' }
    await writePackageJson({ packageManager: 'pnpm@12.4.0', pnpm })
    await writeNpmrc('node-linker=isolated')
    const result = await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '12.3.4',
    })
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      nodeLinker: 'isolated',
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).pnpm,
    ).toStrictEqual(pnpm)
    expect(result.warnings.join()).toContain('pnpm 12.3.4')
  })

  it('rejects conflicts before reading or writing configuration files', async () => {
    await writePackageJson({ pnpm: { pipelineBase: 'main' } })
    await writeNpmrc('node-linker=isolated')
    const original = await readWorkspaceFile('package.json')
    await expect(
      migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v11',
        targetVersion: '12.4.0',
      }),
    ).rejects.toThrow('conflicts with compatibility')
    await expect(readWorkspaceFile('package.json')).resolves.toBe(original)
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'node-linker=isolated',
    )
  })
})
