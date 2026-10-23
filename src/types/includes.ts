import type { ParsedPnpmWorkspace } from './config'
import type { PnpmIncludeSettings } from './pnpm-v12'
import type { PnpmWorkspace } from './workspace'

/**
 * One writable local file or read-only installed config dependency.
 */
export interface WorkspaceSettingsFile {
  /**
   * Include source as declared, or the root workspace filename.
   */
  source: string
  /**
   * Absolute destination path; absent when a config dependency is not installed.
   */
  path?: string
  /**
   * Directory against which the file's relative settings are measured.
   */
  directory: string
  /**
   * Installed config dependencies must never be rewritten.
   */
  readonly: boolean
  /**
   * Explicitly delegated slots; undefined means the local wildcard form.
   */
  slots?: string[]
  /**
   * Parsed file and formatting metadata, absent for unavailable packages.
   */
  parsed?: ParsedPnpmWorkspace
}

/**
 * Effective settings with their physical owners and original YAML documents.
 */
export interface IncludedWorkspace {
  /**
   * Workspace root used for effective path coordinates.
   */
  cwd: string
  /**
   * Root, local includes, and config dependencies in declaration order.
   */
  files: WorkspaceSettingsFile[]
  /**
   * Explicit reservations and implicit wildcard definitions, indexed by slot.
   */
  owners: Map<string, WorkspaceSettingsFile>
  /**
   * Root-only include declaration preserved without flattening it.
   */
  include?: PnpmIncludeSettings
  /**
   * Merged settings with local paths expressed from the workspace root.
   */
  value: PnpmWorkspace
}

/**
 * A rendered destination written before any source cleanup.
 */
export interface WorkspaceFileWrite {
  /**
   * Absolute physical file path.
   */
  path: string
  /**
   * Serialized YAML retaining the source file's formatting metadata.
   */
  content: string
}
