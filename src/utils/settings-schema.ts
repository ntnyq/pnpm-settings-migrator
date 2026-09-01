import camelcaseKeys from 'camelcase-keys'
import { PNPM_V10_NPMRC_SETTINGS_FIELDS } from '../constants'
import {
  PNPM_PROJECT_REFUSED_SETTINGS,
  PNPM_V11_ONLY_WORKSPACE_SETTINGS,
  PNPM_V11_PACKAGE_CONFIG_FIELDS,
  PNPM_V11_WORKSPACE_SETTINGS_FIELDS,
  PNPM_V12_ONLY_WORKSPACE_SETTINGS,
  PNPM_V12_WORKSPACE_SETTINGS_FIELDS,
} from '../settings-fields'
import type { CompatibilityTarget, PnpmWorkspace } from '../types'

const PNPM_V10_WORKSPACE_SETTINGS_FIELDS: readonly string[] = [
  ...PNPM_V10_NPMRC_SETTINGS_FIELDS,
  'catalog',
  'catalogs',
  'packages',
]

const PROJECT_REFUSED_SETTINGS = new Set(PNPM_PROJECT_REFUSED_SETTINGS)
const PNPM_V11_ONLY_SETTINGS = new Set(PNPM_V11_ONLY_WORKSPACE_SETTINGS)
const PNPM_V11_SETTINGS = new Set(PNPM_V11_WORKSPACE_SETTINGS_FIELDS)
const PNPM_V12_ONLY_SETTINGS = new Set(PNPM_V12_ONLY_WORKSPACE_SETTINGS)
const PNPM_V12_SETTINGS = new Set(PNPM_V12_WORKSPACE_SETTINGS_FIELDS)
const PNPM_V10_SETTINGS = new Set(PNPM_V10_WORKSPACE_SETTINGS_FIELDS)
const REGISTRY_SETTINGS = new Set([
  'namedRegistries',
  'registries',
  'registriesByPrefix',
  'registriesByScope',
  'registry',
  'registryOptionsByUrl',
])
const REGISTRY_CREDENTIAL_KEYS = new Set([
  'auth',
  'authtoken',
  'password',
  'token',
  'tokenhelper',
  'username',
])
const WORKSPACE_SCHEMA_DIRECTIVE = '$schema'

/**
 * Reasons a setting cannot be moved to the selected destination.
 */
export interface SettingsIssues {
  /**
   * Settings recognized by a different pnpm major.
   */
  incompatible: string[]

  /**
   * Settings that must not be controlled by a project manifest.
   */
  refused: string[]

  /**
   * Settings written with a non-canonical manifest spelling.
   */
  nonCamelCase: string[]

  /**
   * Settings recognized by pnpm but unsupported by a narrower destination.
   */
  unsupported: string[]

  /**
   * Registry settings containing credentials or other unsafe URL values.
   */
  unsafe: string[]

  /**
   * Settings not recognized by the selected pnpm major.
   */
  unknown: string[]
}

/**
 * Result of selecting settings for a target workspace schema.
 */
export interface SelectedPnpmSettings {
  /**
   * Original keys selected for migration.
   */
  keys: string[]

  /**
   * Settings safe to write to the target workspace manifest.
   */
  settings: PnpmWorkspace

  /**
   * Settings left in their source, grouped by reason.
   */
  issues: SettingsIssues
}

/**
 * Options for narrowing settings to a specific manifest destination.
 */
export interface SelectPnpmSettingsOptions {
  /**
   * Optional destination-specific subset, such as v11 `packageConfigs`.
   */
  allowedFields?: readonly string[]

  /**
   * Whether source keys use `.npmrc` kebab-case spelling.
   */
  npmrc?: boolean
}

/**
 * Create an empty collection of schema selection issues.
 *
 * @returns Empty issue lists for every supported issue category
 */
export function createSettingsIssues(): SettingsIssues {
  return {
    incompatible: [],
    nonCamelCase: [],
    refused: [],
    unsafe: [],
    unknown: [],
    unsupported: [],
  }
}

function hasUrlCredentials(value: string): boolean {
  try {
    const url = new URL(value)
    return Boolean(url.username || url.password)
  } catch {
    return false
  }
}

function isRegistryCredentialKey(key: string): boolean {
  return REGISTRY_CREDENTIAL_KEYS.has(
    key.replaceAll('-', '').replaceAll('_', '').toLowerCase(),
  )
}

function isUnsafeRegistryUrl(value: string): boolean {
  return value.includes('${') || hasUrlCredentials(value)
}

function containsUnsafeRegistryValue(
  value: unknown,
  checkCredentialKeys = false,
): boolean {
  if (typeof value === 'string') {
    return isUnsafeRegistryUrl(value)
  }

  if (!value || typeof value !== 'object') {
    return false
  }

  return Object.entries(value).some(
    ([key, entryValue]) =>
      (checkCredentialKeys && isRegistryCredentialKey(key)) ||
      isUnsafeRegistryUrl(key) ||
      containsUnsafeRegistryValue(entryValue, true),
  )
}

function resolveCamelCaseKey(key: string): string {
  return Object.keys(camelcaseKeys({ [key]: true }))[0] ?? key
}

function resolveTargetSettings(
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
): ReadonlySet<string> {
  switch (compatibility) {
    case 'v10':
      return PNPM_V10_SETTINGS
    case 'v11':
      return PNPM_V11_SETTINGS
    case 'v12':
      return PNPM_V12_SETTINGS
    default:
      throw new TypeError(`Unsupported compatibility target: ${compatibility}`)
  }
}

function isSettingFromAnotherMajor(
  key: string,
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
): boolean {
  if (compatibility === 'v11') {
    return PNPM_V12_ONLY_SETTINGS.has(key)
  }

  if (compatibility === 'v12') {
    return PNPM_V11_ONLY_SETTINGS.has(key)
  }

  return PNPM_V11_SETTINGS.has(key) || PNPM_V12_SETTINGS.has(key)
}

interface ResolveSettingIssueOptions {
  allowedFields?: ReadonlySet<string>
  compatibility: Exclude<CompatibilityTarget, 'auto'>
  key: string
  npmrc: boolean
  targetSettings: ReadonlySet<string>
  value: unknown
}

function resolveSettingIssue({
  allowedFields,
  compatibility,
  key,
  npmrc,
  targetSettings,
  value,
}: ResolveSettingIssueOptions): keyof SettingsIssues | undefined {
  if (!npmrc && key !== resolveCamelCaseKey(key)) {
    return 'nonCamelCase'
  }
  if (compatibility !== 'v10' && PROJECT_REFUSED_SETTINGS.has(key)) {
    return 'refused'
  }
  if (REGISTRY_SETTINGS.has(key) && containsUnsafeRegistryValue(value)) {
    return 'unsafe'
  }
  if (!targetSettings.has(key)) {
    return isSettingFromAnotherMajor(key, compatibility)
      ? 'incompatible'
      : 'unknown'
  }
  if (allowedFields && !allowedFields.has(key)) {
    return 'unsupported'
  }

  return undefined
}

/**
 * Select settings that are valid for a concrete pnpm workspace schema.
 *
 * Unrecognized, refused, incompatible, and destination-specific unsupported
 * settings are reported but never returned for migration.
 *
 * @param rawSettings - Settings read from a legacy configuration source
 * @param compatibility - Concrete pnpm compatibility target
 * @param options - Source spelling and destination field restrictions
 *
 * @returns Selected settings, original source keys, and rejected field groups
 */
export function selectPnpmSettings(
  rawSettings: Record<string, unknown>,
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
  options: SelectPnpmSettingsOptions = {},
): SelectedPnpmSettings {
  const issues = createSettingsIssues()
  const keys: string[] = []
  const settings: Record<string, unknown> = {}
  const targetSettings = resolveTargetSettings(compatibility)
  const allowedFields = options.allowedFields
    ? new Set(options.allowedFields)
    : undefined

  for (const [originalKey, value] of Object.entries(rawSettings)) {
    const key = options.npmrc ? resolveCamelCaseKey(originalKey) : originalKey
    const issue = resolveSettingIssue({
      allowedFields,
      compatibility,
      key,
      npmrc: Boolean(options.npmrc),
      targetSettings,
      value,
    })

    if (issue) {
      issues[issue].push(originalKey)
    } else {
      keys.push(originalKey)
      settings[key] = value
    }
  }

  return {
    issues,
    keys,
    settings: settings as PnpmWorkspace,
  }
}

function assertPackageConfigFields(settings: PnpmWorkspace): void {
  const { packageConfigs } = settings
  if (packageConfigs === undefined) {
    return
  }

  const allowedFields = new Set(PNPM_V11_PACKAGE_CONFIG_FIELDS)
  const entries: [string, unknown][] = Array.isArray(packageConfigs)
    ? packageConfigs.flatMap((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new TypeError(
            `packageConfigs[${index}] must be an object with a match array.`,
          )
        }

        const { match, ...config } = entry as Record<string, unknown>
        if (
          !Array.isArray(match) ||
          !match.every(projectName => typeof projectName === 'string')
        ) {
          throw new TypeError(
            `packageConfigs[${index}].match must be an array of package names.`,
          )
        }

        return [[`packageConfigs[${index}]`, config]]
      })
    : Object.entries(packageConfigs)

  for (const [name, config] of entries) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new TypeError(`${name} must contain a project settings object.`)
    }

    const unsupported = Object.keys(config).filter(
      key => !allowedFields.has(key),
    )
    if (unsupported.length) {
      throw new TypeError(
        `${name} contains unsupported project settings: ${unsupported
          .map(key => JSON.stringify(key))
          .join(', ')}.`,
      )
    }
  }
}

function formatIssueList(keys: string[]): string {
  return keys.map(key => JSON.stringify(key)).join(', ')
}

/**
 * Assert that an existing workspace manifest matches the selected pnpm major.
 *
 * The migrator refuses to rewrite a manifest containing ignored settings so a
 * migration cannot silently preserve invalid output.
 *
 * @param settings - Existing workspace settings to validate
 * @param compatibility - Concrete pnpm compatibility target
 *
 * @returns Nothing when all settings match the target schema
 *
 * @throws {TypeError} When the manifest contains incompatible settings
 */
export function assertCompatibleWorkspaceSettings(
  settings: PnpmWorkspace,
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
): void {
  if (compatibility === 'v10') {
    return
  }

  const manifestSettings = Object.fromEntries(
    Object.entries(settings).filter(
      ([key]) => key !== WORKSPACE_SCHEMA_DIRECTIVE,
    ),
  )
  const { issues } = selectPnpmSettings(manifestSettings, compatibility)
  const problems: string[] = []

  if (issues.refused.length) {
    problems.push(`refused: ${formatIssueList(issues.refused)}`)
  }
  if (issues.incompatible.length) {
    problems.push(`other pnpm major: ${formatIssueList(issues.incompatible)}`)
  }
  if (issues.nonCamelCase.length) {
    problems.push(`not camelCase: ${formatIssueList(issues.nonCamelCase)}`)
  }
  if (issues.unknown.length) {
    problems.push(`unrecognized: ${formatIssueList(issues.unknown)}`)
  }
  if (issues.unsafe.length) {
    problems.push(`unsafe registry URL: ${formatIssueList(issues.unsafe)}`)
  }

  if (problems.length) {
    throw new TypeError(
      `pnpm-workspace.yaml is incompatible with pnpm ${compatibility.slice(1)} (${problems.join('; ')}).`,
    )
  }

  if (compatibility === 'v11') {
    assertPackageConfigFields(settings)
  }
}
