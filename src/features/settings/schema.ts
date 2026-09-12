import camelcaseKeys from 'camelcase-keys'
import {
  REGISTRY_CREDENTIAL_KEYS,
  PNPM_V11_SETTINGS,
  PNPM_V12_SETTINGS,
  PNPM_V12_ONLY_SETTINGS,
  PNPM_V11_ONLY_SETTINGS,
  PROJECT_REFUSED_SETTINGS,
  REGISTRY_SETTINGS,
  PNPM_V11_PACKAGE_CONFIG_FIELDS,
  WORKSPACE_SCHEMA_DIRECTIVE,
  PNPM_VERSIONED_WORKSPACE_SETTINGS,
  PROXY_SETTINGS,
} from '../../constants'
import type {
  SettingsIssues,
  CompatibilityTarget,
  ResolvedPnpmTarget,
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
 * Classify a key absent from the target allowlist as a known cross-version field.
 *
 * @param key - Setting key already found missing from the target schema
 * @param compatibility - Concrete pnpm compatibility target
 *
 * @returns Whether another supported version recognizes the setting
 */
function isSettingFromAnotherVersion(
  key: string,
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
): boolean {
  if (PNPM_VERSIONED_WORKSPACE_SETTINGS.has(key)) {
    return true
  }
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
 * @param options.target - Resolved major and version capabilities
 * @param options.key - Setting key after any `.npmrc` spelling conversion
 * @param options.npmrc - Whether the source permits `.npmrc` spelling
 * @param options.value - Setting value inspected for unsafe registry content
 *
 * @returns Rejection category, or `undefined` when the setting is accepted
 */
function resolveSettingIssue({
  allowedFields,
  target,
  key,
  npmrc,
  value,
}: ResolveSettingIssueOptions): keyof SettingsIssues | undefined {
  const { compatibility, workspaceSettings, taskSettings } = target
  if (!npmrc && key !== resolveCamelCaseKey(key)) {
    return 'nonCamelCase'
  }
  if (compatibility !== 'v10' && PROJECT_REFUSED_SETTINGS.has(key)) {
    return 'refused'
  }
  if (REGISTRY_SETTINGS.has(key) && containsUnsafeRegistryValue(value)) {
    return 'unsafe'
  }
  if (
    PROXY_SETTINGS.has(key) &&
    typeof value === 'string' &&
    value.includes('${')
  ) {
    return 'unsafe'
  }
  if (
    key === 'tasks' &&
    value &&
    typeof value === 'object' &&
    Object.values(value).some(
      task =>
        task &&
        typeof task === 'object' &&
        Object.keys(task).some(field => !taskSettings.has(field)),
    )
  ) {
    return 'incompatible'
  }
  if (!workspaceSettings.has(key)) {
    return isSettingFromAnotherVersion(key, compatibility)
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
 * @param target - Resolved pnpm version and field capabilities
 * @param options - Source spelling and destination field restrictions
 *
 * @returns Selected settings, original source keys, and rejected field groups
 */
export function selectPnpmSettings(
  rawSettings: Record<string, unknown>,
  target: ResolvedPnpmTarget,
  options: SelectPnpmSettingsOptions = {},
): SelectedPnpmSettings {
  const issues = createSettingsIssues()
  const keys: string[] = []
  const settings: Record<string, unknown> = {}
  const allowedFields = options.allowedFields
    ? new Set(options.allowedFields)
    : undefined

  for (const [originalKey, value] of Object.entries(rawSettings)) {
    const key = options.npmrc ? resolveCamelCaseKey(originalKey) : originalKey
    const issue = resolveSettingIssue({
      allowedFields,
      target,
      key,
      npmrc: Boolean(options.npmrc),
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
 * Validate project settings in package-name maps or matcher arrays.
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
  if (!packageConfigs || typeof packageConfigs !== 'object') {
    throw new TypeError(
      'packageConfigs must be a package-name map or matcher array.',
    )
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
 * Assert that an existing workspace manifest matches the selected pnpm version.
 *
 * The migrator refuses to rewrite a manifest containing ignored settings so a
 * migration cannot silently preserve invalid output.
 *
 * @param settings - Existing workspace settings to validate
 * @param target - Resolved pnpm version and field capabilities
 *
 * @returns Nothing when all settings match the target schema
 *
 * @throws {TypeError} When the manifest contains incompatible settings
 */
export function assertCompatibleWorkspaceSettings(
  settings: PnpmWorkspace,
  target: ResolvedPnpmTarget,
): void {
  const { compatibility } = target
  if (compatibility === 'v10') {
    const { issues } = selectPnpmSettings(
      Object.fromEntries(Object.entries(settings)),
      target,
    )
    const unsafeProxies = issues.unsafe.filter(key => PROXY_SETTINGS.has(key))
    if (unsafeProxies.length) {
      throw new TypeError(
        `pnpm-workspace.yaml contains dynamic proxy settings: ${formatIssueList(unsafeProxies)}. Move them to trusted global configuration or environment variables.`,
      )
    }
    return
  }

  const manifestSettings = Object.fromEntries(
    Object.entries(settings).filter(
      ([key]) => key !== WORKSPACE_SCHEMA_DIRECTIVE,
    ),
  )
  const { issues } = selectPnpmSettings(manifestSettings, target)
  const problems: string[] = []

  if (issues.refused.length) {
    problems.push(`refused: ${formatIssueList(issues.refused)}`)
  }
  if (issues.incompatible.length) {
    problems.push(`other pnpm version: ${formatIssueList(issues.incompatible)}`)
  }
  if (issues.nonCamelCase.length) {
    problems.push(`not camelCase: ${formatIssueList(issues.nonCamelCase)}`)
  }
  if (issues.unknown.length) {
    problems.push(`unrecognized: ${formatIssueList(issues.unknown)}`)
  }
  if (issues.unsafe.length) {
    const proxies = issues.unsafe.filter(key => PROXY_SETTINGS.has(key))
    const registries = issues.unsafe.filter(key => !PROXY_SETTINGS.has(key))
    if (registries.length) {
      problems.push(`unsafe registry URL: ${formatIssueList(registries)}`)
    }
    if (proxies.length) {
      problems.push(
        `dynamic proxy settings: ${formatIssueList(proxies)}; move them to trusted global configuration or environment variables`,
      )
    }
  }

  if (problems.length) {
    throw new TypeError(
      `pnpm-workspace.yaml is incompatible with pnpm ${target.version?.raw ?? compatibility.slice(1)} (${problems.join('; ')}).`,
    )
  }

  if (target.workspaceSettings.has('packageConfigs')) {
    assertPackageConfigFields(settings)
  }
}
