import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { resolveOptions } from '../../src/features/options'

describe('resolveOptions', () => {
  it('resolves the default cwd at call time', () => {
    const cwd = vi
      .spyOn(process, 'cwd')
      .mockReturnValueOnce('/workspace/first')
      .mockReturnValueOnce('/workspace/second')

    try {
      expect(resolveOptions().cwd).toBe('/workspace/first')
      expect(resolveOptions().cwd).toBe('/workspace/second')
    } finally {
      cwd.mockRestore()
    }
  })
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
