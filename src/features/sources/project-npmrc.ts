import { isArray, unique } from '@ntnyq/utils'
import { resolve, dirname, relative } from 'pathe'
import { glob } from 'tinyglobby'
import {
  PACKAGE_JSON,
  NPMRC,
  PNPM_V11_PACKAGE_CONFIG_FIELDS,
} from '../../constants'
import type {
  PnpmWorkspace,
  ProjectManifestCandidate,
  ReadProjectNpmrcOptions,
  ProjectNpmrcMigrations,
  NpmRC,
  ProjectNpmrcMigration,
} from '../../types'
import { fsExists } from '../../utils/fs'
import { readPackageJson } from './config'
import { readMigratableNpmrc } from './npmrc'

/**
 * Convert workspace directory patterns to manifest globs, preserving exclusions.
 *
 * @param patterns - Workspace package directory patterns
 *
 * @returns Corresponding `package.json` globs in source order
 */
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
  return unique(
    settingsSources.flatMap(settings =>
      isArray(settings.packages) ? settings.packages : [],
    ),
  )
}

/**
 * Discover all named subprojects and report unnamed projects with `.npmrc` files.
 *
 * @param cwd - Workspace root excluded from subproject discovery
 * @param patterns - Workspace package directory patterns
 *
 * @returns Candidates and missing-name warnings in sorted manifest-path order
 *
 * @throws {Error} When manifest discovery, reading, or parsing fails
 */
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
    unique(packageJsonPaths)
      .sort()
      .filter(
        packageJsonPath => resolve(packageJsonPath) !== rootPackageJsonPath,
      )
      .map(async packageJsonPath => {
        const projectDir = dirname(packageJsonPath)
        const npmrcPath = resolve(projectDir, NPMRC)
        const npmrcExists = await fsExists(npmrcPath)
        const packageJson = await readPackageJson(packageJsonPath, true)
        if (!packageJson.value.name) {
          return npmrcExists
            ? {
                warning: `${relative(cwd, npmrcPath)} was kept because its package.json has no name for packageConfigs matching.`,
              }
            : {}
        }

        return {
          candidate: {
            npmrcExists,
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
 * pnpm v11 and v12.4 accept five fields in `packageConfigs`. v12.4 requires
 * separate project lockfiles before these settings can be migrated.
 *
 * @param cwd - Workspace root directory
 * @param patterns - Workspace package patterns used to discover subprojects
 * @param options - Concrete target and effective destination lockfile mode
 *
 * @returns Migratable project settings, source metadata, and warnings
 */
export async function readProjectNpmrcMigrations(
  cwd: string,
  patterns: string[],
  options: ReadProjectNpmrcOptions,
): Promise<ProjectNpmrcMigrations> {
  const { target, sharedWorkspaceLockfile } = options
  const { compatibility } = target
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
    target.workspaceSettings.has('packageConfigs') &&
    (compatibility === 'v11' || sharedWorkspaceLockfile === false)
      ? PNPM_V11_PACKAGE_CONFIG_FIELDS
      : []

  const migrationResults = await Promise.all(
    [...candidatesByName].map(async ([projectName, namedCandidates]) => {
      if (!namedCandidates.some(candidate => candidate.npmrcExists)) {
        return {}
      }
      if (namedCandidates.length > 1) {
        return {
          warning: `Subproject .npmrc files for duplicate package name ${JSON.stringify(projectName)} were kept: ${namedCandidates
            .map(candidate => relative(cwd, candidate.packageJsonPath))
            .join(', ')}.`,
        }
      }

      const [candidate] = namedCandidates
      if (
        target.workspaceSettings.has('packageConfigs') &&
        compatibility !== 'v11' &&
        sharedWorkspaceLockfile !== false
      ) {
        return {
          warning: `${relative(cwd, candidate.npmrcPath)} was kept because pnpm ${target.version?.raw ?? target.compatibility.slice(1)} packageConfigs requires sharedWorkspaceLockfile: false.`,
        }
      }
      const migratable = await readMigratableNpmrc(
        candidate.npmrcPath,
        target,
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
