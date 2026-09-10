/**
 * Legacy build settings that can be replaced for pnpm v10.
 */
export const PNPM_REPLACEABLE_IN_V10_SETTINGS: string[] = [
  'allowNonAppliedPatches',
  'ignoredBuiltDependencies',
  'neverBuiltDependencies',
  'onlyBuiltDependencies',
  'onlyBuiltDependenciesFile',
]

/**
 * pnpm major version that introduced the v11 settings schema.
 */
export const PNPM_V11_MAJOR = 11

/**
 * pnpm major version that introduced the v12 compatibility target.
 */
export const PNPM_V12_MAJOR = 12
