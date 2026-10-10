import assert from 'node:assert/strict'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'

/**
 * Run one selected pnpm release in a temporary workspace.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Verify that v12 filters remain in their sources because YAML does not consume them.
 *
 * @param version - Exact v12 release under verification
 * @param fixtureDir - Temporary workspace reused by the shape fixtures
 * @param runPnpm - Runner for the selected release
 *
 * @returns A promise resolved after retention and upstream config checks
 */
export async function verifyIgnoredFilters(
  version: string,
  fixtureDir: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const settings = { filter: ['app', '!app', 'app'], filterProd: ['other'] }
  const manifestPath = join(fixtureDir, 'package.json')
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: 'ignored-filters',
      packageManager: `pnpm@${version}`,
      pnpm: { saveExact: true, ...settings },
    }),
  )
  const result = await migratePnpmSettings({ cwd: fixtureDir })
  assert.ok(result.warnings.some(warning => warning.includes('filter')))
  assert.deepEqual(
    JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
    settings,
  )
  assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
    saveExact: true,
  })
  await writeFile(workspacePath, stringify(settings))
  const listed = await runPnpm(version, fixtureDir, [
    'config',
    'list',
    '--json',
  ])
  const config = JSON.parse(listed.stdout)
  assert.equal(config.filter, undefined)
  assert.equal(config.filterProd, undefined)
  await rm(workspacePath)
}
