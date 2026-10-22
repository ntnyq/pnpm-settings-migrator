import { isDeepStrictEqual } from 'node:util'
import type {
  IncludedWorkspace,
  MigrationSources,
  ParsedPnpmWorkspace,
  ResolveMigrationSourcesOptions,
  WorkspaceFileWrite,
  PnpmWorkspace,
} from '../../types'
import { fsWriteFileIfChanged } from '../../utils/fs'
import { mergeByStrategy } from '../../utils/merge'
import { readIncludedWorkspace } from '../sources/includes/load'
import { resolveMigrationSources } from './sources'

/**
 * Resolve incoming declarations before discovering projects from local includes.
 *
 * @param root - Original root YAML and formatting metadata
 * @param options - Legacy sources, target schema, and conflict strategy
 *
 * @returns Loaded ownership context and sources selected against effective settings
 */
export async function resolveIncludedMigration(
  root: ParsedPnpmWorkspace,
  options: ResolveMigrationSourcesOptions,
): Promise<{
  workspace: IncludedWorkspace
  sources: MigrationSources
  before: PnpmWorkspace
}> {
  const initial = await resolveMigrationSources(options)
  const proposed = mergeByStrategy(
    root.value,
    initial.incomingSettings,
    options.strategy,
  )
  const workspace = await readIncludedWorkspace({
    root,
    cwd: options.cwd,
    target: options.target,
    include: proposed.include,
    configDependencies: proposed.configDependencies,
    strategy: options.strategy,
  })
  const sources =
    workspace.include === undefined
      ? initial
      : await resolveMigrationSources({
          ...options,
          pnpmWorkspace: workspace.value,
        })
  let before = root.value
  if (
    isDeepStrictEqual(root.value.include, workspace.include) &&
    (proposed.configDependencies === undefined ||
      isDeepStrictEqual(
        workspace.value.configDependencies,
        proposed.configDependencies,
      ))
  ) {
    before = workspace.value
  } else if (root.value.include !== undefined) {
    before = (
      await readIncludedWorkspace({
        root,
        cwd: options.cwd,
        target: options.target,
      })
    ).value
  }
  return { workspace, sources, before: structuredClone(before) }
}

/**
 * Write every local owner before legacy source cleanup is allowed.
 *
 * @param files - Rendered local include destinations
 * @returns Absolute paths whose contents changed
 */
export async function persistIncludedWorkspace(
  files: WorkspaceFileWrite[],
): Promise<string[]> {
  const changed: string[] = []
  for (const file of files) {
    if (await fsWriteFileIfChanged(file.path, file.content)) {
      changed.push(file.path)
    }
  }
  return changed
}
