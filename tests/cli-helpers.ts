import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import process from 'node:process'
import { stripAnsi } from 'consola/utils'
import { build } from 'tsdown'
import { afterAll, beforeAll } from 'vitest'
import { resolve } from '../scripts/utils'

/**
 * Build an isolated CLI once and run it against a test workspace.
 *
 * @param testDir - Absolute path to the isolated migration workspace
 *
 * @returns CLI runner capturing the exit code and terminal output
 */
export function createTestCli(testDir: string) {
  const buildDir = resolve('tests/.tmp-cli-output-build')

  beforeAll(async () => {
    await build({
      config: false,
      entry: ['src/cli.ts'],
      outDir: buildDir,
      platform: 'node',
      dts: false,
      logLevel: 'silent',
    })
  })

  afterAll(async () => {
    await rm(buildDir, { recursive: true, force: true })
  })

  async function runCli(
    ...args: string[]
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolveResult, reject) => {
      const child = spawn(
        process.execPath,
        [`${buildDir}/cli.mjs`, '--cwd', testDir, ...args],
        {
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        },
      )
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => {
        stdout += String(chunk)
      })
      child.stderr.on('data', chunk => {
        stderr += String(chunk)
      })
      child.on('error', reject)
      child.on('close', code =>
        resolveResult({
          code,
          stdout: stripAnsi(stdout),
          stderr: stripAnsi(stderr),
        }),
      )
    })
  }

  return runCli
}
