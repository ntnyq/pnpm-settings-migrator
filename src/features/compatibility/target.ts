import {
  PNPM_V12_MAJOR,
  PNPM_V11_MAJOR,
  PNPM_V10_SETTINGS,
  PNPM_V11_SETTINGS,
  PNPM_V12_SETTINGS,
  PNPM_SETTINGS_CAPABILITIES,
} from '../../constants'
import type {
  PackageManagerEngine,
  CompatibilityTarget,
  ResolvePnpmTargetOptions,
  ResolvedPnpmTarget,
  PnpmVersion,
} from '../../types'
import {
  parsePnpmVersion,
  validateTargetVersion,
  supportsMinimumVersion,
} from './version'

/**
 * Resolve a pnpm major from a package manager declaration.
 *
 * @param hint - Package manager declaration to inspect
 *
 * @returns Detected pnpm major, or `undefined` when the hint does not match
 */
function resolvePnpmMajor(hint: string | undefined): number | undefined {
  const match = hint?.match(/^pnpm@[\s<=>^~]*(?<major>\d+)(?:\.|\s|$)/u)

  return match?.groups?.major ? Number(match.groups.major) : undefined
}

/**
 * Normalize the single-or-array devEngines declaration.
 *
 * @param value - Optional single or multiple package manager declarations
 *
 * @returns Package manager declarations normalized to an array
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

/**
 * Infer one confirmed version, keeping ambiguous devEngines declarations unknown.
 *
 * @param options - Package manager hints and explicit major selection
 *
 * @returns Exact primary version or an unambiguous exact fallback version
 */
function resolveDeclaredVersion(
  options: ResolvePnpmTargetOptions,
): PnpmVersion | undefined {
  if (resolvePnpmMajor(options.packageManager) !== undefined) {
    return parsePnpmVersion(options.packageManager?.slice('pnpm@'.length) ?? '')
  }
  const declarations = normalizePackageManagers(
    options.devPackageManager,
  ).filter(item => item.name === 'pnpm')
  const [first] = declarations
  if (
    !first?.version ||
    !declarations.every(item => item.version === first.version)
  ) {
    return undefined
  }
  return parsePnpmVersion(first.version)
}

/**
 * Resolve the major schema and version-specific field capabilities once.
 *
 * @param options - Explicit target options and package manager declarations
 *
 * @returns Major, confirmed version, and accepted workspace/task fields
 *
 * @throws {TypeError} When an explicit version is invalid or conflicts with the major
 */
export function resolvePnpmTarget(
  options: ResolvePnpmTargetOptions,
): ResolvedPnpmTarget {
  const explicitVersion = validateTargetVersion(
    options.targetVersion,
    options.compatibility,
  )
  const compatibility = resolveCompatibilityTarget(
    options.compatibility,
    explicitVersion ? `pnpm@${explicitVersion.raw}` : options.packageManager,
    options.devPackageManager,
  )
  const declaredVersion = explicitVersion ?? resolveDeclaredVersion(options)
  const version =
    declaredVersion?.major === Number(compatibility.slice(1))
      ? declaredVersion
      : undefined
  const baseSettings = {
    v10: PNPM_V10_SETTINGS,
    v11: PNPM_V11_SETTINGS,
    v12: PNPM_V12_SETTINGS,
  }
  const workspaceSettings = new Set(baseSettings[compatibility])
  const taskSettings = new Set(['concurrency', 'dependsOn'])
  const supportedCapabilities = PNPM_SETTINGS_CAPABILITIES.filter(capability =>
    supportsMinimumVersion(version, capability.minimumVersion),
  )
  for (const capability of supportedCapabilities) {
    for (const field of capability.workspaceFields) {
      workspaceSettings.add(field)
    }
    for (const field of capability.taskFields) {
      taskSettings.add(field)
    }
  }
  return { compatibility, version, workspaceSettings, taskSettings }
}
