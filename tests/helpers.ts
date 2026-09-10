import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { afterEach, beforeEach } from 'vitest'
import { parse } from 'yaml'
import { resolve } from '../scripts/utils'
import { fsReadFile } from '../src/utils/fs'

/**
 * Create isolated file helpers for one test file.
 *
 * @param scope - Unique suffix used for the temporary workspace directory
 *
 * @returns Test lifecycle hooks and file helpers for the isolated workspace
 */
export function createTestWorkspace(scope: string) {
  const testDir = resolve(`tests/.tmp-${scope}`)

  beforeEach(async () => {
    await rm(testDir, { force: true, recursive: true })
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { force: true, recursive: true })
  })

  /**
   * Read a UTF-8 file from the isolated test workspace.
   *
   * @param name - File path relative to the test workspace
   *
   * @returns File contents without parsing
   */
  async function readWorkspaceFile(name: string): Promise<string> {
    return fsReadFile(join(testDir, name))
  }

  /**
   * Parse the migrated workspace manifest for settings assertions.
   *
   * @returns Workspace settings read from `pnpm-workspace.yaml`
   */
  async function readWorkspaceYaml(): Promise<Record<string, any>> {
    const content = await fsReadFile(join(testDir, 'pnpm-workspace.yaml'))
    return parse(content) as Record<string, any>
  }

  /**
   * Write the root `.npmrc` fixture without normalizing its contents.
   *
   * @param content - Raw npm configuration used by the test
   *
   * @returns A promise that resolves after the fixture is written
   */
  async function writeNpmrc(content: string): Promise<void> {
    await writeFile(join(testDir, '.npmrc'), content)
  }

  /**
   * Write a workspace fixture, creating parent directories for subprojects.
   *
   * @param name - File path relative to the test workspace
   * @param content - Raw fixture contents
   *
   * @returns A promise that resolves after the fixture is written
   */
  async function writeWorkspaceFile(
    name: string,
    content: string,
  ): Promise<void> {
    const path = join(testDir, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  }

  /**
   * Serialize the root package manifest with test-controlled indentation.
   *
   * @param data - Package manifest fixture to serialize
   * @param indent - Number of spaces used for JSON indentation
   *
   * @returns A promise that resolves after the manifest is written
   */
  async function writePackageJson(data: unknown, indent = 2): Promise<void> {
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify(data, null, indent),
    )
  }

  /**
   * Write raw workspace YAML for migration and formatting assertions.
   *
   * @param content - Workspace manifest fixture, including comments and spacing
   *
   * @returns A promise that resolves after the manifest is written
   */
  async function writeWorkspaceYaml(content: string): Promise<void> {
    await writeFile(join(testDir, 'pnpm-workspace.yaml'), content)
  }

  return {
    testDir,

    writeNpmrc,
    writePackageJson,
    writeWorkspaceFile,
    writeWorkspaceYaml,
    readWorkspaceFile,
    readWorkspaceYaml,
  }
}
