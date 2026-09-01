import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { afterEach, beforeEach } from 'vitest'
import { parse } from 'yaml'
import { resolve } from '../scripts/utils'
import { fsReadFile } from '../src/utils'

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

  async function readWorkspaceFile(name: string): Promise<string> {
    return fsReadFile(join(testDir, name))
  }

  async function readWorkspaceYaml(): Promise<Record<string, any>> {
    const content = await fsReadFile(join(testDir, 'pnpm-workspace.yaml'))
    return parse(content) as Record<string, any>
  }

  async function writeNpmrc(content: string): Promise<void> {
    await writeFile(join(testDir, '.npmrc'), content)
  }

  async function writeWorkspaceFile(
    name: string,
    content: string,
  ): Promise<void> {
    const path = join(testDir, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  }

  async function writePackageJson(data: unknown, indent = 2): Promise<void> {
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify(data, null, indent),
    )
  }

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
