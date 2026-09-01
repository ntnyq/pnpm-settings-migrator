import type { CompatibilityTarget } from './types'
import { fsWriteFile, pruneNpmrc } from './utils'
import type {
  ParsedPackageJson,
  ResolvedPackageJsonSettings,
} from './utils/config'
import type { MigratableNpmrc } from './utils/npmrc'
import type { ProjectNpmrcMigrations } from './utils/project-npmrc'

/**
 * Files and cleanup policy needed to persist one migration.
 */
export interface PersistMigrationOptions {
  cleanNpmrc: boolean
  cleanPackageJson: boolean
  compatibility: Exclude<CompatibilityTarget, 'auto'>
  npmrc: MigratableNpmrc
  npmrcExists: boolean
  npmrcPath: string
  packageJson: ParsedPackageJson
  packageJsonExists: boolean
  packageJsonPath: string
  packageJsonRuntimeChanged: boolean
  packageJsonSettings: ResolvedPackageJsonSettings
  pnpmWorkspaceContent: string
  pnpmWorkspacePath: string
  projectNpmrcs: ProjectNpmrcMigrations
}

function cleanPackageJsonSettings(
  packageJson: ParsedPackageJson,
  settings: ResolvedPackageJsonSettings,
): boolean {
  let changed = false
  if (packageJson.value.pnpm) {
    for (const key of settings.keys) {
      Reflect.deleteProperty(packageJson.value.pnpm, key)
      changed = true
    }
    if (!Object.keys(packageJson.value.pnpm).length) {
      delete packageJson.value.pnpm
    }
  }

  if (settings.yarnResolutions) {
    changed = true
    delete packageJson.value.resolutions
  }

  return changed
}

/**
 * Persist destinations before pruning any legacy source file.
 *
 * @param options - Destination files, selected sources, and cleanup policy
 *
 * @returns A promise that resolves after destinations and sources are persisted
 */
export async function persistMigration(
  options: PersistMigrationOptions,
): Promise<void> {
  const {
    cleanNpmrc,
    cleanPackageJson,
    compatibility,
    npmrc,
    npmrcExists,
    npmrcPath,
    packageJson,
    packageJsonExists,
    packageJsonPath,
    packageJsonRuntimeChanged,
    packageJsonSettings,
    pnpmWorkspaceContent,
    pnpmWorkspacePath,
    projectNpmrcs,
  } = options
  const packageJsonSettingsChanged =
    packageJsonExists && cleanPackageJson
      ? cleanPackageJsonSettings(packageJson, packageJsonSettings)
      : false

  // A failed destination write can leave duplicates, but source values remain.
  await fsWriteFile(pnpmWorkspacePath, pnpmWorkspaceContent)

  if (
    packageJsonExists &&
    (packageJsonRuntimeChanged || packageJsonSettingsChanged)
  ) {
    await fsWriteFile(
      packageJsonPath,
      JSON.stringify(packageJson.value, null, packageJson.indent),
    )
  }

  if (!cleanNpmrc) {
    return
  }

  const pruneTasks = projectNpmrcs.projects
    .filter(project => project.migratable.keys.length)
    .map(project =>
      pruneNpmrc(project.npmrcPath, compatibility, project.migratable.keys),
    )
  if (npmrcExists && npmrc.keys.length) {
    pruneTasks.push(pruneNpmrc(npmrcPath, compatibility, npmrc.keys))
  }
  await Promise.all(pruneTasks)
}
