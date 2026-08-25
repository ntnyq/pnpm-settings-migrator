import { defu } from 'defu'
import detectIndent from 'detect-indent'
import { Document, isMap, parseDocument } from 'yaml'
import { DEFAULT_INDENT } from '../constants'
import type { PackageJson, PnpmWorkspace } from '../types'
import { fsReadFile } from './fs'

/**
 * Parsed `package.json` content and its detected indentation.
 */
export interface ParsedPackageJson {
  /**
   * Indentation used by the source JSON file.
   */
  indent: number | string

  /**
   * Parsed package manifest.
   */
  value: PackageJson
}

/**
 * Parsed pnpm workspace content and its detected indentation width.
 */
export interface ParsedPnpmWorkspace {
  /**
   * Parsed YAML document, including comments and source formatting metadata.
   */
  document: Document

  /**
   * Number of spaces used to indent the source YAML file.
   */
  indent: number

  /**
   * Parsed pnpm workspace settings.
   */
  value: PnpmWorkspace
}

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
 *
 * @returns Pnpm workspace settings resolved from the package manifest
 */
export function resolvePackageJsonSettings(
  packageJson: PackageJson,
  yarnResolutions: boolean,
): PnpmWorkspace {
  const pnpmSettings: PnpmWorkspace =
    yarnResolutions && packageJson.resolutions
      ? {
          ...packageJson.pnpm,
          overrides: defu(packageJson.pnpm?.overrides, packageJson.resolutions),
        }
      : { ...packageJson.pnpm }

  if (pnpmSettings.overrides && !Object.keys(pnpmSettings.overrides).length) {
    delete pnpmSettings.overrides
  }

  return pnpmSettings
}
