import type { CompatibilityTarget, PackageManagerEngine } from '../types'

/**
 * pnpm major version that introduced the v11 settings schema.
 */
const PNPM_V11_MAJOR = 11

/**
 * pnpm major version that introduced the v12 compatibility target.
 */
const PNPM_V12_MAJOR = 12

/**
 * Resolve a pnpm major from a package manager declaration.
 */
function resolvePnpmMajor(hint: string | undefined): number | undefined {
  const match = hint?.match(/^pnpm@[\s<=>^~]*(?<major>\d+)(?:\.|\s|$)/u)

  return match?.groups?.major ? Number(match.groups.major) : undefined
}

/**
 * Normalize the single-or-array devEngines declaration.
 */
function normalizePackageManagers(
  value: PackageManagerEngine | PackageManagerEngine[] | undefined,
): PackageManagerEngine[] {
  if (Array.isArray(value)) {
    return value
  }

  return value ? [value] : []
}

/**
 * Resolve final compatibility target from user option and package manager hint.
 *
 * @param compatibility - Explicit or automatically detected compatibility target
 * @param packageManager - `packageManager` declaration from `package.json`
 * @param devPackageManager - Package manager declaration from `devEngines`
 *
 * @returns Resolved concrete compatibility target
 */
export function resolveCompatibilityTarget(
  compatibility: CompatibilityTarget,
  packageManager?: string,
  devPackageManager?: PackageManagerEngine | PackageManagerEngine[],
): Exclude<CompatibilityTarget, 'auto'> {
  if (compatibility !== 'auto') {
    return compatibility
  }

  const packageManagerMajor = resolvePnpmMajor(packageManager)
  const devPackageManagers = normalizePackageManagers(devPackageManager)
  const devPackageManagerMajors = devPackageManagers
    .filter(item => item.name === 'pnpm')
    .map(item => resolvePnpmMajor(`pnpm@${item.version ?? ''}`))
    .filter((major): major is number => major !== undefined)
  const major =
    packageManagerMajor ??
    (devPackageManagerMajors.length
      ? Math.max(...devPackageManagerMajors)
      : undefined)

  if (major !== undefined && major >= PNPM_V12_MAJOR) {
    return 'v12'
  }

  return major !== undefined && major >= PNPM_V11_MAJOR ? 'v11' : 'v10'
}
