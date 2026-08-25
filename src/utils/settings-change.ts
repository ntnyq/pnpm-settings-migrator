import { isDeepStrictEqual } from 'node:util'
import consola from 'consola'
import { stringify } from 'yaml'
import type { PnpmWorkspace } from '../types'
import { dim, green, red } from './color'

/**
 * Maximum dynamic-programming cells used for an exact line diff.
 */
const MAX_LCS_CELLS = 1_000_000

/**
 * URL userinfo can contain proxy usernames and passwords. It must never be
 * printed in a migration report.
 */
const URL_USERINFO_PATTERN = /(?<scheme>[a-z][a-z\d+.-]*:\/\/)[^/\s@]+@/giu

/**
 * Classification applied to one rendered settings diff line.
 */
export type SettingsDiffLineKind = 'added' | 'removed' | 'unchanged'

/**
 * Before and after values for one changed root setting.
 */
export interface SettingsChange {
  /**
   * Setting value after migration.
   */
  after: unknown

  /**
   * Setting value before migration.
   */
  before: unknown

  /**
   * Root pnpm setting key.
   */
  key: string
}

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
  const keys = new Set([
    ...Object.keys(beforeSettings),
    ...Object.keys(afterSettings),
  ])

  return Array.from(keys)
    .filter(key => !isDeepStrictEqual(beforeSettings[key], afterSettings[key]))
    .map(key => ({
      after: afterSettings[key],
      before: beforeSettings[key],
      key,
    }))
}

/**
 * Create a bounded-memory diff that retains shared prefixes and suffixes.
 *
 * This fallback deliberately gives up the exact LCS for unusually large
 * settings to keep reporting from exhausting memory after migration writes.
 */
function createLinearLineDiff(
  beforeLines: string[],
  afterLines: string[],
): SettingsDiffLine[] {
  let prefixLength = 0
  const maximumPrefixLength = Math.min(beforeLines.length, afterLines.length)

  while (
    prefixLength < maximumPrefixLength &&
    beforeLines[prefixLength] === afterLines[prefixLength]
  ) {
    prefixLength++
  }

  let suffixLength = 0
  const maximumSuffixLength = maximumPrefixLength - prefixLength
  while (
    suffixLength < maximumSuffixLength &&
    beforeLines[beforeLines.length - suffixLength - 1] ===
      afterLines[afterLines.length - suffixLength - 1]
  ) {
    suffixLength++
  }

  return [
    ...beforeLines
      .slice(0, prefixLength)
      .map(value => ({ kind: 'unchanged' as const, value })),
    ...beforeLines
      .slice(prefixLength, beforeLines.length - suffixLength)
      .map(value => ({ kind: 'removed' as const, value })),
    ...afterLines
      .slice(prefixLength, afterLines.length - suffixLength)
      .map(value => ({ kind: 'added' as const, value })),
    ...beforeLines
      .slice(beforeLines.length - suffixLength)
      .map(value => ({ kind: 'unchanged' as const, value })),
  ]
}

/**
 * Create a line-based diff using the longest common subsequence.
 *
 * @param beforeLines - YAML lines before migration
 * @param afterLines - YAML lines after migration
 *
 * @returns Classified diff lines in display order
 */
function createLineDiff(
  beforeLines: string[],
  afterLines: string[],
): SettingsDiffLine[] {
  if (beforeLines.length * afterLines.length > MAX_LCS_CELLS) {
    return createLinearLineDiff(beforeLines, afterLines)
  }

  const lengths = Array.from({ length: beforeLines.length + 1 }, () =>
    Array<number>(afterLines.length + 1).fill(0),
  )

  for (
    let beforeIndex = beforeLines.length - 1;
    beforeIndex >= 0;
    beforeIndex--
  ) {
    for (
      let afterIndex = afterLines.length - 1;
      afterIndex >= 0;
      afterIndex--
    ) {
      lengths[beforeIndex][afterIndex] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? lengths[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(
              lengths[beforeIndex + 1][afterIndex],
              lengths[beforeIndex][afterIndex + 1],
            )
    }
  }

  const diff: SettingsDiffLine[] = []
  let beforeIndex = 0
  let afterIndex = 0

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      diff.push({ kind: 'unchanged', value: beforeLines[beforeIndex] })
      beforeIndex++
      afterIndex++
    } else if (
      lengths[beforeIndex + 1][afterIndex] >=
      lengths[beforeIndex][afterIndex + 1]
    ) {
      diff.push({ kind: 'removed', value: beforeLines[beforeIndex] })
      beforeIndex++
    } else {
      diff.push({ kind: 'added', value: afterLines[afterIndex] })
      afterIndex++
    }
  }

  while (beforeIndex < beforeLines.length) {
    diff.push({ kind: 'removed', value: beforeLines[beforeIndex] })
    beforeIndex++
  }

  while (afterIndex < afterLines.length) {
    diff.push({ kind: 'added', value: afterLines[afterIndex] })
    afterIndex++
  }

  return diff
}

/**
 * Format one root setting as YAML lines.
 *
 * @param key - Root setting key
 * @param value - Setting value, or `undefined` when the key is absent
 *
 * @returns YAML lines for the setting, or an empty array when absent
 */
function formatSettingLines(key: string, value: unknown): string[] {
  if (value === undefined) {
    return []
  }

  return stringify({ [key]: value })
    .trimEnd()
    .split('\n')
}

/**
 * Remove credentials embedded in URLs while preserving enough context to
 * identify the changed setting.
 *
 * @param value - Rendered YAML diff line
 *
 * @returns Diff line safe to print to a terminal or CI log
 */
function redactUrlCredentials(value: string): string {
  return value.replace(URL_USERINFO_PATTERN, '$<scheme>***@')
}

/**
 * Format a setting change as a GitHub-style YAML diff.
 *
 * @param change - Root setting change to format
 *
 * @returns Classified YAML diff lines
 */
export function createSettingsDiffLines(
  change: SettingsChange,
): SettingsDiffLine[] {
  return createLineDiff(
    formatSettingLines(change.key, change.before),
    formatSettingLines(change.key, change.after),
  ).map(line => ({
    kind: line.kind,
    value: redactUrlCredentials(line.value),
  }))
}

/**
 * Print a summary and GitHub-style YAML diff for every changed setting.
 *
 * @param changes - Root setting changes to report
 *
 * @returns Nothing; output is written through consola
 */
export function reportSettingsChanges(changes: SettingsChange[]): void {
  consola.info(
    `${changes.length} ${changes.length === 1 ? 'setting' : 'settings'} changed`,
  )

  for (const [index, change] of changes.entries()) {
    if (index > 0) {
      consola.log('')
    }

    for (const line of createSettingsDiffLines(change)) {
      if (line.kind === 'added') {
        consola.log(green(`+ ${line.value}`))
      } else if (line.kind === 'removed') {
        consola.log(red(`- ${line.value}`))
      } else {
        consola.log(dim(`  ${line.value}`))
      }
    }
  }
}
