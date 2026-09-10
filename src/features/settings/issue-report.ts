import camelcaseKeys from 'camelcase-keys'
import { PROXY_SETTINGS } from '../../constants'
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
  const { target, issues, projectConfig = false, source } = options
  const version = target.version?.raw ?? target.compatibility.slice(1)
  const warnings: string[] = []
  if (issues.refused.length) {
    warnings.push(
      `Kept project-refused settings in ${source}: ${formatIssueKeys(issues.refused)}. Configure machine settings globally and current-run paths on the command line.`,
    )
  }
  if (issues.incompatible.length) {
    warnings.push(
      `Kept settings in ${source} that are incompatible with pnpm ${version}: ${formatIssueKeys(issues.incompatible)}.`,
    )
  }
  if (issues.nonCamelCase.length) {
    warnings.push(
      `Kept non-camelCase settings in ${source}: ${formatIssueKeys(issues.nonCamelCase)}. Workspace manifest keys must use camelCase.`,
    )
  }
  if (issues.unknown.length) {
    warnings.push(
      `Kept settings in ${source} that pnpm ${version} does not recognize: ${formatIssueKeys(issues.unknown)}.`,
    )
  }
  if (issues.unsupported.length) {
    const destination =
      projectConfig && !target.workspaceSettings.has('packageConfigs')
        ? 'packageConfigs requires a confirmed pnpm 12.4.0 or later stable version for this target'
        : 'packageConfigs only accepts hoist, modulesDir, overrides, saveExact, and savePrefix'
    warnings.push(
      `Kept subproject settings in ${source}: ${formatIssueKeys(issues.unsupported)}; ${destination}.`,
    )
  }
  if (issues.unsafe.length) {
    const proxies = issues.unsafe.filter(key =>
      PROXY_SETTINGS.has(Object.keys(camelcaseKeys({ [key]: true }))[0] ?? key),
    )
    const registries = issues.unsafe.filter(key => !proxies.includes(key))
    if (proxies.length) {
      warnings.push(
        `Kept dynamic proxy settings in ${source}: ${formatIssueKeys(proxies)}. Project workspace configuration does not expand environment placeholders; use trusted global configuration or environment variables.`,
      )
    }
    if (registries.length) {
      warnings.push(
        `Kept unsafe registry settings in ${source}: ${formatIssueKeys(registries)}. Remove credentials and dynamic URL interpolation before migrating them.`,
      )
    }
  }
  return warnings
}
