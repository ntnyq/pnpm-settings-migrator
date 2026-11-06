import { isPlainObject, isString } from '@ntnyq/utils'
import {
  OVERRIDE_PACKAGE_NAME_PATTERN,
  PNPM_V12_17_MINIMUM_VERSION,
} from '../../constants'
import type { OverrideGrammar, ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'

/**
 * Check the name, optional version, and dependency group on one selector.
 * Only an asterisk in the package name needs wildcard matching.
 *
 * @param part - Parent or target selector without the parent delimiter
 * @param grammar - Confirmed parser or syntax accepted on both sides of 12.17
 * @param position - Position in a standalone or parent-qualified override
 *
 * @returns Whether pnpm rejects the selector or cannot apply its semantics
 */
function hasIncompatiblePart(
  part: string,
  grammar: OverrideGrammar,
  position: 'parent' | 'child' | 'standalone',
): boolean {
  const selector = part.trim()
  const group = /:(?:prod|optional|peer)$/u.exec(selector)
  const unqualified = group ? selector.slice(0, group.index) : selector
  const delimiter = unqualified.indexOf('@', 1)
  const name = delimiter < 0 ? unqualified : unqualified.slice(0, delimiter)
  const range = delimiter < 0 ? undefined : unqualified.slice(delimiter + 1)

  if (grammar !== 'grouped') {
    // Older readers can match a dependency's literal protocol specifier.
    // For example, foo@npm:peer selects a literal npm alias on older releases
    // but a peer dependency with the "npm" range from 12.17.
    const protocol =
      /^(?:npm|jsr|file|link|workspace|catalog|https?|git(?:\+[^:]+)?|github|gitlab|bitbucket):/u
    const literalSpec = delimiter < 0 ? '' : selector.slice(delimiter + 1)
    const incompatible =
      /[*:]/u.test(name) ||
      (Boolean(group) && (grammar === 'common' || !protocol.test(literalSpec)))
    if (incompatible || grammar === 'legacy') {
      return incompatible
    }
  }
  return (
    !OVERRIDE_PACKAGE_NAME_PATTERN.test(name) ||
    /^(?:node_modules|favicon\.ico)$/iu.test(name) ||
    Boolean(range?.includes(':')) ||
    (Boolean(group) && position === 'parent') ||
    (range === '' &&
      (position !== 'standalone' || Boolean(group) || name.includes('*')))
  )
}

/**
 * Validate one complete override map against the selected release.
 *
 * @param value - Root or per-project override map
 * @param target - Release controlling selector parsing and matching
 *
 * @returns Whether the entire map must stay in its source
 */
function hasInvalidOverrideMap(
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (value === null) {
    return false
  }
  if (!isPlainObject(value)) {
    return true
  }
  let grammar: OverrideGrammar = 'legacy'
  if (supportsMinimumVersion(target.version, PNPM_V12_17_MINIMUM_VERSION)) {
    grammar = 'grouped'
  } else if (
    target.compatibility === 'v12' &&
    (!target.version || target.version.prerelease)
  ) {
    grammar = 'common'
  }
  return Object.entries(value).some(([selector, specifier]) => {
    if (!isString(specifier)) {
      return true
    }
    // pnpm skips range comparators such as pkg@>=1 and pkg@1 || >2.
    const key = selector.trim()
    const parentEnd = key.search(/(?<=[^ |@])>/u)
    if (parentEnd < 0) {
      return hasIncompatiblePart(key, grammar, 'standalone')
    }
    return (
      hasIncompatiblePart(key.slice(0, parentEnd), grammar, 'parent') ||
      hasIncompatiblePart(key.slice(parentEnd + 1), grammar, 'child')
    )
  })
}

/**
 * Check root overrides or the effective overrides of each project entry.
 *
 * @param key - Canonical workspace setting name
 * @param value - Untrusted root setting or per-project settings collection
 * @param target - Selected pnpm release
 *
 * @returns Whether an override map would lose meaning at this target
 */
export function hasIncompatibleOverrides(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (key === 'packageConfigs' && value && typeof value === 'object') {
    return Object.values(value).some(
      entry =>
        isPlainObject(entry) &&
        Object.hasOwn(entry, 'overrides') &&
        hasInvalidOverrideMap(entry.overrides, target),
    )
  }
  return key === 'overrides' && hasInvalidOverrideMap(value, target)
}
