import type { MigrationResult } from '../types'
import { green, bold } from '../utils/color'
import { formatSettingsChanges } from './settings-diff'

/**
 * Describe the migration outcome, prioritizing settings changes over cleanup.
 *
 * @param result - Completed migration outcome
 *
 * @returns One terminal summary line without a trailing newline
 */
function formatMigrationSummary(result: MigrationResult): string {
  if (!result.hasConfigurationFiles) {
    return 'ℹ No configuration files found.'
  }
  const count = result.settingsChanges.length
  if (count) {
    return `${green('✔')} ${count} ${count === 1 ? 'setting' : 'settings'} changed`
  }
  if (result.packageJsonRuntimeChanged) {
    return `${green('✔')} Migration completed. Node.js runtime updated in package.json.`
  }
  if (result.sourceSettingsCleaned) {
    return `${green('✔')} Migration completed. Source settings cleaned up.`
  }
  if (result.changedFiles.length) {
    return `${green('✔')} Migration completed. Configuration files updated.`
  }
  return 'ℹ No changes needed.'
}

/**
 * Format warnings, one outcome summary, and optional settings details.
 *
 * @param result - Completed migration outcome
 * @param showChanges - Whether to include the settings diff
 *
 * @returns Terminal output with one blank line between blocks and none at its edges
 */
export function formatMigrationOutput(
  result: MigrationResult,
  showChanges = true,
): string {
  const blocks: string[] = []
  if (result.warnings.length) {
    blocks.push(
      result.warnings.map(warning => `${bold('WARN')} ${warning}`).join('\n'),
    )
  }
  blocks.push(formatMigrationSummary(result))
  if (showChanges && result.settingsChanges.length) {
    blocks.push(formatSettingsChanges(result.settingsChanges))
  }
  return blocks.join('\n\n')
}
