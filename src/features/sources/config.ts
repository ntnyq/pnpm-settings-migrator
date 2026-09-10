import { defu } from 'defu'
import detectIndent from 'detect-indent'
import { Document, parseDocument, isMap } from 'yaml'
import { DEFAULT_INDENT } from '../../constants'
import type {
  ParsedPackageJson,
  PackageJson,
  ParsedPnpmWorkspace,
  PnpmWorkspace,
  CompatibilityTarget,
  ResolvedPackageJsonSettings,
  CleanPackageJsonSettingsOptions,
} from '../../types'
import { fsReadFile } from '../../utils/fs'
import { selectPnpmSettings } from '../settings/schema'

/**
 * Resolve the indentation width for a YAML document.
 *
 * @param content - Raw YAML content
 *
 * @returns Detected indentation width or the project default
 */
function resolveYamlIndent(content: string): number {
  const detectedIndent = detectIndent(content).amount

  return detectedIndent > 0 ? detectedIndent : DEFAULT_INDENT
}

/**
 * Read and parse a package manifest when it exists.
 *
 * @param path - Absolute path to `package.json`
 * @param exists - Whether the package manifest exists
 *
 * @returns Parsed package manifest and detected indentation
 *
 * @throws {SyntaxError} When the package manifest contains invalid JSON
 */
export async function readPackageJson(
  path: string,
  exists: boolean,
): Promise<ParsedPackageJson> {
  if (!exists) {
    return { indent: DEFAULT_INDENT, value: {} }
  }

  const content = await fsReadFile(path)

  return {
    indent: detectIndent(content).indent,
    value: JSON.parse(content) as PackageJson,
  }
}

/**
 * Read and parse a pnpm workspace manifest when it exists.
 *
 * @param path - Absolute path to `pnpm-workspace.yaml`
 * @param exists - Whether the workspace manifest exists
 *
 * @returns Parsed workspace settings and detected indentation
 *
 * @throws {Error} When the workspace manifest contains invalid YAML
 */
export async function readPnpmWorkspace(
  path: string,
  exists: boolean,
): Promise<ParsedPnpmWorkspace> {
  if (!exists) {
    return {
      document: new Document({}),
      indent: DEFAULT_INDENT,
      value: {},
    }
  }

  const content = await fsReadFile(path)
  const document: Document = parseDocument(content)
  const [parseError] = document.errors

  if (parseError) {
    throw parseError
  }

  const parsedValue = document.toJS() as unknown
  if (parsedValue !== null && !isMap(document.contents)) {
    throw new TypeError('pnpm-workspace.yaml must contain a root mapping.')
  }

  if (parsedValue === null) {
    document.contents = document.createNode({})
  }

  return {
    document,
    indent: resolveYamlIndent(content),
    value: (parsedValue as PnpmWorkspace | null) ?? {},
  }
}

/**
 * Resolve migratable pnpm settings from a package manifest.
 *
 * Yarn resolutions are merged into pnpm overrides when enabled. Empty
 * overrides are removed from the result.
 *
 * @param packageJson - Parsed package manifest
 * @param yarnResolutions - Whether to convert Yarn resolutions to pnpm overrides
 * @param compatibility - Concrete pnpm compatibility target
 *
 * @returns Selected workspace settings and source cleanup metadata
 */
export function resolvePackageJsonSettings(
  packageJson: PackageJson,
  yarnResolutions: boolean,
  compatibility: Exclude<CompatibilityTarget, 'auto'>,
): ResolvedPackageJsonSettings {
  const selected = selectPnpmSettings(
    Object.fromEntries(Object.entries(packageJson.pnpm ?? {})),
    compatibility,
  )
  const migrateYarnResolutions = Boolean(
    yarnResolutions && packageJson.resolutions,
  )
  const pnpmSettings: PnpmWorkspace = migrateYarnResolutions
    ? {
        ...selected.settings,
        overrides: defu(selected.settings.overrides, packageJson.resolutions),
      }
    : { ...selected.settings }

  if (pnpmSettings.overrides && !Object.keys(pnpmSettings.overrides).length) {
    delete pnpmSettings.overrides
  }

  return {
    issues: selected.issues,
    keys: selected.keys,
    settings: pnpmSettings,
    yarnResolutions: migrateYarnResolutions,
  }
}

/**
 * Remove only legacy package settings already applied to their destination.
 *
 * @param options - Parsed manifest, applied source keys, and resolutions status
 *
 * @returns Whether legacy settings were removed from the manifest
 */
export function cleanPackageJsonSettings(
  options: CleanPackageJsonSettingsOptions,
): boolean {
  const { migratedKeys, packageJson, settings, yarnResolutionsApplied } =
    options
  let changed = false
  if (packageJson.value.pnpm) {
    for (const key of migratedKeys) {
      Reflect.deleteProperty(packageJson.value.pnpm, key)
      changed = true
    }
    if (!Object.keys(packageJson.value.pnpm).length) {
      delete packageJson.value.pnpm
    }
  }

  if (settings.yarnResolutions && yarnResolutionsApplied) {
    changed = true
    delete packageJson.value.resolutions
  }

  return changed
}
