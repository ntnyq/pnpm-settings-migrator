import { relative } from 'pathe'
import { NPMRC, PACKAGE_JSON } from '../../constants'
import type {
  ResolveMigrationSourcesOptions,
  MigrationSources,
} from '../../types'
import { mergeByStrategy } from '../../utils/merge'
import { formatSettingsIssues } from '../settings/issue-report'
import { createSettingsIssues } from '../settings/schema'
import { resolvePackageJsonSettings } from '../sources/config'
import { readMigratableNpmrc } from '../sources/npmrc'
import {
  readProjectNpmrcMigrations,
  collectWorkspacePackagePatterns,
} from '../sources/project-npmrc'

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
