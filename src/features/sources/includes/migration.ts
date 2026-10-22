import { isDeepStrictEqual } from 'node:util'
import { REPLACEMENT_SETTING_KEYS } from '../../../constants'
import type {
  IncludedWorkspace,
  MergeStrategy,
  NormalizeSettingsOptions,
  NormalizedSettingsResult,
  PnpmWorkspace,
} from '../../../types'
import { containsMigratedValue, mergeByStrategy } from '../../../utils/merge'
import { normalizeIncomingSettings } from '../../compatibility/normalize'
import { mergeIncludedValues } from './load'
import { selectOwnedSettings } from './ownership'

/**
 * Apply a conflict strategy while keeping config dependency slots read-only.
 *
 * @param workspace - Effective settings and their physical owners
 * @param incoming - Legacy source values in workspace-root coordinates
 * @param strategy - Conflict strategy for writable settings
 *
 * @returns Effective merged settings without overriding read-only owners
 */
export function mergeIncludedWorkspace(
  workspace: IncludedWorkspace,
  incoming: PnpmWorkspace,
  strategy: MergeStrategy,
): PnpmWorkspace {
  if (workspace.include === undefined) {
    return mergeByStrategy(workspace.value, incoming, strategy)
  }
  return mergeIncludedValues(
    mergeByStrategy(
      workspace.value,
      selectOwnedSettings(workspace, incoming, false),
      strategy,
    ),
    selectOwnedSettings(workspace, workspace.value, true),
  )
}

/**
 * Normalize root and local settings while preserving installed package entries.
 *
 * @param workspace - Mutable effective settings and ownership context
 * @param options - Existing compatibility normalization options
 *
 * @returns Warnings and whether writable settings changed
 */
export async function normalizeIncludedWorkspace(
  workspace: IncludedWorkspace,
  options: NormalizeSettingsOptions,
): Promise<NormalizedSettingsResult> {
  if (workspace.include === undefined) {
    return normalizeIncomingSettings(workspace.value, options)
  }
  const writable = selectOwnedSettings(workspace, workspace.value, false)
  const before = structuredClone(writable)
  const readonly = selectOwnedSettings(workspace, workspace.value, true)
  const result = await normalizeIncomingSettings(writable, options)
  const normalized = selectOwnedSettings(workspace, writable, false)
  const borrowedReplacements = selectOwnedSettings(workspace, writable, true)
  for (const [key, value] of Object.entries(before)) {
    const replacement = REPLACEMENT_SETTING_KEYS[key]
    if (
      replacement &&
      Object.hasOwn(borrowedReplacements, replacement) &&
      !containsMigratedValue(
        Reflect.get(readonly, replacement),
        Reflect.get(writable, replacement),
      )
    ) {
      Reflect.set(normalized, key, value)
      result.warnings.push(
        `Kept workspace setting ${key}: its replacement ${replacement} is owned by a read-only config dependency.`,
      )
    }
  }
  workspace.value = mergeIncludedValues(normalized, readonly)
  return { ...result, changed: !isDeepStrictEqual(before, normalized) }
}

/**
 * Explain source values that cannot replace an installed or unavailable owner.
 *
 * @param workspace - Effective values including installed package settings
 * @param incoming - Independently normalized source values plus combined settings
 *
 * @returns Diagnostics containing keys only, never configuration values
 */
export function reportReadonlyIncludes(
  workspace: IncludedWorkspace,
  incoming: PnpmWorkspace[],
): string[] {
  if (workspace.include === undefined) {
    return []
  }
  const retained = new Set(
    incoming.flatMap(settings => {
      const requested = selectOwnedSettings(workspace, settings, true)
      return Object.entries(requested).flatMap(([key, value]) => {
        const disabledSkills =
          key === 'skills' &&
          settings.skills?.dirs?.length === 0 &&
          workspace.value.skills?.dirs?.length !== 0
        return !disabledSkills &&
          containsMigratedValue(Reflect.get(workspace.value, key), value)
          ? []
          : [key]
      })
    }),
  )
  return [...retained].map(
    key =>
      `Kept source settings for ${key}: its include owner is a read-only config dependency; install the dependency or update its configuration separately.`,
  )
}
