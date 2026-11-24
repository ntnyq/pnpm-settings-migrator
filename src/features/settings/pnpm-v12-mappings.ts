import { isArray, isBoolean, isPlainObject, isString } from '@ntnyq/utils'
import {
  PNPM_PYTHON_ARRAY_SETTINGS,
  PNPM_V12_18_MINIMUM_VERSION,
  PNPM_V12_23_MINIMUM_VERSION,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'

/**
 * Detect null non-optional versioning collections and their nested lists.
 *
 * @param value - Untrusted versioning section
 *
 * @returns Whether the 12.18 YAML reader rejects a collection's null value
 */
function hasNullVersioningCollection(value: Record<string, unknown>): boolean {
  if (
    ['fixed', 'epics', 'ignore', 'lanes'].some(field => value[field] === null)
  ) {
    return true
  }
  const { fixed, epics } = value
  return (
    (isArray(fixed) && fixed.some(group => group === null)) ||
    (isArray(epics) &&
      epics.some(epic => isPlainObject(epic) && epic.packages === null))
  )
}

/**
 * Check the whole versioning object when migrating the 12.23 option.
 *
 * @param value - Untrusted section containing includePrivatePackages
 *
 * @returns Whether a field would be rejected or ignored by the reader
 */
function hasInvalidVersioningFields(value: Record<string, unknown>): boolean {
  const stringArray = (entry: unknown): boolean =>
    isArray(entry) && entry.every(isString)
  const optionalEnum = (entry: unknown, variants: string[]): boolean =>
    entry === null ||
    (isString(entry) && (variants.includes(entry) || entry.includes('${')))
  return Object.entries(value).some(([key, entry]) => {
    switch (key) {
      case 'includePrivatePackages':
        return (
          entry !== null &&
          !isBoolean(entry) &&
          !(isString(entry) && entry.includes('${'))
        )
      case 'ignore':
        return !stringArray(entry)
      case 'fixed':
        return !isArray(entry) || !entry.every(stringArray)
      case 'epics':
        return (
          !isArray(entry) ||
          !entry.every(
            epic =>
              isPlainObject(epic) &&
              Object.keys(epic).length === 2 &&
              isString(epic.lead) &&
              stringArray(epic.packages),
          )
        )
      case 'lanes':
        return !isPlainObject(entry) || !Object.values(entry).every(isString)
      case 'maxBump':
        return !optionalEnum(entry, ['patch', 'minor', 'major'])
      case 'changelog':
        return (
          entry !== null &&
          (!isPlainObject(entry) ||
            Object.entries(entry).some(([field, setting]) =>
              field === 'format'
                ? setting !== null && !isString(setting)
                : field !== 'storage' ||
                  !optionalEnum(setting, ['registry', 'repository']),
            ))
        )
      default:
        return true
    }
  })
}

/**
 * Check nested non-optional mappings and lists after pnpm's 12.18 YAML upgrade.
 * Top-level optional settings and optional fields can still be null.
 *
 * @param key - Canonical workspace setting
 * @param value - Incoming or existing workspace value
 * @param target - Resolved major and optional exact release
 *
 * @returns Whether a null entry would make pnpm reject the complete document
 */
export function hasInvalidV12MappingEntries(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (!isPlainObject(value)) {
    return false
  }
  const { version } = target
  if (key === 'versioning' && Object.hasOwn(value, 'includePrivatePackages')) {
    return (
      !supportsMinimumVersion(version, PNPM_V12_23_MINIMUM_VERSION) ||
      hasInvalidVersioningFields(value)
    )
  }
  if (target.compatibility !== 'v12') {
    return false
  }
  // An unconfirmed v12 target must work with both YAML readers.
  if (
    version &&
    version.major === PNPM_V12_18_MINIMUM_VERSION[0] &&
    !version.prerelease &&
    !supportsMinimumVersion(version, PNPM_V12_18_MINIMUM_VERSION)
  ) {
    return false
  }
  if (key === 'python') {
    return PNPM_PYTHON_ARRAY_SETTINGS.some(
      field => Reflect.get(value, field) === null,
    )
  }
  if (key === 'auditConfig') {
    return Reflect.get(value, 'ignoreGhsas') === null
  }
  if (key === 'remoteSideEffectsCache') {
    return Reflect.get(value, 'packages') === null
  }
  if (key === 'versioning') {
    return hasNullVersioningCollection(value)
  }
  if (
    !['tasks', 'pipelines', 'packageExtensions', 'packageConfigs'].includes(key)
  ) {
    return false
  }
  return Object.values(value).some(entry => {
    if (entry === null) {
      return true
    }
    if (key !== 'packageExtensions' || !isPlainObject(entry)) {
      return false
    }
    const metadata: unknown = Reflect.get(entry, 'peerDependenciesMeta')
    return (
      metadata !== null &&
      typeof metadata === 'object' &&
      !isArray(metadata) &&
      Object.values(metadata).some(peer => peer === null)
    )
  })
}
