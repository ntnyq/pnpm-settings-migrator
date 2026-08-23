import { PNPM_V11_REMOVED_SETTINGS } from '../constants'
import type { CompatibilityTarget, PnpmWorkspace } from '../types'

const PNPM_V11_MAJOR = 11

/**
 * Build v11 `allowBuilds` map from legacy build-script settings.
 */
function collectAllowBuildsFromLegacy(
  incomingSettings: PnpmWorkspace,
): Record<string, boolean> | undefined {
  const allowBuilds: Record<string, boolean> = {}

  for (const name of incomingSettings.onlyBuiltDependencies || []) {
    allowBuilds[name] = true
  }

  for (const name of incomingSettings.ignoredBuiltDependencies || []) {
    allowBuilds[name] = false
  }

  for (const name of incomingSettings.neverBuiltDependencies || []) {
    allowBuilds[name] = false
  }

  return Object.keys(allowBuilds).length ? allowBuilds : undefined
}

/**
 * Normalize incoming settings according to compatibility target.
 */
export function normalizeIncomingSettings(
  incomingSettings: PnpmWorkspace,
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
  replaceDeprecated: boolean,
): void {
  if (compatibility === 'v10' && !replaceDeprecated) {
    return
  }

  if (incomingSettings.allowNonAppliedPatches !== undefined) {
    incomingSettings.allowUnusedPatches ??=
      incomingSettings.allowNonAppliedPatches
  }

  const allowBuildsFromLegacy = collectAllowBuildsFromLegacy(incomingSettings)
  if (allowBuildsFromLegacy) {
    incomingSettings.allowBuilds = {
      ...allowBuildsFromLegacy,
      ...(incomingSettings.allowBuilds || {}),
    }
  }

  for (const key of PNPM_V11_REMOVED_SETTINGS) {
    Reflect.deleteProperty(incomingSettings, key)
  }
}

/**
 * Resolve final compatibility target from user option and package manager hint.
 */
export function resolveCompatibilityTarget(
  compatibility: CompatibilityTarget,
  packageManager?: string,
): Exclude<CompatibilityTarget, 'auto'> {
  if (compatibility !== 'auto') {
    return compatibility
  }

  const match = packageManager?.match(/^pnpm@(?<major>\d+)(?:\.|$)/u)

  return Number(match?.groups?.major) >= PNPM_V11_MAJOR ? 'v11' : 'v10'
}
