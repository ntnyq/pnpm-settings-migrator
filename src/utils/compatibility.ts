import { resolve } from 'pathe'
import { PNPM_V11_REMOVED_SETTINGS } from '../constants'
import type {
  CompatibilityTarget,
  MergeStrategy,
  PackageJson,
  PnpmWorkspace,
} from '../types'
import { fsReadFile } from './fs'

const PNPM_REPLACEABLE_IN_V10_SETTINGS: string[] = [
  'allowNonAppliedPatches',
  'ignoredBuiltDependencies',
  'neverBuiltDependencies',
  'onlyBuiltDependencies',
  'onlyBuiltDependenciesFile',
]

export interface NormalizedSettingsResult {
  changed: boolean
  runtimeVersion?: string
  warnings: string[]
}

export interface NormalizeSettingsOptions {
  compatibility: Exclude<CompatibilityTarget, 'auto'>
  cwd: string
  replaceDeprecated: boolean
}

export interface RuntimeMigrationResult {
  changed: boolean
  warning?: string
}

/**
 * Read packages listed by the legacy `onlyBuiltDependenciesFile` setting.
 */
async function readOnlyBuiltDependenciesFile(
  cwd: string,
  file: string | undefined,
): Promise<string[]> {
  if (!file) {
    return []
  }

  const path = resolve(cwd, file)
  const value = JSON.parse(await fsReadFile(path)) as unknown

  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new TypeError(
      `Invalid onlyBuiltDependenciesFile: ${file}. Expected a JSON array of package names.`,
    )
  }

  return value
}

/**
 * Build an `allowBuilds` map from legacy build-script settings.
 */
async function collectAllowBuildsFromLegacy(
  incomingSettings: PnpmWorkspace,
  cwd: string,
): Promise<Record<string, boolean> | undefined> {
  const allowBuilds: Record<string, boolean> = {}
  const allowedFromFile = await readOnlyBuiltDependenciesFile(
    cwd,
    incomingSettings.onlyBuiltDependenciesFile,
  )

  for (const name of [
    ...(incomingSettings.onlyBuiltDependencies || []),
    ...allowedFromFile,
  ]) {
    allowBuilds[name] = true
  }

  for (const name of incomingSettings.ignoredBuiltDependencies || []) {
    allowBuilds[name] = false
  }

  for (const name of incomingSettings.neverBuiltDependencies || []) {
    allowBuilds[name] = false
  }

  return Object.keys(allowBuilds).length ? allowBuilds : undefined
}

/**
 * Resolve the pnpm v11 replacement for legacy package-manager settings.
 */
function resolvePmOnFail(settings: PnpmWorkspace): PnpmWorkspace['pmOnFail'] {
  if (settings.pmOnFail) {
    return settings.pmOnFail
  }

  if (settings.packageManagerStrictVersion === true) {
    return 'error'
  }

  if (settings.packageManagerStrict === false) {
    return 'warn'
  }

  if (settings.managePackageManagerVersions === false) {
    return 'ignore'
  }

  if (settings.managePackageManagerVersions === true) {
    return 'download'
  }

  return undefined
}

/**
 * Rename legacy audit settings while preserving values for manual ID updates.
 */
function normalizeAuditConfig(
  settings: PnpmWorkspace,
  warnings: string[],
): void {
  const { auditConfig } = settings
  const ignoreCves = auditConfig?.ignoreCves
  if (!ignoreCves) {
    return
  }

  auditConfig.ignoreGhsas ??= ignoreCves
  Reflect.deleteProperty(auditConfig, 'ignoreCves')
  warnings.push(
    'auditConfig.ignoreCves was renamed to auditConfig.ignoreGhsas; replace each CVE ID with its corresponding GHSA ID.',
  )
}

/**
 * Resolve a removed Node.js runtime setting for migration to `package.json`.
 */
function resolveRuntimeVersion(
  settings: PnpmWorkspace,
  warnings: string[],
): string | undefined {
  const { useNodeVersion } = settings
  const executionEnvNodeVersion = settings.executionEnv?.nodeVersion

  if (
    useNodeVersion &&
    executionEnvNodeVersion &&
    useNodeVersion !== executionEnvNodeVersion
  ) {
    warnings.push(
      `Both useNodeVersion (${useNodeVersion}) and executionEnv.nodeVersion (${executionEnvNodeVersion}) were found; useNodeVersion takes precedence.`,
    )
  }

  return useNodeVersion || executionEnvNodeVersion
}

/**
 * Normalize settings according to the selected compatibility target.
 */
export async function normalizeIncomingSettings(
  incomingSettings: PnpmWorkspace,
  options: NormalizeSettingsOptions,
): Promise<NormalizedSettingsResult> {
  const { compatibility, cwd, replaceDeprecated } = options
  const before = JSON.stringify(incomingSettings)
  const warnings: string[] = []

  if (compatibility === 'v10' && !replaceDeprecated) {
    return { changed: false, warnings }
  }

  if (incomingSettings.allowNonAppliedPatches !== undefined) {
    incomingSettings.allowUnusedPatches ??=
      incomingSettings.allowNonAppliedPatches
  }

  const allowBuildsFromLegacy = await collectAllowBuildsFromLegacy(
    incomingSettings,
    cwd,
  )
  if (allowBuildsFromLegacy) {
    incomingSettings.allowBuilds = {
      ...allowBuildsFromLegacy,
      ...(incomingSettings.allowBuilds || {}),
    }
  }

  if (compatibility === 'v10') {
    for (const key of PNPM_REPLACEABLE_IN_V10_SETTINGS) {
      Reflect.deleteProperty(incomingSettings, key)
    }

    return {
      changed: before !== JSON.stringify(incomingSettings),
      warnings,
    }
  }

  const pmOnFail = resolvePmOnFail(incomingSettings)
  if (pmOnFail) {
    incomingSettings.pmOnFail = pmOnFail
  }

  normalizeAuditConfig(incomingSettings, warnings)
  const runtimeVersion = resolveRuntimeVersion(incomingSettings, warnings)

  if (incomingSettings.ignoreDepScripts !== undefined) {
    warnings.push(
      'ignoreDepScripts was removed in pnpm v11 and has no direct replacement.',
    )
  }

  if (incomingSettings.ignorePatchFailures !== undefined) {
    warnings.push(
      'ignorePatchFailures was removed in pnpm v11; patch failures now always throw.',
    )
  }

  for (const key of PNPM_V11_REMOVED_SETTINGS) {
    Reflect.deleteProperty(incomingSettings, key)
  }

  return {
    changed: before !== JSON.stringify(incomingSettings),
    runtimeVersion,
    warnings,
  }
}

/**
 * Move a removed Node.js runtime setting to `package.json#devEngines.runtime`.
 */
export function migrateRuntimeToPackageJson(
  packageJson: PackageJson,
  runtimeVersion: string | undefined,
): RuntimeMigrationResult {
  if (!runtimeVersion) {
    return { changed: false }
  }

  if (packageJson.devEngines?.runtime) {
    return {
      changed: false,
      warning:
        'A devEngines.runtime declaration already exists; the removed pnpm Node.js runtime setting was not applied.',
    }
  }

  packageJson.devEngines = {
    ...packageJson.devEngines,
    runtime: {
      name: 'node',
      version: runtimeVersion,
    },
  }

  return { changed: true }
}

/**
 * Select the runtime setting that wins under the configured merge strategy.
 */
export function resolveRuntimeVersionByStrategy(
  existingVersion: string | undefined,
  incomingVersion: string | undefined,
  strategy: MergeStrategy,
): string | undefined {
  if (strategy === 'overwrite') {
    return incomingVersion ?? existingVersion
  }

  return existingVersion ?? incomingVersion
}
