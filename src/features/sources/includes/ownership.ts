import { isPlainObject } from '@ntnyq/utils'
import type {
  IncludedWorkspace,
  PnpmWorkspace,
  WorkspaceSettingsFile,
} from '../../../types'
import { settingEntries } from './selectors'

/**
 * Find a slot's owner, including reservations of every named catalog.
 *
 * @param workspace - Loaded ownership context
 * @param slot - Canonical setting or catalog slot
 *
 * @returns Explicit owner, or the root for unowned settings
 */
export function findSettingOwner(
  workspace: IncludedWorkspace,
  slot: string,
): WorkspaceSettingsFile {
  const owner =
    workspace.owners.get(slot) ??
    (slot.startsWith('catalog:')
      ? workspace.owners.get('catalog:*')
      : undefined)
  const [root] = workspace.files
  if (!root) {
    throw new TypeError('A workspace must have a root settings file.')
  }
  return owner ?? root
}

/**
 * Test whether a delegation of all catalogs overlaps a specific catalog.
 *
 * @param first - Canonical setting or catalog slot
 * @param second - Slot to compare with the first
 *
 * @returns Whether the two slots share an owner reservation
 */
function slotsOverlap(first: string, second: string): boolean {
  return (
    first === second ||
    (first === 'catalog:*' && second.startsWith('catalog:')) ||
    (second === 'catalog:*' && first.startsWith('catalog:'))
  )
}

/**
 * Reserve listed slots before checking any file's definitions.
 *
 * @param workspace - Context receiving the ownership reservations
 *
 * @returns Nothing; reservations are populated in place
 *
 * @throws {TypeError} When two sources reserve overlapping settings
 */
export function reserveIncludedSettings(workspace: IncludedWorkspace): void {
  for (const file of workspace.files.slice(1)) {
    for (const slot of file.slots ?? []) {
      if (
        [...workspace.owners.keys()].some(existing =>
          slotsOverlap(existing, slot),
        )
      ) {
        throw new TypeError(`include has conflicting ownership for ${slot}.`)
      }
      workspace.owners.set(slot, file)
    }
  }
}

/**
 * Check one file's definitions and record wildcard ownership.
 *
 * @param workspace - Loaded ownership context
 * @param file - File whose original settings are checked
 *
 * @returns Nothing; wildcard definitions are recorded in place
 *
 * @throws {TypeError} When settings are undelegated or have multiple owners
 */
export function defineIncludedSettings(
  workspace: IncludedWorkspace,
  file: WorkspaceSettingsFile,
): void {
  for (const [key, value] of Object.entries(file.parsed?.value ?? {})) {
    for (const [slot] of settingEntries(key, value)) {
      if (
        file.slots &&
        !file.slots.some(allowed => slotsOverlap(allowed, slot))
      ) {
        throw new TypeError(
          `include source ${file.source} defines an undelegated setting ${slot}.`,
        )
      }
      const existing =
        workspace.owners.get(slot) ??
        (slot.startsWith('catalog:')
          ? workspace.owners.get('catalog:*')
          : undefined)
      if (existing && existing !== file) {
        throw new TypeError(`include has conflicting ownership for ${slot}.`)
      }
      workspace.owners.set(slot, file)
    }
  }
}

/**
 * Extract settings owned by writable or read-only files.
 *
 * @param workspace - Effective settings and ownership context
 * @param settings - Settings to partition by ownership
 * @param readonly - Whether to extract the config dependency portion
 *
 * @returns Settings belonging to the requested ownership class
 */
export function selectOwnedSettings(
  workspace: IncludedWorkspace,
  settings: PnpmWorkspace,
  readonly: boolean,
): PnpmWorkspace {
  const selected: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (
      key === 'catalogs' &&
      (value === null || (isPlainObject(value) && !Object.keys(value).length))
    ) {
      if (findSettingOwner(workspace, 'catalog:*').readonly === readonly) {
        selected[key] = structuredClone(value)
      }
    } else if (key === 'catalogs' && isPlainObject(value)) {
      const entries = Object.entries(value).filter(
        ([name]) =>
          findSettingOwner(workspace, `catalog:${name}`).readonly === readonly,
      )
      if (entries.length || (Object.keys(value).length === 0 && !readonly)) {
        selected[key] = Object.fromEntries(entries)
      }
    } else {
      const entries = settingEntries(key, value)
      if (
        entries.length === 0
          ? !readonly
          : entries.every(
              ([slot]) =>
                findSettingOwner(workspace, slot).readonly === readonly,
            )
      ) {
        Object.defineProperty(selected, key, {
          value: structuredClone(value),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
    }
  }
  return selected as PnpmWorkspace
}
