import { relative } from 'pathe'
import { NPMRC, PACKAGE_JSON } from './constants'
import type {
  CompatibilityTarget,
  MergeStrategy,
  PackageJson,
  PnpmWorkspace,
} from './types'
import {
  resolvePackageJsonSettings,
  type ResolvedPackageJsonSettings,
} from './utils/config'
import { mergeByStrategy } from './utils/merge'
import { readMigratableNpmrc, type MigratableNpmrc } from './utils/npmrc'
import {
  collectWorkspacePackagePatterns,
  readProjectNpmrcMigrations,
  type ProjectNpmrcMigrations,
} from './utils/project-npmrc'
import { formatSettingsIssues } from './utils/settings-issue-report'
import { createSettingsIssues } from './utils/settings-schema'

/**
 * Sources and merged incoming settings resolved for one migration.
 */
export interface MigrationSources {
  warnings: string[]
  incomingSettings: PnpmWorkspace
  npmrc: MigratableNpmrc
  packageJson: ResolvedPackageJsonSettings
  projectNpmrcs: ProjectNpmrcMigrations
}

/**
 * Context needed to collect legacy settings sources.
 */
export interface ResolveMigrationSourcesOptions {
  compatibility: Exclude<CompatibilityTarget, 'auto'>
  cwd: string
  npmrcExists: boolean
  npmrcPath: string
  packageJson: PackageJson
  pnpmWorkspace: PnpmWorkspace
  strategy: MergeStrategy
  yarnResolutions: boolean
}

/**
 * Read, schema-filter, and merge legacy settings while collecting warnings.
 *
 * @param options - Migration target and source configuration
 *
 * @returns Resolved source metadata and merged incoming settings
 */
export async function resolveMigrationSources(
  options: ResolveMigrationSourcesOptions,
): Promise<MigrationSources> {
  const {
    compatibility,
    cwd,
    npmrcExists,
    npmrcPath,
    packageJson,
    pnpmWorkspace,
    strategy,
    yarnResolutions,
  } = options
  const warnings: string[] = []
  const npmrc = npmrcExists
    ? await readMigratableNpmrc(npmrcPath, compatibility)
    : { issues: createSettingsIssues(), keys: [], settings: {} }
  warnings.push(
    ...formatSettingsIssues({
      compatibility,
      issues: npmrc.issues,
      source: NPMRC,
    }),
  )

  const packageJsonSettings = resolvePackageJsonSettings(
    packageJson,
    yarnResolutions,
    compatibility,
  )
  warnings.push(
    ...formatSettingsIssues({
      compatibility,
      issues: packageJsonSettings.issues,
      source: `${PACKAGE_JSON}#pnpm`,
    }),
  )

  const baseIncomingSettings = mergeByStrategy(
    packageJsonSettings.settings,
    npmrc.settings,
    'merge',
  )
  const projectNpmrcs = await readProjectNpmrcMigrations(
    cwd,
    collectWorkspacePackagePatterns(
      mergeByStrategy(pnpmWorkspace, baseIncomingSettings, strategy),
    ),
    compatibility,
  )
  warnings.push(...projectNpmrcs.warnings)
  for (const project of projectNpmrcs.projects) {
    warnings.push(
      ...formatSettingsIssues({
        compatibility,
        issues: project.migratable.issues,
        projectConfig: true,
        source: relative(cwd, project.npmrcPath),
      }),
    )
  }

  const npmrcSettings = mergeByStrategy(
    npmrc.settings,
    Object.keys(projectNpmrcs.packageConfigs).length
      ? { packageConfigs: projectNpmrcs.packageConfigs }
      : {},
    'merge',
  )

  return {
    warnings,
    incomingSettings: mergeByStrategy(
      packageJsonSettings.settings,
      npmrcSettings,
      'merge',
    ),
    npmrc,
    packageJson: packageJsonSettings,
    projectNpmrcs,
  }
}
