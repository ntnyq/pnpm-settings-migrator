import { resolve } from 'pathe'
import type { PnpmWorkspace } from '../types'
import { fsReadFile } from './fs'

type LegacyBuildDependencyList =
  | 'ignoredBuiltDependencies'
  | 'neverBuiltDependencies'
  | 'onlyBuiltDependencies'

/**
 * Read packages listed by the legacy `onlyBuiltDependenciesFile` setting.
 */
async function readOnlyBuiltDependenciesFile(
  cwd: string,
  file: string | undefined,
): Promise<string[]> {
  if (!file) {
    return []
  }

  const path = resolve(cwd, file)
  const value = JSON.parse(await fsReadFile(path)) as unknown

  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new TypeError(
      `Invalid onlyBuiltDependenciesFile: ${file}. Expected a JSON array of package names.`,
    )
  }

  return value
}

/**
 * Read and validate one legacy build dependency list. Configuration files are
 * external input, so their runtime shape can differ from its declared type.
 */
function readLegacyBuildDependencyList(
  settings: PnpmWorkspace,
  key: LegacyBuildDependencyList,
): string[] {
  const value: unknown = settings[key]
  if (value === undefined) {
    return []
  }

  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    const npmrcKey = key.replace(
      /[A-Z]/gu,
      character => `-${character.toLowerCase()}`,
    )
    throw new TypeError(
      `Invalid ${key}: expected an array of package names. ` +
        `In .npmrc, use ${npmrcKey}[]=<package>.`,
    )
  }

  return value
}

/**
 * Build an `allowBuilds` map from legacy build-script settings.
 */
export async function collectAllowBuildsFromLegacy(
  incomingSettings: PnpmWorkspace,
  cwd: string,
): Promise<Record<string, boolean> | undefined> {
  const allowBuilds: Record<string, boolean> = {}
  const allowed = readLegacyBuildDependencyList(
    incomingSettings,
    'onlyBuiltDependencies',
  )
  const ignored = readLegacyBuildDependencyList(
    incomingSettings,
    'ignoredBuiltDependencies',
  )
  const neverBuilt = readLegacyBuildDependencyList(
    incomingSettings,
    'neverBuiltDependencies',
  )
  const allowedFromFile = await readOnlyBuiltDependenciesFile(
    cwd,
    incomingSettings.onlyBuiltDependenciesFile,
  )

  for (const name of [...allowed, ...allowedFromFile]) {
    allowBuilds[name] = true
  }

  for (const name of ignored) {
    allowBuilds[name] = false
  }

  for (const name of neverBuilt) {
    allowBuilds[name] = false
  }

  return Object.keys(allowBuilds).length ? allowBuilds : undefined
}
