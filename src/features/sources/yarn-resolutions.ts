import { YARN_PACKAGE_SELECTOR_PATTERN } from '../../constants'
import type { ResolvedPnpmTarget, ResolvedYarnResolutions } from '../../types'
import { hasIncompatibleOverrides } from '../settings/overrides'

/**
 * Translate plain and global Yarn package selectors, retaining path-specific
 * selectors and conflicting translations for manual migration.
 *
 * @param target - Release that must accept each translated override
 * @param resolutions - Original Yarn version resolutions
 * @param retainedOverrides - Explicit pnpm overrides that must stay in the source
 *
 * @returns Supported overrides, source selector mappings, and retention warnings
 */
export function resolveYarnResolutions(
  target: ResolvedPnpmTarget,
  resolutions: Record<string, string> = {},
  retainedOverrides?: Record<string, string>,
): ResolvedYarnResolutions {
  const result: ResolvedYarnResolutions = {
    overrides: {},
    selectors: {},
    warnings: [],
  }
  const conflictingSelectors = new Set<string>()

  for (const [key, value] of Object.entries(resolutions)) {
    const selector = key.replace(/^\*\*\//u, '')
    if (retainedOverrides && Object.hasOwn(retainedOverrides, selector)) {
      result.warnings.push(
        `Kept Yarn resolution ${JSON.stringify(key)} in package.json because its explicit pnpm override was retained.`,
      )
    } else if (
      YARN_PACKAGE_SELECTOR_PATTERN.test(selector) &&
      !hasIncompatibleOverrides('overrides', { [selector]: value }, target)
    ) {
      result.selectors[key] = selector
      if (
        Object.hasOwn(result.overrides, selector) &&
        result.overrides[selector] !== value
      ) {
        conflictingSelectors.add(selector)
      }
      result.overrides[selector] = value
    } else {
      result.warnings.push(
        `Kept Yarn resolution ${JSON.stringify(key)} in package.json: its selector cannot be translated safely to pnpm overrides.`,
      )
    }
  }

  for (const [key, selector] of Object.entries(result.selectors)) {
    if (conflictingSelectors.has(selector)) {
      Reflect.deleteProperty(result.selectors, key)
      Reflect.deleteProperty(result.overrides, selector)
      result.warnings.push(
        `Kept Yarn resolution ${JSON.stringify(key)} in package.json: multiple resolutions translate to ${JSON.stringify(selector)} with conflicting values.`,
      )
    }
  }

  return result
}
