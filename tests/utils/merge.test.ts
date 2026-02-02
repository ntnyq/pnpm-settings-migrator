import { describe, expect, it } from 'vitest'
import { mergeByStrategy } from '../../src/utils'
import type { PnpmWorkspace } from '../../src/types'

describe('mergeByStrategy', () => {
  describe('discard strategy', () => {
    it('should keep existing values when keys conflict', () => {
      const existing: PnpmWorkspace = {
        packages: ['packages/*'],
      }
      const incoming: PnpmWorkspace = {
        packages: ['apps/*'],
      }

      const result = mergeByStrategy(existing, incoming, 'discard')

      expect(result.packages).toEqual(['packages/*'])
    })

    it('should add new keys from incoming', () => {
      const existing: PnpmWorkspace = {
        packages: ['packages/*'],
      }
      const incoming: PnpmWorkspace = {
        packages: ['apps/*'],
        overrides: {
          foo: '1.0.0',
        },
      }

      const result = mergeByStrategy(existing, incoming, 'discard')

      expect(result.packages).toEqual(['packages/*'])
      expect(result.overrides).toEqual({ foo: '1.0.0' })
    })

    it('should merge nested objects', () => {
      const existing: PnpmWorkspace = {
        overrides: {
          foo: '1.0.0',
        },
      }
      const incoming: PnpmWorkspace = {
        overrides: {
          bar: '2.0.0',
        },
      }

      const result = mergeByStrategy(existing, incoming, 'discard')

      expect(result.overrides).toEqual({
        bar: '2.0.0',
        foo: '1.0.0',
      })
    })
  })

  describe('overwrite strategy', () => {
    it('should use incoming values when keys conflict', () => {
      const existing: PnpmWorkspace = {
        packages: ['packages/*'],
      }
      const incoming: PnpmWorkspace = {
        packages: ['apps/*'],
      }

      const result = mergeByStrategy(existing, incoming, 'overwrite')

      expect(result.packages).toEqual(['apps/*'])
    })

    it('should keep existing keys not in incoming', () => {
      const existing: PnpmWorkspace = {
        packages: ['packages/*'],
        overrides: {
          bar: '2.0.0',
        },
      }
      const incoming: PnpmWorkspace = {
        packages: ['apps/*'],
      }

      const result = mergeByStrategy(existing, incoming, 'overwrite')

      expect(result.packages).toEqual(['apps/*'])
      expect(result.overrides).toEqual({ bar: '2.0.0' })
    })

    it('should merge nested objects', () => {
      const existing: PnpmWorkspace = {
        overrides: {
          foo: '1.0.0',
        },
      }
      const incoming: PnpmWorkspace = {
        overrides: {
          bar: '2.0.0',
        },
      }

      const result = mergeByStrategy(existing, incoming, 'overwrite')

      expect(result.overrides).toEqual({
        bar: '2.0.0',
        foo: '1.0.0',
      })
    })
  })

  describe('merge strategy', () => {
    it('should merge arrays and deduplicate', () => {
      const existing: PnpmWorkspace = {
        packages: ['packages/*', 'common'],
      }
      const incoming: PnpmWorkspace = {
        packages: ['apps/*', 'common'],
      }

      const result = mergeByStrategy(existing, incoming, 'merge')

      expect(result.packages).toEqual(['packages/*', 'common', 'apps/*'])
    })

    it('should merge nested objects', () => {
      const existing: PnpmWorkspace = {
        overrides: {
          foo: '1.0.0',
        },
      }
      const incoming: PnpmWorkspace = {
        overrides: {
          bar: '2.0.0',
        },
      }

      const result = mergeByStrategy(existing, incoming, 'merge')

      expect(result.overrides).toEqual({
        bar: '2.0.0',
        foo: '1.0.0',
      })
    })

    it('should merge deeply nested objects', () => {
      const existing: PnpmWorkspace = {
        peerDependencyRules: {
          ignoreMissing: ['react'],
        },
      }
      const incoming: PnpmWorkspace = {
        peerDependencyRules: {
          ignoreMissing: ['vue'],
          allowedVersions: {
            react: '18',
          },
        },
      }

      const result = mergeByStrategy(existing, incoming, 'merge')

      expect(result.peerDependencyRules).toEqual({
        ignoreMissing: ['react', 'vue'],
        allowedVersions: {
          react: '18',
        },
      })
    })

    it('should keep existing values for primitives', () => {
      const existing: PnpmWorkspace = {
        neverBuiltDependencies: ['fsevents'],
      }
      const incoming: PnpmWorkspace = {
        neverBuiltDependencies: ['@esbuild/linux-x64'],
      }

      const result = mergeByStrategy(existing, incoming, 'merge')

      expect(result.neverBuiltDependencies).toEqual([
        'fsevents',
        '@esbuild/linux-x64',
      ])
    })

    it('should handle complex merge scenarios', () => {
      const existing: PnpmWorkspace = {
        neverBuiltDependencies: ['fsevents'],
        packages: ['packages/*'],
        overrides: {
          foo: '1.0.0',
        },
      }
      const incoming: PnpmWorkspace = {
        packages: ['apps/*'],
        overrides: {
          bar: '2.0.0',
        },
        peerDependencyRules: {
          ignoreMissing: ['react'],
        },
      }

      const result = mergeByStrategy(existing, incoming, 'merge')

      expect(result).toEqual({
        neverBuiltDependencies: ['fsevents'],
        packages: ['packages/*', 'apps/*'],
        overrides: {
          bar: '2.0.0',
          foo: '1.0.0',
        },
        peerDependencyRules: {
          ignoreMissing: ['react'],
        },
      })
    })
  })
})
