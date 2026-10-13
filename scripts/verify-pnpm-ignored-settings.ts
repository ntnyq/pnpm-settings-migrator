import assert from 'node:assert/strict'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'

/**
 * Verify source retention and actual pnpm behavior for ignored v12 settings.
 *
 * @param version - Exact pnpm release under verification
 * @param runPnpm - Runner for the selected release in an isolated workspace
 *
 * @returns A promise resolved after configuration and install assertions
 */
export async function verifyIgnoredWorkspaceSettings(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  if (!version.startsWith('12.')) {
    return
  }
  const fixtureDir = await mkdtemp(join(tmpdir(), 'pnpm-ignored-settings-'))
  const manifestPath = join(fixtureDir, 'package.json')
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  const npmrcPath = join(fixtureDir, '.npmrc')
  const settings = {
    production: true,
    dev: false,
    recursive: true,
    lockfileOnly: true,
    force: true,
    depth: 2,
    saveDev: true,
    fetchingConcurrency: 3,
    requiredScripts: ['build'],
    extraBinPaths: ['./bin'],
    extraEnv: { EXAMPLE: 'value' },
    workspacePackagePatterns: ['packages/*'],
  }
  try {
    await mkdir(join(fixtureDir, 'dev-package'))
    await writeFile(
      join(fixtureDir, 'dev-package/package.json'),
      JSON.stringify({ name: 'dev-only', version: '1.0.0' }),
    )
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'ignored-settings',
        packageManager: `pnpm@${version}`,
        devDependencies: { 'dev-only': 'link:./dev-package' },
        pnpm: { ...settings, saveExact: true },
      }),
    )
    await writeFile(npmrcPath, 'production=true\n')
    const result = await migratePnpmSettings({ cwd: fixtureDir })
    assert.ok(result.warnings.some(warning => warning.includes('production')))
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      settings,
    )
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
      saveExact: true,
    })
    assert.equal(await readFile(npmrcPath, 'utf8'), 'production=true\n')

    // Deliberately write the unsupported YAML to verify why migration refuses it.
    await rm(npmrcPath)
    await writeFile(workspacePath, stringify(settings))
    const listed = await runPnpm(version, fixtureDir, [
      'config',
      'list',
      '--json',
    ])
    const config = JSON.parse(listed.stdout)
    for (const key of Object.keys(settings)) {
      assert.equal(
        config[key],
        undefined,
        `${key} should not be read from v12 YAML`,
      )
    }
    await runPnpm(version, fixtureDir, [
      'install',
      '--ignore-scripts',
      '--no-frozen-lockfile',
    ])
    await access(join(fixtureDir, 'node_modules/dev-only'))

    await rm(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    await runPnpm(version, fixtureDir, [
      'install',
      '--prod',
      '--ignore-scripts',
      '--no-frozen-lockfile',
    ])
    await assert.rejects(access(join(fixtureDir, 'node_modules/dev-only')), {
      code: 'ENOENT',
    })
  } finally {
    await rm(fixtureDir, { recursive: true, force: true })
  }
  process.stdout.write(`pnpm ${version} ignored workspace settings verified\n`)
}
