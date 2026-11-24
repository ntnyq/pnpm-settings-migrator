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

  it.each(['9.15.9', '10.34.9', '10.26.0-rc.0', '10.34.9+sha512.abc'])(
    'rejects unsupported exact version %s',
    targetVersion => {
      expect(() => resolveOptions({ targetVersion })).toThrow(
        'Unsupported targetVersion',
      )
    },
  )

  it('rejects an explicit major conflict', () => {
    expect(() =>
      resolveOptions({ compatibility: 'v11', targetVersion: '12.4.0' }),
    ).toThrow('conflicts with compatibility')
  })

  it.each(['v10', 'v12.4'])(
    'rejects the removed compatibility value %s',
    compatibility => {
      expect(() =>
        resolveOptions(JSON.parse(JSON.stringify({ compatibility }))),
      ).toThrow('Invalid compatibility')
    },
  )
})
