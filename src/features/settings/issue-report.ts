import type { FormatSettingsIssuesOptions } from '../../types'

/**
 * Quote retained setting keys for a source-specific warning.
 *
 * @param keys - Original source keys reported by schema selection
 *
 * @returns Comma-separated JSON-quoted setting names
 */
function formatIssueKeys(keys: string[]): string {
  return keys.map(key => JSON.stringify(key)).join(', ')
}

/**
 * Format warnings for settings that were intentionally left in their source.
 *
 * @param options - Retained settings and destination context
 *
 * @returns Warning messages in issue-category order
 */
export function formatSettingsIssues(
  options: FormatSettingsIssuesOptions,
): string[] {
  const { compatibility, issues, projectConfig = false, source } = options
  const warnings: string[] = []
  if (issues.refused.length) {
    warnings.push(
      `Kept project-refused settings in ${source}: ${formatIssueKeys(issues.refused)}. Configure machine settings globally and current-run paths on the command line.`,
    )
  }
  if (issues.incompatible.length) {
    warnings.push(
      `Kept settings in ${source} that are incompatible with pnpm ${compatibility.slice(1)}: ${formatIssueKeys(issues.incompatible)}.`,
    )
  }
  if (issues.nonCamelCase.length) {
    warnings.push(
      `Kept non-camelCase settings in ${source}: ${formatIssueKeys(issues.nonCamelCase)}. Workspace manifest keys must use camelCase.`,
    )
  }
  if (issues.unknown.length) {
    warnings.push(
      `Kept settings in ${source} that pnpm ${compatibility.slice(1)} does not recognize: ${formatIssueKeys(issues.unknown)}.`,
    )
  }
  if (issues.unsupported.length) {
    const destination =
      projectConfig && compatibility === 'v12'
        ? 'pnpm v12 does not support packageConfigs'
        : 'packageConfigs only accepts hoist, modulesDir, overrides, saveExact, and savePrefix'
    warnings.push(
      `Kept subproject settings in ${source}: ${formatIssueKeys(issues.unsupported)}; ${destination}.`,
    )
  }
  if (issues.unsafe.length) {
    warnings.push(
      `Kept unsafe registry settings in ${source}: ${formatIssueKeys(issues.unsafe)}. Remove credentials and dynamic URL interpolation before migrating them.`,
    )
  }
  return warnings
}
