import { isPlainObject, isUndefined } from '@ntnyq/utils'
import { defu } from 'defu'
import type { MergeStrategy, PnpmWorkspace } from '../types'

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

    case 'merge':
      // Deep merge with array deduplication
      return mergeWithArrayDedupe(existing, incoming)

    case 'overwrite':
      // Use incoming values, only keep keys not in incoming
      return discardMerge(incoming, existing)

    default:
      return defu(existing, incoming)
  }
}

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
  const result: Record<string, any> = { ...priority }

  for (const [key, fallbackValue] of Object.entries(fallback)) {
    const priorityValue = result[key]

    if (isUndefined(priorityValue)) {
      // Key doesn't exist in priority, use fallback value
      result[key] = fallbackValue
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
  const result: Record<string, any> = { ...existing }

  for (const [key, incomingValue] of Object.entries(incoming)) {
    const existingValue = result[key]

    if (isUndefined(existingValue)) {
      // Key doesn't exist in existing, use incoming value
      result[key] = incomingValue
    } else if (Array.isArray(existingValue) && Array.isArray(incomingValue)) {
      // Both are arrays - merge and deduplicate
      result[key] = Array.from(new Set([...existingValue, ...incomingValue]))
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
