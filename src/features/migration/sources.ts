import camelcaseKeys from 'camelcase-keys'
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
    target,
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
    ? await readMigratableNpmrc(npmrcPath, target)
    : { issues: createSettingsIssues(), keys: [], settings: {} }
  warnings.push(
    ...formatSettingsIssues({
      target,
      issues: npmrc.issues,
      source: NPMRC,
    }),
  )

  const packageJsonSettings = resolvePackageJsonSettings(
    packageJson,
    yarnResolutions,
    target,
  )
  warnings.push(
    ...packageJsonSettings.warnings,
    ...formatSettingsIssues({
      target,
      issues: packageJsonSettings.issues,
      source: `${PACKAGE_JSON}#pnpm`,
    }),
  )

  const baseIncomingSettings = mergeByStrategy(
    packageJsonSettings.settings,
    npmrc.settings,
    'merge',
  )
  const destination = mergeByStrategy(
    pnpmWorkspace,
    baseIncomingSettings,
    strategy,
  )
  if (
    target.compatibility !== 'v11' &&
    target.workspaceSettings.has('packageConfigs') &&
    destination.sharedWorkspaceLockfile !== false
  ) {
    for (const [source, selected] of [
      [NPMRC, npmrc],
      [`${PACKAGE_JSON}#pnpm`, packageJsonSettings],
    ] as const) {
      if (Object.hasOwn(selected.settings, 'packageConfigs')) {
        delete selected.settings.packageConfigs
        selected.keys = selected.keys.filter(
          key =>
            !Object.hasOwn(camelcaseKeys({ [key]: true }), 'packageConfigs'),
        )
        warnings.push(
          `Kept packageConfigs in ${source}: pnpm ${target.version?.raw ?? target.compatibility.slice(1)} requires sharedWorkspaceLockfile: false in the merged workspace.`,
        )
      }
    }
  }
  const projectNpmrcs = await readProjectNpmrcMigrations(
    cwd,
    collectWorkspacePackagePatterns(destination),
    {
      target,
      sharedWorkspaceLockfile: destination.sharedWorkspaceLockfile,
    },
  )
  warnings.push(...projectNpmrcs.warnings)
  for (const project of projectNpmrcs.projects) {
    warnings.push(
      ...formatSettingsIssues({
        target,
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
    incomingSettings: structuredClone(
      mergeByStrategy(packageJsonSettings.settings, npmrcSettings, 'merge'),
    ),
    npmrc,
    packageJson: packageJsonSettings,
    projectNpmrcs,
  }
}
