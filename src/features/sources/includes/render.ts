import { isDeepStrictEqual } from 'node:util'
import { isPlainObject } from '@ntnyq/utils'
import type {
  IncludedWorkspace,
  PnpmWorkspace,
  ResolvedOptions,
  ResolvedPnpmTarget,
  WorkspaceFileWrite,
  WorkspaceSettingsFile,
} from '../../../types'
import {
  formatRootSpacing,
  updateYamlDocument,
} from '../../../utils/yaml-document'
import { assertCompatibleWorkspaceSettings } from '../../settings/schema'
import {
  defineIncludedSettings,
  findSettingOwner,
  reserveIncludedSettings,
} from './ownership'
import { rebaseIncludedSettings } from './paths'
import { assertSingleDefaultCatalog, settingEntries } from './selectors'

/**
 * Partition effective settings into their original or reserved local owners.
 *
 * @param workspace - Physical documents and ownership context
 * @param settings - Final settings in workspace-root coordinates
 *
 * @returns Settings by physical owner, including unchanged read-only entries
 */
function distributeSettings(
  workspace: IncludedWorkspace,
  settings: PnpmWorkspace,
): Map<WorkspaceSettingsFile, PnpmWorkspace> {
  const distributed = new Map(
    workspace.files.map(file => {
      const before = file.parsed?.value ?? {}
      const initial: PnpmWorkspace = file.readonly
        ? structuredClone(before)
        : Object.fromEntries(
            Object.entries(before).filter(
              ([key, value]) =>
                key === '$schema' ||
                (key === 'catalogs' &&
                  (value === null ||
                    (isPlainObject(value) && !Object.keys(value).length))),
            ),
          )
      return [file, initial] as const
    }),
  )
  if (Object.hasOwn(settings, 'include')) {
    distributed.get(workspace.files[0]!)!.include = settings.include
  }
  for (const [key, value] of Object.entries(settings).filter(
    ([name]) => name !== '$schema' && name !== 'include',
  )) {
    if (
      key === 'catalogs' &&
      (value === null || (isPlainObject(value) && !Object.keys(value).length))
    ) {
      const owner = findSettingOwner(workspace, 'catalog:*')
      if (!owner.readonly) {
        Reflect.set(distributed.get(owner)!, key, value)
      }
    }
    for (const [slot, entry] of settingEntries(key, value)) {
      const owner = findSettingOwner(workspace, slot)
      if (!owner.readonly) {
        const destination = distributed.get(owner)!
        if (key === 'catalogs') {
          destination.catalogs = {
            ...destination.catalogs,
            [slot.slice('catalog:'.length)]: entry,
          } as PnpmWorkspace['catalogs']
        } else {
          Object.defineProperty(destination, key, {
            value: entry,
            enumerable: true,
            configurable: true,
            writable: true,
          })
        }
      }
    }
  }
  return distributed
}

/**
 * Return local values to file-relative coordinates, preserving unchanged spelling.
 *
 * @param workspace - Effective settings root
 * @param file - Local owner with original values
 * @param settings - Final owner values in root coordinates
 *
 * @returns Final file-relative values
 */
function localSettings(
  workspace: IncludedWorkspace,
  file: WorkspaceSettingsFile,
  settings: PnpmWorkspace,
): PnpmWorkspace {
  const original = file.parsed!.value
  const effective = rebaseIncludedSettings(
    original,
    file.directory,
    workspace.cwd,
  )
  const rebased = rebaseIncludedSettings(
    settings,
    workspace.cwd,
    file.directory,
  )
  for (const [key, value] of Object.entries(settings)) {
    if (
      Object.hasOwn(original, key) &&
      isDeepStrictEqual(Reflect.get(effective, key), value)
    ) {
      Reflect.set(rebased, key, Reflect.get(original, key))
    }
  }
  return rebased
}

/**
 * Validate every proposed physical destination before serializing any writes.
 *
 * @param workspace - Original documents and ownership
 * @param settings - Final effective settings
 * @param target - Target schema for each local destination
 *
 * @returns File-relative settings by owner
 */
function prepareDestinations(
  workspace: IncludedWorkspace,
  settings: PnpmWorkspace,
  target: ResolvedPnpmTarget,
): Map<WorkspaceSettingsFile, PnpmWorkspace> {
  assertSingleDefaultCatalog(settings)
  const destinations = distributeSettings(workspace, settings)
  const check: IncludedWorkspace = {
    ...workspace,
    owners: new Map(),
    files: workspace.files.map(file => ({ ...file })),
  }
  reserveIncludedSettings(check)
  for (const file of check.files) {
    const original = workspace.files.find(
      entry => entry.source === file.source,
    )!
    const final = destinations.get(original)!
    assertCompatibleWorkspaceSettings(final, target)
    file.parsed &&= { ...file.parsed, value: final }
    defineIncludedSettings(check, file)
    if (!file.readonly) {
      destinations.set(original, localSettings(workspace, original, final))
    }
  }
  const declared: unknown = settings.configDependencies
  for (const file of workspace.files.filter(entry => entry.readonly)) {
    if (!isPlainObject(declared) || !Object.hasOwn(declared, file.source)) {
      throw new TypeError(
        'include package sources must remain declared config dependencies.',
      )
    }
  }
  return destinations
}

/**
 * Serialize writable include owners without materializing borrowed settings.
 *
 * @param workspace - Loaded owners and original YAML documents
 * @param settings - Final effective settings in root coordinates
 * @param options - Target schema and formatting preferences
 * @param options.target - Confirmed pnpm target
 * @param options.sortKeys - Whether to sort each changed YAML document
 * @param options.newlineBetween - Whether root keys have blank separators
 *
 * @returns Root and local YAML writes, all rendered before source cleanup
 */
export function renderIncludedWorkspace(
  workspace: IncludedWorkspace,
  settings: PnpmWorkspace,
  options: Pick<ResolvedOptions, 'sortKeys' | 'newlineBetween'> & {
    target: ResolvedPnpmTarget
  },
): WorkspaceFileWrite[] {
  const destinations = prepareDestinations(workspace, settings, options.target)
  return workspace.files
    .filter(file => !file.readonly)
    .map(file => {
      const parsed = file.parsed!
      const after = destinations.get(file)!
      const unchanged = isDeepStrictEqual(after, parsed.value)
      if (!unchanged) {
        updateYamlDocument(parsed.document, {
          before: parsed.value,
          after,
          sortKeys: options.sortKeys,
        })
        formatRootSpacing(parsed.document, options.newlineBetween)
      }
      return {
        path: file.path!,
        content:
          unchanged && parsed.content !== undefined
            ? parsed.content
            : parsed.document.toString({ indent: parsed.indent }),
      }
    })
}
