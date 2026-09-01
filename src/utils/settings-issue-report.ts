import consola from 'consola'
import type { CompatibilityTarget } from '../types'
import type { SettingsIssues } from './settings-schema'

/**
 * Context used to report settings retained in their source.
 */
export interface ReportSettingsIssuesOptions {
  /**
   * Concrete target used to explain cross-version settings.
   */
  compatibility: Exclude<CompatibilityTarget, 'auto'>

  /**
   * Issues produced by schema selection.
   */
  issues: SettingsIssues

  /**
   * Whether the destination is a v11 `packageConfigs` entry.
   */
  projectConfig?: boolean

  /**
   * User-facing source file or property name.
   */
  source: string
}

function formatIssueKeys(keys: string[]): string {
  return keys.map(key => JSON.stringify(key)).join(', ')
}

/**
 * Report settings that were intentionally left in their source.
 *
 * @param options - Retained settings and destination context
 *
 * @returns Nothing; warnings are written through consola
 */
export function reportSettingsIssues(
  options: ReportSettingsIssuesOptions,
): void {
  const { compatibility, issues, projectConfig = false, source } = options
  if (issues.refused.length) {
    consola.warn(
      `Kept project-refused settings in ${source}: ${formatIssueKeys(issues.refused)}. Configure machine settings globally and current-run paths on the command line.`,
    )
  }
  if (issues.incompatible.length) {
    consola.warn(
      `Kept settings in ${source} that are incompatible with pnpm ${compatibility.slice(1)}: ${formatIssueKeys(issues.incompatible)}.`,
    )
  }
  if (issues.nonCamelCase.length) {
    consola.warn(
      `Kept non-camelCase settings in ${source}: ${formatIssueKeys(issues.nonCamelCase)}. Workspace manifest keys must use camelCase.`,
    )
  }
  if (issues.unknown.length) {
    consola.warn(
      `Kept settings in ${source} that pnpm ${compatibility.slice(1)} does not recognize: ${formatIssueKeys(issues.unknown)}.`,
    )
  }
  if (issues.unsupported.length) {
    const destination =
      projectConfig && compatibility === 'v12'
        ? 'pnpm v12 does not support packageConfigs'
        : 'packageConfigs only accepts hoist, modulesDir, overrides, saveExact, and savePrefix'
    consola.warn(
      `Kept subproject settings in ${source}: ${formatIssueKeys(issues.unsupported)}; ${destination}.`,
    )
  }
  if (issues.unsafe.length) {
    consola.warn(
      `Kept unsafe registry settings in ${source}: ${formatIssueKeys(issues.unsafe)}. Remove credentials and dynamic URL interpolation before migrating them.`,
    )
  }
}
