import { isDeepStrictEqual } from 'node:util'
import { isArray } from '@ntnyq/utils'
import { ORDERED_FILTER_SETTINGS } from '../../constants'
import type {
  AppliedOrderedFilterKeys,
  ResolveAppliedOrderedFilterKeysOptions,
} from '../../types'

/**
 * Check whether an ordered source sequence still controls the final selectors.
 *
 * @param actual - Destination filter sequence
 * @param expected - Source sequence whose trailing position is required
 *
 * @returns Whether the source is an intact suffix, including an empty sequence
 */
function hasOrderedSuffix(actual: unknown, expected: unknown): boolean {
  return (
    isArray(actual) &&
    isArray(expected) &&
    (expected.length === 0 ||
      isDeepStrictEqual(actual.slice(-expected.length), expected))
  )
}

/**
 * Find filters that can be cleaned without changing selector order on reruns.
 *
 * @param options - Normalized sources, final settings, and package cleanup policy
 *
 * @returns Applied filter keys eligible for cleanup in each root source
 */
export function resolveAppliedOrderedFilterKeys(
  options: ResolveAppliedOrderedFilterKeysOptions,
): AppliedOrderedFilterKeys {
  const {
    cleanPackageJson,
    finalSettings,
    incomingSettings,
    normalizedPackageJsonSettings,
  } = options
  const packageJson = new Set(
    ORDERED_FILTER_SETTINGS.filter(key =>
      hasOrderedSuffix(
        Reflect.get(finalSettings, key),
        Reflect.get(incomingSettings, key),
      ),
    ),
  )
  // Retaining an earlier source requires its later selectors on the next run,
  // unless that earlier sequence already matches the destination suffix.
  const npmrc = new Set(
    [...packageJson].filter(
      key =>
        cleanPackageJson ||
        !Object.hasOwn(normalizedPackageJsonSettings, key) ||
        hasOrderedSuffix(
          Reflect.get(finalSettings, key),
          Reflect.get(normalizedPackageJsonSettings, key),
        ),
    ),
  )

  return { packageJson, npmrc }
}

/**
 * Check that an individual source's selectors remain together in source order.
 *
 * @param actual - Destination filter sequence after the combined source check
 * @param expected - Individual source sequence whose values must be preserved
 *
 * @returns Whether the destination contains the complete contiguous sequence
 */
export function containsOrderedFilterValue(
  actual: unknown,
  expected: unknown,
): boolean {
  return (
    isArray(actual) &&
    isArray(expected) &&
    (expected.length === 0 ||
      actual.some((_, index) =>
        isDeepStrictEqual(
          actual.slice(index, index + expected.length),
          expected,
        ),
      ))
  )
}
