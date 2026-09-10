/**
 * Removed settings retained in their source because no replacement is applied.
 */
export const SETTINGS_WITHOUT_REPLACEMENT = new Set([
  'ignoreDepScripts',
  'ignorePatchFailures',
])

/**
 * Legacy-to-current setting keys used to verify replacements before cleanup.
 */
export const REPLACEMENT_SETTING_KEYS: Readonly<Record<string, string>> = {
  allowNonAppliedPatches: 'allowUnusedPatches',
  auditConfig: 'audit',
  auditLevel: 'audit',
  cleanupUnusedCatalogs: 'catalogPrune',
  enableGlobalVirtualStore: 'virtualStoreType',
  ignoredBuiltDependencies: 'allowBuilds',
  managePackageManagerVersions: 'pmOnFail',
  namedRegistries: 'registries',
  neverBuiltDependencies: 'allowBuilds',
  onlyBuiltDependencies: 'allowBuilds',
  onlyBuiltDependenciesFile: 'allowBuilds',
  packageManagerStrict: 'pmOnFail',
  packageManagerStrictVersion: 'pmOnFail',
  remoteSideEffectsCache: 'sideEffectsCache',
  sideEffectsCacheReadonly: 'sideEffectsCache',
  updateConfig: 'update',
}
