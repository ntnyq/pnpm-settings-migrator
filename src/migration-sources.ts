import consola from 'consola'
import { relative } from 'pathe'
import { NPMRC, PACKAGE_JSON } from './constants'
import type { CompatibilityTarget, PackageJson, PnpmWorkspace } from './types'
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
import { reportSettingsIssues } from './utils/settings-issue-report'
import { createSettingsIssues } from './utils/settings-schema'

/**
 * Sources and merged incoming settings resolved for one migration.
 */
export interface MigrationSources {
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
  yarnResolutions: boolean
}

/**
 * Read, schema-filter, report, and merge all legacy settings sources.
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
    yarnResolutions,
  } = options
  const npmrc = npmrcExists
    ? await readMigratableNpmrc(npmrcPath, compatibility)
    : { issues: createSettingsIssues(), keys: [], settings: {} }
  reportSettingsIssues({
    compatibility,
    issues: npmrc.issues,
    source: NPMRC,
  })

  const packageJsonSettings = resolvePackageJsonSettings(
    packageJson,
    yarnResolutions,
    compatibility,
  )
  reportSettingsIssues({
    compatibility,
    issues: packageJsonSettings.issues,
    source: `${PACKAGE_JSON}#pnpm`,
  })

  const baseIncomingSettings = mergeByStrategy(
    packageJsonSettings.settings,
    npmrc.settings,
    'merge',
  )
  const projectNpmrcs = await readProjectNpmrcMigrations(
    cwd,
    collectWorkspacePackagePatterns(pnpmWorkspace, baseIncomingSettings),
    compatibility,
  )
  for (const warning of projectNpmrcs.warnings) {
    consola.warn(warning)
  }
  for (const project of projectNpmrcs.projects) {
    reportSettingsIssues({
      compatibility,
      issues: project.migratable.issues,
      projectConfig: true,
      source: relative(cwd, project.npmrcPath),
    })
  }

  const npmrcSettings = mergeByStrategy(
    npmrc.settings,
    Object.keys(projectNpmrcs.packageConfigs).length
      ? { packageConfigs: projectNpmrcs.packageConfigs }
      : {},
    'merge',
  )

  return {
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
