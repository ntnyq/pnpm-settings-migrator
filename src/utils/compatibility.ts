import { PNPM_V11_REMOVED_SETTINGS } from '../constants'
import type { CompatibilityTarget, PnpmWorkspace } from '../types'
import { normalizeCurrentAliases } from './deprecated-settings'
import { collectAllowBuildsFromLegacy } from './legacy-build-settings'

/**
 * Legacy build settings that can be replaced for pnpm v10.
 */
const PNPM_REPLACEABLE_IN_V10_SETTINGS: string[] = [
  'allowNonAppliedPatches',
  'ignoredBuiltDependencies',
  'neverBuiltDependencies',
  'onlyBuiltDependencies',
  'onlyBuiltDependenciesFile',
]

/**
 * Result of normalizing pnpm settings for a compatibility target.
 */
export interface NormalizedSettingsResult {
  /**
   * Whether normalization mutated the provided settings.
   */
  changed: boolean

  /**
   * Removed Node.js runtime version that should move to `package.json`.
   */
  runtimeVersion?: string

  /**
   * User-facing compatibility warnings produced during normalization.
   */
  warnings: string[]
}

/**
 * Context required to normalize pnpm settings.
 */
export interface NormalizeSettingsOptions {
  /**
   * Concrete pnpm compatibility target.
   */
  compatibility: Exclude<CompatibilityTarget, 'auto'>

  /**
   * Working directory used to resolve referenced files.
   */
  cwd: string

  /**
   * Whether deprecated settings should be replaced for pnpm v10.
   */
  replaceDeprecated: boolean
}

/**
 * Resolve the pnpm v11 replacement for legacy package-manager settings.
 *
 * @param settings - Settings containing legacy package-manager declarations
 *
 * @returns Resolved `pmOnFail` behavior, or `undefined` when not configured
 */
function resolvePmOnFail(settings: PnpmWorkspace): PnpmWorkspace['pmOnFail'] {
  if (settings.pmOnFail) {
    return settings.pmOnFail
  }

  if (settings.packageManagerStrictVersion === true) {
    return 'error'
  }

  if (settings.packageManagerStrict === false) {
    return 'warn'
  }

  if (settings.managePackageManagerVersions === false) {
    return 'ignore'
  }

  if (settings.managePackageManagerVersions === true) {
    return 'download'
  }

  return undefined
}

/**
 * Rename legacy audit settings while preserving values for manual ID updates.
 *
 * @param settings - Settings whose audit configuration may be normalized
 * @param warnings - Warning collection updated with manual follow-up guidance
 *
 * @returns Nothing; the settings and warning collection are mutated in place
 */
function normalizeAuditConfig(
  settings: PnpmWorkspace,
  warnings: string[],
): void {
  const { auditConfig } = settings
  const ignoreCves = auditConfig?.ignoreCves
  if (!ignoreCves) {
    return
  }

  auditConfig.ignoreGhsas ??= ignoreCves
  Reflect.deleteProperty(auditConfig, 'ignoreCves')
  warnings.push(
    'auditConfig.ignoreCves was renamed to auditConfig.ignoreGhsas; replace each CVE ID with its corresponding GHSA ID.',
  )
}

/**
 * Resolve a removed Node.js runtime setting for migration to `package.json`.
 *
 * @param settings - Settings containing legacy runtime declarations
 * @param warnings - Warning collection updated when declarations conflict
 *
 * @returns Runtime version to migrate, or `undefined` when not configured
 */
function resolveRuntimeVersion(
  settings: PnpmWorkspace,
  warnings: string[],
): string | undefined {
  const { useNodeVersion } = settings
  const executionEnvNodeVersion = settings.executionEnv?.nodeVersion

  if (
    useNodeVersion &&
    executionEnvNodeVersion &&
    useNodeVersion !== executionEnvNodeVersion
  ) {
    warnings.push(
      `Both useNodeVersion (${useNodeVersion}) and executionEnv.nodeVersion (${executionEnvNodeVersion}) were found; useNodeVersion takes precedence.`,
    )
  }

  return useNodeVersion || executionEnvNodeVersion
}

/**
 * Normalize settings according to the selected compatibility target.
 *
 * @param incomingSettings - Settings to normalize in place
 * @param options - Compatibility target and normalization context
 *
 * @returns Normalization result, extracted runtime version, and warnings
 */
export async function normalizeIncomingSettings(
  incomingSettings: PnpmWorkspace,
  options: NormalizeSettingsOptions,
): Promise<NormalizedSettingsResult> {
  const { compatibility, cwd, replaceDeprecated } = options
  const before = JSON.stringify(incomingSettings)
  const warnings: string[] = []

  if (compatibility === 'v10' && !replaceDeprecated) {
    return { changed: false, warnings }
  }

  if (incomingSettings.allowNonAppliedPatches !== undefined) {
    incomingSettings.allowUnusedPatches ??=
      incomingSettings.allowNonAppliedPatches
  }

  const allowBuildsFromLegacy = await collectAllowBuildsFromLegacy(
    incomingSettings,
    cwd,
  )
  if (allowBuildsFromLegacy) {
    incomingSettings.allowBuilds = {
      ...allowBuildsFromLegacy,
      ...(incomingSettings.allowBuilds || {}),
    }
  }

  if (compatibility === 'v10') {
    for (const key of PNPM_REPLACEABLE_IN_V10_SETTINGS) {
      Reflect.deleteProperty(incomingSettings, key)
    }

    return {
      changed: before !== JSON.stringify(incomingSettings),
      warnings,
    }
  }

  const pmOnFail = resolvePmOnFail(incomingSettings)
  if (pmOnFail) {
    incomingSettings.pmOnFail = pmOnFail
  }

  normalizeAuditConfig(incomingSettings, warnings)
  if (replaceDeprecated) {
    normalizeCurrentAliases(incomingSettings, warnings)
  }
  const runtimeVersion = resolveRuntimeVersion(incomingSettings, warnings)

  if (incomingSettings.ignoreDepScripts !== undefined) {
    warnings.push(
      'ignoreDepScripts was removed in pnpm v11 and has no direct replacement.',
    )
  }

  if (incomingSettings.ignorePatchFailures !== undefined) {
    warnings.push(
      'ignorePatchFailures was removed in pnpm v11; patch failures now always throw.',
    )
  }

  for (const key of PNPM_V11_REMOVED_SETTINGS) {
    Reflect.deleteProperty(incomingSettings, key)
  }

  return {
    changed: before !== JSON.stringify(incomingSettings),
    runtimeVersion,
    warnings,
  }
}
