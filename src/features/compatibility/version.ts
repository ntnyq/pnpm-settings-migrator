import { isString } from '@ntnyq/utils'
import type { CompatibilityTarget, PnpmVersion } from '../../types'

/**
 * Parse an exact SemVer version without accepting ranges or pnpm prefixes.
 *
 * @param value - Version string, optionally containing prerelease/build metadata
 *
 * @returns Parsed components, or undefined for malformed or imprecise versions
 */
export function parsePnpmVersion(value: string): PnpmVersion | undefined {
  const match = value.match(
    /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*))?(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?$/u,
  )
  if (!match?.groups || match[0] !== value) {
    return undefined
  }
  const { major, minor, patch, prerelease } = match.groups
  const components = [Number(major), Number(minor), Number(patch)]
  if (
    !components.every(Number.isSafeInteger) ||
    prerelease?.split('.').some(identifier => /^0\d+$/u.test(identifier))
  ) {
    return undefined
  }
  return {
    raw: value,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease,
  }
}

/**
 * Validate an optional explicit version and its compatibility-major constraint.
 *
 * @param value - Optional exact pnpm version supplied by the user
 * @param compatibility - Requested major schema, or automatic detection
 *
 * @returns Parsed version, or undefined when the option was omitted
 *
 * @throws {TypeError} When the version is malformed or conflicts with the major
 */
export function validateTargetVersion(
  value: string | undefined,
  compatibility: CompatibilityTarget,
): PnpmVersion | undefined {
  if (value === undefined) {
    return undefined
  }
  const version = isString(value) ? parsePnpmVersion(value) : undefined
  if (!version) {
    throw new TypeError(
      `Invalid targetVersion: ${value}. Expected an exact pnpm version such as 12.4.0.`,
    )
  }
  if (
    compatibility !== 'auto' &&
    version.major !== Number(compatibility.slice(1))
  ) {
    throw new TypeError(
      `targetVersion ${value} conflicts with compatibility ${compatibility}.`,
    )
  }
  return version
}

/**
 * Check a stable version against a capability's minimum within the same major.
 *
 * @param version - Confirmed target version, if any
 * @param minimumVersion - First supporting major, minor, and patch
 *
 * @returns Whether the target is confirmed to support this capability
 */
export function supportsMinimumVersion(
  version: PnpmVersion | undefined,
  minimumVersion: readonly [number, number, number],
): boolean {
  if (!version || version.prerelease) {
    return false
  }
  const [major, minor, patch] = minimumVersion
  return (
    version.major === major &&
    (version.minor > minor ||
      (version.minor === minor && version.patch >= patch))
  )
}
