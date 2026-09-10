/**
 * Modulus that isolates Unix permission bits from a stat mode.
 */
export const FILE_PERMISSION_MODULUS = 0o1000

/**
 * Legacy npm configuration filename used at workspace and project roots.
 */
export const NPMRC = '.npmrc'

/**
 * Package manifest filename used for legacy settings and runtime declarations.
 */
export const PACKAGE_JSON = 'package.json'

/**
 * Workspace manifest filename used as the migration destination.
 */
export const PNPM_WORKSPACE_YAML = 'pnpm-workspace.yaml'

/**
 * Default indent: 2 spaces
 */
export const DEFAULT_INDENT = 2
