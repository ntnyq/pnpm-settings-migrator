import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { resolveOptions } from '../src/options'

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
