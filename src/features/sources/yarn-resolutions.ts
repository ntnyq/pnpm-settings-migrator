import { YARN_PACKAGE_SELECTOR_PATTERN } from '../../constants'
import type { ResolvedYarnResolutions } from '../../types'

/**
 * Translate plain and global Yarn package selectors, retaining path-specific
 * selectors and conflicting translations for manual migration.
 *
 * @param resolutions - Original Yarn version resolutions
 *
 * @returns Supported overrides, source selector mappings, and retention warnings
 */
export function resolveYarnResolutions(
  resolutions: Record<string, string> = {},
): ResolvedYarnResolutions {
  const result: ResolvedYarnResolutions = {
    overrides: {},
    selectors: {},
    warnings: [],
  }
  const conflictingSelectors = new Set<string>()

  for (const [key, value] of Object.entries(resolutions)) {
    const selector = key.replace(/^\*\*\//u, '')
    if (YARN_PACKAGE_SELECTOR_PATTERN.test(selector)) {
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
