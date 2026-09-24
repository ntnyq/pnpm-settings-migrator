import { isDeepStrictEqual } from 'node:util'
import {
  isArray,
  isPlainObject,
  isUndefined,
  unique,
  uniqueWith,
} from '@ntnyq/utils'
import { defu } from 'defu'
import type { PnpmWorkspace, MergeStrategy } from '../types'

/**
 * Merge objects with priority to the first argument.
 * Only adds keys from second argument that don't exist in first.
 * For nested objects, recursively merges them.
 *
 * @param priority - Object with priority values
 * @param fallback - Object with fallback values
 *
 * @returns Merged result
 */
function discardMerge(
  priority: PnpmWorkspace,
  fallback: PnpmWorkspace,
): PnpmWorkspace {
  const result: Record<string, unknown> = { ...priority }

  for (const [key, fallbackValue] of Object.entries(fallback)) {
    const priorityValue = Object.hasOwn(result, key) ? result[key] : undefined

    if (isUndefined(priorityValue)) {
      // Key doesn't exist in priority, use fallback value
      // Define a data property so `__proto__` never invokes its inherited setter.
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: fallbackValue,
        writable: true,
      })
    } else if (isPlainObject(priorityValue) && isPlainObject(fallbackValue)) {
      // Both are objects - recursively merge with priority first
      result[key] = discardMerge(
        priorityValue as PnpmWorkspace,
        fallbackValue as PnpmWorkspace,
      )
    }
    // For other cases (arrays, primitives, or mismatched types), keep priority value
  }

  return result as PnpmWorkspace
}

/**
 * Deep merge two objects with array deduplication.
 *
 * For arrays, this function takes the union of both arrays and removes duplicates.
 * For objects, it recursively merges them.
 * For primitives, it prefers existing values.
 *
 * @param existing - Existing values
 * @param incoming - New values
 *
 * @returns Merged result with deduplicated arrays
 */
function mergeWithArrayDedupe(
  existing: PnpmWorkspace,
  incoming: PnpmWorkspace,
): PnpmWorkspace {
  const result: Record<string, unknown> = { ...existing }

  for (const [key, incomingValue] of Object.entries(incoming)) {
    const existingValue = Object.hasOwn(result, key) ? result[key] : undefined

    if (isUndefined(existingValue)) {
      // Key doesn't exist in existing, use incoming value
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: incomingValue,
        writable: true,
      })
    } else if (isArray(existingValue) && isArray(incomingValue)) {
      // Both are arrays - merge and deduplicate
      result[key] = uniqueWith(
        unique<unknown>([...existingValue, ...incomingValue]),
        isDeepStrictEqual,
      )
    } else if (isPlainObject(existingValue) && isPlainObject(incomingValue)) {
      // Both are objects - recursively merge
      result[key] = mergeWithArrayDedupe(
        existingValue as PnpmWorkspace,
        incomingValue as PnpmWorkspace,
      )
    }
    // For other cases (primitives, mismatched types), keep existing value
  }

  return result as PnpmWorkspace
}

/**
 * Append ordered matchers without removing entries that restore precedence.
 * An overlapping suffix/prefix is already in place, including on repeated runs.
 *
 * @param existing - Matchers already in the workspace
 * @param incoming - Matchers to append in source order
 *
 * @returns Combined matchers with the incoming sequence at the end
 */
function mergeOrderedMatchers<T>(existing: T[], incoming: T[]): T[] {
  let overlap = Math.min(existing.length, incoming.length)
  while (
    overlap > 0 &&
    !isDeepStrictEqual(existing.slice(-overlap), incoming.slice(0, overlap))
  ) {
    overlap--
  }
  return [...existing, ...incoming.slice(overlap)]
}

/**
 * Merge two objects based on the specified strategy.
 *
 * @param existing - Existing pnpm-workspace.yaml content
 * @param incoming - New settings from package.json and .npmrc
 * @param strategy - Merge strategy to use
 *
 * @returns Merged pnpm workspace configuration
 *
 * @example
 * ```ts
 * // Discard strategy - keep existing values
 * mergeByStrategy({ packages: ['a'] }, { packages: ['b'] }, 'discard')
 * // => { packages: ['a'] }
 *
 * // Merge strategy - combine arrays with deduplication
 * mergeByStrategy({ packages: ['a'] }, { packages: ['b'] }, 'merge')
 * // => { packages: ['a', 'b'] }
 *
 * // Overwrite strategy - use incoming values
 * mergeByStrategy({ packages: ['a'] }, { packages: ['b'] }, 'overwrite')
 * // => { packages: ['b'] }
 * ```
 */
export function mergeByStrategy(
  existing: PnpmWorkspace,
  incoming: PnpmWorkspace,
  strategy: MergeStrategy,
): PnpmWorkspace {
  switch (strategy) {
    case 'discard':
      // Keep existing values, only add new keys from incoming
      return discardMerge(existing, incoming)

    case 'merge': {
      const result = mergeWithArrayDedupe(existing, incoming)
      // packageConfigs uses last-match precedence rather than set semantics.
      if (
        isArray(existing.packageConfigs) &&
        isArray(incoming.packageConfigs)
      ) {
        result.packageConfigs = mergeOrderedMatchers(
          existing.packageConfigs,
          incoming.packageConfigs,
        )
      }
      return result
    }

    case 'overwrite':
      // Use incoming values, only keep keys not in incoming
      return discardMerge(incoming, existing)

    default:
      return defu(existing, incoming)
  }
}
