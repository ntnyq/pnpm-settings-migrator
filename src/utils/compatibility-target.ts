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
  devPackageManager?: PackageManagerEngine,
): Exclude<CompatibilityTarget, 'auto'> {
  if (compatibility !== 'auto') {
    return compatibility
  }

  const packageManagerHint =
    packageManager ||
    (devPackageManager?.name === 'pnpm'
      ? `pnpm@${devPackageManager.version}`
      : undefined)
  const match = packageManagerHint?.match(
    /^pnpm@[\s<=>^~]*(?<major>\d+)(?:\.|\s|$)/u,
  )
  const major = Number(match?.groups?.major)

  if (major >= PNPM_V12_MAJOR) {
    return 'v12'
  }

  return major >= PNPM_V11_MAJOR ? 'v11' : 'v10'
}
