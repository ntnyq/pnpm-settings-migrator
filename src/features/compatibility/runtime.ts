import { toArray } from '@ntnyq/utils'
import type {
  PackageJson,
  RuntimeMigrationResult,
  MergeStrategy,
} from '../../types'

/**
 * Move a removed Node.js runtime setting to `package.json#devEngines.runtime`.
 *
 * @param packageJson - Package manifest to update in place
 * @param runtimeVersion - Node.js runtime version extracted from pnpm settings
 *
 * @returns Whether the runtime is represented and whether the manifest changed
 */
export function migrateRuntimeToPackageJson(
  packageJson: PackageJson,
  runtimeVersion: string | undefined,
): RuntimeMigrationResult {
  if (!runtimeVersion) {
    return { applied: false, changed: false }
  }

  if (packageJson.devEngines?.runtime) {
    const runtimes = toArray(packageJson.devEngines.runtime)
    const nodeRuntimes = runtimes.filter(runtime => runtime.name === 'node')
    if (
      nodeRuntimes.length &&
      nodeRuntimes.every(runtime => runtime.version === runtimeVersion)
    ) {
      return { applied: true, changed: false }
    }

    return {
      applied: false,
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

  return { applied: true, changed: true }
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
