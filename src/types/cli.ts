/**
 * Classification applied to one rendered settings diff line.
 */
export type SettingsDiffLineKind = 'added' | 'removed' | 'unchanged'

/**
 * One classified line in a rendered settings diff.
 */
export interface SettingsDiffLine {
  /**
   * Whether the line was added, removed, or unchanged.
   */
  kind: SettingsDiffLineKind

  /**
   * YAML content without a diff marker.
   */
  value: string
}
