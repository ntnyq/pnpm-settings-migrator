import { isDeepStrictEqual } from 'node:util'
import { isPlainObject, isString } from '@ntnyq/utils'
import { YARN_PACKAGE_SELECTOR_PATTERN } from '../constants/yarn'

/**
 * Recognize a full placeholder for an isolated linker's boolean hoist option.
 *
 * @param value - Untrusted hoist value
 *
 * @returns Whether pnpm can substitute a bare token for the placeholder
 */
export function isIsolatedHoistPlaceholder(value: unknown): boolean {
  return (
    isString(value) &&
    /^\$\{[\w.]+(?:\?|:?-[-\w.]+)?\}$/u.exec(value)?.[0] === value
  )
}

/**
 * Plain package names cannot overlap. Ranges, globs and group selectors can
 * tie in specificity, in which case pnpm applies the first matching override.
 *
 * @param selectors - Keys of a single overrides map
 *
 * @returns Whether sorting the map could change dependency resolution
 */
export function hasOrderedSelectors(selectors: string[]): boolean {
  return (
    selectors.length > 1 &&
    selectors.some(key => !YARN_PACKAGE_SELECTOR_PATTERN.test(key))
  )
}

/**
 * Check that source selectors still occur in their original relative order.
 *
 * @param actual - Merged override map, possibly containing additional entries
 * @param expected - Source override map
 *
 * @returns Whether selector precedence survives in the destination
 */
export function keepsOverrideOrder(
  actual: unknown,
  expected: unknown,
): boolean {
  if (!isPlainObject(expected) || !isPlainObject(actual)) {
    return true
  }
  const keys = Object.keys(expected)
  return (
    !hasOrderedSelectors(keys) ||
    isDeepStrictEqual(
      Object.keys(actual).filter(key => Object.hasOwn(expected, key)),
      keys,
    )
  )
}

/**
 * Compare workspace values including the order of root and project overrides.
 *
 * @param key - Workspace setting being compared
 * @param before - Original setting
 * @param after - Proposed setting
 *
 * @returns Whether the two settings have the same migration semantics
 */
export function isSameSetting(
  key: string,
  before: unknown,
  after: unknown,
): boolean {
  if (!isDeepStrictEqual(before, after)) {
    return false
  }
  if (key === 'overrides') {
    return keepsOverrideOrder(before, after)
  }
  if (key === 'packageConfigs' && after && typeof after === 'object') {
    return Object.entries(after).every(([project, config]) => {
      const original: unknown = Reflect.get(before as object, project)
      return (
        !isPlainObject(config) ||
        !isPlainObject(original) ||
        keepsOverrideOrder(original.overrides, config.overrides)
      )
    })
  }
  return true
}
