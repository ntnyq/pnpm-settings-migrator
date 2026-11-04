import { unique } from '@ntnyq/utils'
import type { PnpmWorkspace, SettingsChange } from '../../types'
import { isSameSetting } from '../../utils/setting-value'

/**
 * Collect changed root settings between two workspace configurations.
 *
 * @param before - Workspace settings before migration
 * @param after - Workspace settings after migration
 *
 * @returns Changed root settings with their before and after values
 */
export function collectSettingsChanges(
  before: PnpmWorkspace,
  after: PnpmWorkspace,
): SettingsChange[] {
  const beforeSettings: Record<string, unknown> = { ...before }
  const afterSettings: Record<string, unknown> = { ...after }
  const keys = unique([
    ...Object.keys(beforeSettings),
    ...Object.keys(afterSettings),
  ])

  return keys
    .filter(key => !isSameSetting(key, beforeSettings[key], afterSettings[key]))
    .map(key => ({
      after: afterSettings[key],
      before: beforeSettings[key],
      key,
    }))
}
