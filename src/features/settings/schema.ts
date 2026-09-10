import camelcaseKeys from 'camelcase-keys'
import {
  REGISTRY_CREDENTIAL_KEYS,
  PNPM_V10_SETTINGS,
  PNPM_V11_SETTINGS,
  PNPM_V12_SETTINGS,
  PNPM_V12_ONLY_SETTINGS,
  PNPM_V11_ONLY_SETTINGS,
  PROJECT_REFUSED_SETTINGS,
  REGISTRY_SETTINGS,
  PNPM_V11_PACKAGE_CONFIG_FIELDS,
  WORKSPACE_SCHEMA_DIRECTIVE,
} from '../../constants'
import type {
  SettingsIssues,
  CompatibilityTarget,
  ResolveSettingIssueOptions,
  SelectPnpmSettingsOptions,
  SelectedPnpmSettings,
  PnpmWorkspace,
} from '../../types'

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

/**
 * Detect embedded user information in a parseable URL.
 *
 * @param value - Potential registry URL
 *
 * @returns Whether URL parsing succeeds and exposes a username or password
 */
function hasUrlCredentials(value: string): boolean {
  try {
    const url = new URL(value)
    return Boolean(url.username || url.password)
  } catch {
    return false
  }
}

/**
 * Match credential fields regardless of case, hyphens, or underscores.
 *
 * @param key - Registry declaration field name
 *
 * @returns Whether the normalized key identifies credential configuration
 */
function isRegistryCredentialKey(key: string): boolean {
  return REGISTRY_CREDENTIAL_KEYS.has(
    key.replaceAll('-', '').replaceAll('_', '').toLowerCase(),
  )
}

/**
 * Detect registry strings that embed credentials or environment placeholders.
 *
 * @param value - Registry URL or declaration key to inspect
 *
 * @returns Whether the string must stay out of the workspace manifest
 */
function isUnsafeRegistryUrl(value: string): boolean {
  return value.includes('${') || hasUrlCredentials(value)
}

/**
 * Inspect nested registry declarations for unsafe URLs and credential fields.
 *
 * @param value - Registry setting value or nested declaration
 * @param checkCredentialKeys - Whether field names at this level are credentials
 *
 * @returns Whether any nested value or key is unsafe to migrate
 */
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

/**
 * Resolve the manifest spelling used to select an incoming setting.
 *
 * @param key - Original setting key
 *
 * @returns CamelCase key, falling back to the original if conversion is empty
 */
function resolveCamelCaseKey(key: string): string {
  return Object.keys(camelcaseKeys({ [key]: true }))[0] ?? key
}

/**
 * Select the workspace allowlist for a concrete compatibility target.
 *
 * @param compatibility - Concrete pnpm compatibility target
 *
 * @returns Lookup of settings accepted by the target schema
 *
 * @throws {TypeError} When the target is unsupported
 */
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

/**
 * Classify a key absent from the target allowlist as a known cross-version field.
 *
 * @param key - Setting key already found missing from the target schema
 * @param compatibility - Concrete pnpm compatibility target
 *
 * @returns Whether another supported major recognizes the setting
 */
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

/**
 * Resolve the first reason a setting cannot be migrated to its destination.
 *
 * @param options - Setting spelling, value, target schema, and field restrictions
 * @param options.allowedFields - Optional destination-specific allowlist
 * @param options.compatibility - Concrete pnpm compatibility target
 * @param options.key - Setting key after any `.npmrc` spelling conversion
 * @param options.npmrc - Whether the source permits `.npmrc` spelling
 * @param options.targetSettings - Workspace allowlist for the target
 * @param options.value - Setting value inspected for unsafe registry content
 *
 * @returns Rejection category, or `undefined` when the setting is accepted
 */
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

/**
 * Validate v11 project settings in package-name maps or matcher arrays.
 *
 * @param settings - Workspace settings whose `packageConfigs` entries are checked
 *
 * @returns Nothing when project settings are absent or valid
 *
 * @throws {TypeError} When an entry has an invalid shape or unsupported fields
 */
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

/**
 * Quote setting keys for an existing-workspace validation error.
 *
 * @param keys - Rejected setting names in discovery order
 *
 * @returns Comma-separated JSON-quoted setting names
 */
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
