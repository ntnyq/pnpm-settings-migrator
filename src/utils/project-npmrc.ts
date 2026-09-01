import { dirname, relative, resolve } from 'pathe'
import { glob } from 'tinyglobby'
import { NPMRC, PACKAGE_JSON } from '../constants'
import { PNPM_V11_PACKAGE_CONFIG_FIELDS } from '../settings-fields'
import type { CompatibilityTarget, NpmRC, PnpmWorkspace } from '../types'
import { readPackageJson } from './config'
import { fsExists } from './fs'
import { readMigratableNpmrc, type MigratableNpmrc } from './npmrc'

/**
 * A subproject `.npmrc` inspected for `packageConfigs` migration.
 */
export interface ProjectNpmrcMigration {
  /**
   * Parsed settings and keys selected for this project.
   */
  migratable: MigratableNpmrc

  /**
   * Absolute path to the project's `.npmrc`.
   */
  npmrcPath: string

  /**
   * Package name used as the `packageConfigs` key.
   */
  projectName: string
}

/**
 * Result of collecting all subproject `.npmrc` files in a workspace.
 */
export interface ProjectNpmrcMigrations {
  /**
   * Settings keyed by package name, ready to merge into `packageConfigs`.
   */
  packageConfigs: Record<string, NpmRC>

  /**
   * Per-file metadata used for warnings and safe cleanup.
   */
  projects: ProjectNpmrcMigration[]

  /**
   * Discovery warnings that leave source files untouched.
   */
  warnings: string[]
}

interface ProjectManifestCandidate {
  npmrcPath: string
  packageJsonPath: string
  projectName: string
}

function resolvePackageJsonPatterns(patterns: string[]): string[] {
  return patterns.map(pattern => {
    const negated = pattern.startsWith('!')
    const workspacePattern = (negated ? pattern.slice(1) : pattern).replace(
      /\/+$/u,
      '',
    )
    const packageJsonPattern =
      workspacePattern === '.'
        ? PACKAGE_JSON
        : `${workspacePattern}/${PACKAGE_JSON}`

    return negated ? `!${packageJsonPattern}` : packageJsonPattern
  })
}

/**
 * Collect unique workspace package patterns from multiple settings sources.
 *
 * @param settingsSources - Workspace settings that may declare package patterns
 *
 * @returns Unique package patterns in source order
 */
export function collectWorkspacePackagePatterns(
  ...settingsSources: PnpmWorkspace[]
): string[] {
  return [
    ...new Set(
      settingsSources.flatMap(settings =>
        Array.isArray(settings.packages) ? settings.packages : [],
      ),
    ),
  ]
}

async function readProjectManifestCandidates(
  cwd: string,
  patterns: string[],
): Promise<{ candidates: ProjectManifestCandidate[]; warnings: string[] }> {
  if (!patterns.some(pattern => !pattern.startsWith('!'))) {
    return { candidates: [], warnings: [] }
  }

  const rootPackageJsonPath = resolve(cwd, PACKAGE_JSON)
  const packageJsonPaths = await glob(resolvePackageJsonPatterns(patterns), {
    absolute: true,
    cwd,
    dot: true,
    ignore: ['**/node_modules/**'],
    onlyFiles: true,
  })
  const candidateResults = await Promise.all(
    [...new Set(packageJsonPaths)]
      .sort()
      .filter(
        packageJsonPath => resolve(packageJsonPath) !== rootPackageJsonPath,
      )
      .map(async packageJsonPath => {
        const projectDir = dirname(packageJsonPath)
        const npmrcPath = resolve(projectDir, NPMRC)
        if (!(await fsExists(npmrcPath))) {
          return {}
        }

        const packageJson = await readPackageJson(packageJsonPath, true)
        if (!packageJson.value.name) {
          return {
            warning: `${relative(cwd, npmrcPath)} was kept because its package.json has no name for packageConfigs matching.`,
          }
        }

        return {
          candidate: {
            npmrcPath,
            packageJsonPath,
            projectName: packageJson.value.name,
          },
        }
      }),
  )
  const candidates: ProjectManifestCandidate[] = []
  const warnings: string[] = []
  for (const result of candidateResults) {
    if (result.candidate) {
      candidates.push(result.candidate)
    }
    if (result.warning) {
      warnings.push(result.warning)
    }
  }

  return { candidates, warnings }
}

/**
 * Collect supported settings from subproject `.npmrc` files.
 *
 * pnpm v11 accepts five fields in `packageConfigs`. pnpm v12 does not support
 * `packageConfigs`, so its subproject settings are only reported and retained.
 *
 * @param cwd - Workspace root directory
 * @param patterns - Workspace package patterns used to discover subprojects
 * @param compatibility - Concrete pnpm compatibility target
 *
 * @returns Migratable project settings, source metadata, and warnings
 */
export async function readProjectNpmrcMigrations(
  cwd: string,
  patterns: string[],
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
): Promise<ProjectNpmrcMigrations> {
  if (compatibility === 'v10') {
    return { packageConfigs: {}, projects: [], warnings: [] }
  }

  const { candidates, warnings } = await readProjectManifestCandidates(
    cwd,
    patterns,
  )
  const candidatesByName = new Map<string, ProjectManifestCandidate[]>()
  for (const candidate of candidates) {
    const namedCandidates = candidatesByName.get(candidate.projectName) ?? []
    namedCandidates.push(candidate)
    candidatesByName.set(candidate.projectName, namedCandidates)
  }

  const packageConfigs: Record<string, NpmRC> = {}
  const projects: ProjectNpmrcMigration[] = []
  const allowedFields =
    compatibility === 'v11' ? PNPM_V11_PACKAGE_CONFIG_FIELDS : []

  const migrationResults = await Promise.all(
    [...candidatesByName].map(async ([projectName, namedCandidates]) => {
      if (namedCandidates.length > 1) {
        return {
          warning: `Subproject .npmrc files for duplicate package name ${JSON.stringify(projectName)} were kept: ${namedCandidates
            .map(candidate => relative(cwd, candidate.packageJsonPath))
            .join(', ')}.`,
        }
      }

      const [candidate] = namedCandidates
      const migratable = await readMigratableNpmrc(
        candidate.npmrcPath,
        compatibility,
        { allowedFields },
      )
      return {
        project: {
          migratable,
          npmrcPath: candidate.npmrcPath,
          projectName,
        },
      }
    }),
  )

  for (const result of migrationResults) {
    if (result.warning) {
      warnings.push(result.warning)
    }
    if (result.project) {
      projects.push(result.project)
      if (result.project.migratable.keys.length) {
        packageConfigs[result.project.projectName] =
          result.project.migratable.settings
      }
    }
  }

  return {
    packageConfigs,
    projects,
    warnings,
  }
}
