import type { MergeStrategy, PackageJson } from '../types'

/**
 * Result of moving a runtime setting into the package manifest.
 */
export interface RuntimeMigrationResult {
  /**
   * Whether the package manifest was mutated.
   */
  changed: boolean

  /**
   * User-facing warning when the runtime setting could not be applied.
   */
  warning?: string
}

/**
 * Move a removed Node.js runtime setting to `package.json#devEngines.runtime`.
 *
 * @param packageJson - Package manifest to update in place
 * @param runtimeVersion - Node.js runtime version extracted from pnpm settings
 *
 * @returns Migration result indicating whether the manifest changed
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
 *
 * @param existingVersion - Runtime version from existing workspace settings
 * @param incomingVersion - Runtime version from incoming settings
 * @param strategy - Merge strategy controlling value precedence
 *
 * @returns Selected runtime version, or `undefined` when neither source has one
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
