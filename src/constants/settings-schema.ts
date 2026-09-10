import { PNPM_V10_NPMRC_SETTINGS_FIELDS } from './pnpm-v10'
import {
  PNPM_V11_ONLY_WORKSPACE_SETTINGS,
  PNPM_V11_WORKSPACE_SETTINGS_FIELDS,
} from './pnpm-v11'
import {
  PNPM_V12_ONLY_WORKSPACE_SETTINGS,
  PNPM_V12_WORKSPACE_SETTINGS_FIELDS,
} from './pnpm-v12'
import { PNPM_PROJECT_REFUSED_SETTINGS } from './settings-fields'

/**
 * Legacy npmrc fields plus manifest-only fields accepted by the v10 selector.
 */
export const PNPM_V10_WORKSPACE_SETTINGS_FIELDS: readonly string[] = [
  ...PNPM_V10_NPMRC_SETTINGS_FIELDS,
  'catalog',
  'catalogs',
  'packages',
]

/**
 * Fields rejected from project manifests for v11 and newer targets.
 */
export const PROJECT_REFUSED_SETTINGS = new Set(PNPM_PROJECT_REFUSED_SETTINGS)

/**
 * Fields reported as incompatible when selecting settings for v12.
 */
export const PNPM_V11_ONLY_SETTINGS = new Set(PNPM_V11_ONLY_WORKSPACE_SETTINGS)

/**
 * Allowed workspace fields for the v11 target.
 */
export const PNPM_V11_SETTINGS = new Set(PNPM_V11_WORKSPACE_SETTINGS_FIELDS)

/**
 * Fields reported as incompatible when selecting settings for v11.
 */
export const PNPM_V12_ONLY_SETTINGS = new Set(PNPM_V12_ONLY_WORKSPACE_SETTINGS)

/**
 * Allowed workspace fields for the v12 target.
 */
export const PNPM_V12_SETTINGS = new Set(PNPM_V12_WORKSPACE_SETTINGS_FIELDS)

/**
 * Proxy aliases whose environment placeholders are ignored in project YAML.
 */
export const PROXY_SETTINGS = new Set([
  'httpProxy',
  'httpsProxy',
  'noProxy',
  'proxy',
  'noproxy',
])

/**
 * Allowed workspace fields for the v10 target.
 */
export const PNPM_V10_SETTINGS = new Set(PNPM_V10_WORKSPACE_SETTINGS_FIELDS)

/**
 * Registry settings inspected for credentials and dynamic URL interpolation.
 */
export const REGISTRY_SETTINGS = new Set([
  'namedRegistries',
  'registries',
  'registriesByPrefix',
  'registriesByScope',
  'registry',
  'registryOptionsByUrl',
])

/**
 * Normalized credential field names that must not move into workspace YAML.
 */
export const REGISTRY_CREDENTIAL_KEYS = new Set([
  'auth',
  'authtoken',
  'password',
  'token',
  'tokenhelper',
  'username',
])

/**
 * Editor schema directive excluded from pnpm setting validation.
 */
export const WORKSPACE_SCHEMA_DIRECTIVE = '$schema'
