import { realpath, stat } from 'node:fs/promises'
import { isPlainObject, isString } from '@ntnyq/utils'
import {
  dirname,
  extname,
  isAbsolute,
  normalize,
  relative,
  resolve,
} from 'pathe'
import { PNPM_V12_15_MINIMUM_VERSION } from '../../../constants'
import type {
  IncludedWorkspace,
  MergeStrategy,
  ParsedPnpmWorkspace,
  PnpmWorkspace,
  ResolvedPnpmTarget,
  WorkspaceSettingsFile,
} from '../../../types'
import { fsReadFile } from '../../../utils/fs'
import { mergeByStrategy } from '../../../utils/merge'
import { supportsMinimumVersion } from '../../compatibility/version'
import { assertCompatibleWorkspaceSettings } from '../../settings/schema'
import { readPnpmWorkspace } from '../config'
import { defineIncludedSettings, reserveIncludedSettings } from './ownership'
import { rebaseIncludedSettings } from './paths'
import {
  assertSingleDefaultCatalog,
  isLocalInclude,
  parseIncludeSettings,
  settingSlot,
} from './selectors'

/**
 * Merge disjoint owners, allowing named catalogs to share their root container.
 *
 * @param existing - Effective settings already loaded
 * @param incoming - Settings from another physical owner
 *
 * @returns Settings with all owners' values represented
 */
export function mergeIncludedValues(
  existing: PnpmWorkspace,
  incoming: PnpmWorkspace,
): PnpmWorkspace {
  return {
    ...existing,
    ...incoming,
    ...(isPlainObject(existing.catalogs) && isPlainObject(incoming.catalogs)
      ? { catalogs: { ...existing.catalogs, ...incoming.catalogs } }
      : {}),
  }
}

/**
 * Read a config dependency's declared YAML entry without executing the package.
 *
 * @param options - Package declaration and writable destination identities
 * @param options.cwd - Workspace root containing installed config dependencies
 * @param options.name - Validated config dependency package name
 * @param options.declaration - Version pinned by the proposed workspace
 * @param options.writableFiles - Physical identities that must not alias this entry
 *
 * @returns Entry metadata, with values only when the declared version is installed
 *
 * @throws {Error} When the manifest, entry path, or entry YAML is invalid
 */
async function readPackageEntry(options: {
  cwd: string
  name: string
  declaration: unknown
  writableFiles: ReadonlySet<string>
}): Promise<{ path: string; parsed?: ParsedPnpmWorkspace } | undefined> {
  const { cwd, name, declaration, writableFiles } = options
  const packageDir = resolve(cwd, 'node_modules/.pnpm-config', name)
  let text = ''
  try {
    text = await fsReadFile(resolve(packageDir, 'package.json'))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  const manifest: unknown = JSON.parse(text)
  const entry =
    isPlainObject(manifest) && isPlainObject(manifest.pnpm)
      ? manifest.pnpm.config
      : undefined
  if (
    !isString(entry) ||
    isAbsolute(entry) ||
    entry.includes(':') ||
    !['.yaml', '.yml'].includes(extname(entry))
  ) {
    throw new TypeError(
      'Included config dependency must declare a package-relative YAML pnpm.config entry.',
    )
  }
  const packageRoot = normalize(await realpath(packageDir))
  const path = normalize(await realpath(resolve(packageDir, entry)))
  const location = relative(packageRoot, path)
  const information = await stat(path, { bigint: true })
  if (
    location === '..' ||
    location.startsWith('../') ||
    isAbsolute(location) ||
    !information.isFile()
  ) {
    throw new TypeError(
      'Included config dependency pnpm.config must resolve to a file inside its package.',
    )
  }
  if (writableFiles.has(`${information.dev}:${information.ino}`)) {
    throw new TypeError(
      'A read-only config dependency entry cannot also be a writable include destination.',
    )
  }
  if (
    !isString(declaration) ||
    !isPlainObject(manifest) ||
    !isString(manifest.version) ||
    declaration.split('+')[0] !== manifest.version.split('+')[0]
  ) {
    return { path }
  }
  return { path, parsed: await readPnpmWorkspace(path, true) }
}

/**
 * Read all physical local owners and reject duplicate files, including symlinks.
 *
 * @param workspace - Context with root and declared includes
 *
 * @returns Physical identities of all writable destinations
 *
 * @throws {Error} When a source is missing, duplicated, or not a regular file
 */
async function readLocalIncludes(
  workspace: IncludedWorkspace,
): Promise<Set<string>> {
  const rootPath = resolve(workspace.cwd, 'pnpm-workspace.yaml')
  const seen = new Set<string>()
  try {
    const root = await stat(rootPath, { bigint: true })
    seen.add(`${root.dev}:${root.ino}`)
  } catch (error) {
    if (
      !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
    ) {
      throw error
    }
  }
  for (const file of workspace.files
    .slice(1)
    .filter(entry => !entry.readonly)) {
    const path = resolve(workspace.cwd, file.source)
    // File identities can exceed Number.MAX_SAFE_INTEGER on Windows.
    const information = await stat(path, { bigint: true })
    const identity = `${information.dev}:${information.ino}`
    if (!information.isFile() || seen.has(identity)) {
      throw new TypeError(
        'include must reference distinct YAML files and cannot include the workspace root.',
      )
    }
    seen.add(identity)
    file.path = normalize(await realpath(path))
    file.parsed = await readPnpmWorkspace(path, true)
  }
  return seen
}

/**
 * Validate and add a physical owner's settings to the effective workspace.
 *
 * @param workspace - Context receiving the file's values
 * @param file - Loaded local or installed package file
 * @param target - Exact schema used to validate the settings
 *
 * @returns Nothing; ownership and effective settings are updated
 */
function applyIncludedFile(
  workspace: IncludedWorkspace,
  file: WorkspaceSettingsFile,
  target: ResolvedPnpmTarget,
): void {
  const settings = file.parsed?.value
  if (!settings) {
    return
  }
  if (Object.hasOwn(settings, 'include')) {
    throw new TypeError(
      'Nested include declarations are not supported by pnpm.',
    )
  }
  assertCompatibleWorkspaceSettings(settings, target)
  defineIncludedSettings(workspace, file)
  const { $schema: _schema, ...values } = settings
  workspace.value = mergeIncludedValues(
    workspace.value,
    file.readonly
      ? values
      : rebaseIncludedSettings(values, file.directory, workspace.cwd),
  )
}

/**
 * Read effective settings while retaining every setting's physical owner.
 *
 * @param options - Root document, target, and proposed declarations
 * @param options.root - Parsed root document with original formatting
 * @param options.cwd - Workspace root
 * @param options.target - Confirmed target schema
 * @param options.include - Include index after applying the selected strategy
 * @param options.configDependencies - Effective proposed config dependency declarations
 * @param options.strategy - Conflict strategy for declarations owned by local includes
 *
 * @returns Effective settings, ownership, and original YAML documents
 *
 * @throws {Error} When an include or effective workspace is invalid
 */
export async function readIncludedWorkspace(options: {
  root: ParsedPnpmWorkspace
  cwd: string
  target: ResolvedPnpmTarget
  include?: PnpmWorkspace['include']
  configDependencies?: PnpmWorkspace['configDependencies']
  strategy?: MergeStrategy
}): Promise<IncludedWorkspace> {
  const { root, cwd, target } = options
  assertCompatibleWorkspaceSettings(root.value, target)
  const proposed = options.include ?? root.value.include
  if (
    proposed !== undefined &&
    !supportsMinimumVersion(target.version, PNPM_V12_15_MINIMUM_VERSION)
  ) {
    throw new TypeError(
      'include requires a confirmed stable pnpm version from 12.15.0.',
    )
  }
  const include =
    proposed === undefined ? undefined : parseIncludeSettings(proposed, target)
  const workspace: IncludedWorkspace = {
    cwd,
    include,
    files: [
      {
        source: 'pnpm-workspace.yaml',
        path: resolve(cwd, 'pnpm-workspace.yaml'),
        directory: cwd,
        readonly: false,
        parsed: root,
      },
    ],
    owners: new Map(),
    value: {
      ...structuredClone(root.value),
      ...(include === undefined ? {} : { include }),
    },
  }
  for (const [source, delegation] of Object.entries(include ?? {})) {
    workspace.files.push({
      source,
      directory: isLocalInclude(source) ? dirname(resolve(cwd, source)) : cwd,
      readonly: !isLocalInclude(source),
      slots: delegation === '*' ? undefined : delegation.map(settingSlot),
    })
  }
  const writableFiles = await readLocalIncludes(workspace)
  reserveIncludedSettings(workspace)
  defineIncludedSettings(workspace, workspace.files[0]!)
  for (const file of workspace.files
    .slice(1)
    .filter(entry => !entry.readonly)) {
    applyIncludedFile(workspace, file, target)
  }
  for (const file of workspace.files.filter(entry => entry.readonly)) {
    const declared: unknown = mergeByStrategy(
      workspace.value,
      options.configDependencies === undefined
        ? {}
        : { configDependencies: options.configDependencies },
      options.strategy ?? 'overwrite',
    ).configDependencies
    if (!isPlainObject(declared) || !Object.hasOwn(declared, file.source)) {
      throw new TypeError(
        'include package sources must name declared config dependencies.',
      )
    }
    const entry = await readPackageEntry({
      cwd,
      name: file.source,
      declaration: declared[file.source],
      writableFiles,
    })
    file.path = entry?.path
    file.parsed = entry?.parsed
    applyIncludedFile(workspace, file, target)
  }
  assertCompatibleWorkspaceSettings(workspace.value, target)
  if (include !== undefined) {
    assertSingleDefaultCatalog(workspace.value)
  }
  return workspace
}
