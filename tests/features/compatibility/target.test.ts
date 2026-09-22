import { describe, expect, it } from 'vitest'
import {
  resolvePnpmTarget,
  resolveCompatibilityTarget,
} from '../../../src/features/compatibility/target'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../../../src/features/compatibility/version'

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

  it('auto-detects v12 release candidates from packageManager', () => {
    expect(resolveCompatibilityTarget('auto', 'pnpm@12.0.0-rc.7')).toBe('v12')
  })

  it('auto-detects v12 ranges from devEngines.packageManager', () => {
    expect(
      resolveCompatibilityTarget('auto', undefined, {
        name: 'pnpm',
        version: '^12.0.0-rc.7',
      }),
    ).toBe('v12')
  })

  it('auto-detects pnpm from a devEngines.packageManager array', () => {
    expect(
      resolveCompatibilityTarget('auto', undefined, [
        { name: 'npm', version: '^11.0.0' },
        { name: 'pnpm', version: '^11.0.0' },
      ]),
    ).toBe('v11')
  })
})
