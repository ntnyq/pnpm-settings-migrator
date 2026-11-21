import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'
import { migratePnpmSettings } from '../src'

/**
 * Verify v11 override precedence and refusal of the internal lockfile path.
 * @param version - Exact pnpm release, including the preceding control
 * @param runPnpm - Harness runner for each disposable workspace
 * @returns A promise resolved after migration, config, and frozen install checks
 */
export async function verifyV11OverridePrecedence(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  if (!['11.28.12', '11.28.13'].includes(version)) {
    return
  }
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-v11-overrides-'))
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const lockPath = join(cwd, 'pnpm-lock.yaml')
  const broad = { 'fixture@^1.0.0': 'link:./broad' }
  const narrow = { 'fixture@~1.2.0': 'link:./narrow' }
  const run = (args: string[]) => runPnpm(version, cwd, args)
  try {
    for (const [name, fixtureVersion] of [
      ['broad', '1.3.0'],
      ['narrow', '1.2.1'],
    ] as const) {
      await mkdir(join(cwd, name))
      await writeFile(
        join(cwd, name, 'package.json'),
        JSON.stringify({ name: 'fixture', version: fixtureVersion }),
      )
    }
    for (const narrowFirst of [true, false]) {
      const overrides = narrowFirst
        ? { ...narrow, ...broad }
        : { ...broad, ...narrow }
      await rm(workspacePath, { force: true })
      await rm(lockPath, { force: true })
      await rm(join(cwd, 'node_modules'), { force: true, recursive: true })
      await writeFile(
        manifestPath,
        JSON.stringify({
          name: 'overrides-fixture',
          private: true,
          dependencies: { fixture: '1.2.0' },
          pnpm: { overrides, rawLockfileDir: './unused' },
        }),
      )
      const result = await migratePnpmSettings({
        cwd,
        targetVersion: version,
        sortKeys: true,
      })
      assert.match(result.warnings.join(), /project-refused.*rawLockfileDir/u)
      const migrated = parse(await readFile(workspacePath, 'utf8'))
      assert.deepEqual(
        Object.entries(migrated.overrides),
        Object.entries(overrides),
      )
      assert.equal(migrated.rawLockfileDir, undefined)
      assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')).pnpm, {
        rawLockfileDir: './unused',
      })
      const listed = await run(['config', 'list', '--json'])
      assert.doesNotMatch(
        listed.stderr,
        /unknown.*setting|unrecognized|were ignored/iu,
      )
      assert.deepEqual(JSON.parse(listed.stdout).overrides, overrides)
      await run(['install', '--ignore-scripts', '--no-frozen-lockfile'])
      const installed = JSON.parse(
        await readFile(join(cwd, 'node_modules/fixture/package.json'), 'utf8'),
      )
      assert.equal(
        installed.version,
        narrowFirst && version === '11.28.12' ? '1.3.0' : '1.2.1',
      )
      const lockfile = await readFile(lockPath, 'utf8')
      await run(['install', '--ignore-scripts', '--frozen-lockfile'])
      assert.equal(await readFile(lockPath, 'utf8'), lockfile)
    }
    await writeFile(workspacePath, 'rawLockfileDir: ./from-project\n')
    const native = await run(['config', 'list', '--json'])
    if (version === '11.28.13') {
      assert.match(native.stderr, /cannot be set.*rawLockfileDir/u)
      assert.equal(JSON.parse(native.stdout).rawLockfileDir, undefined)
    } else {
      assert.match(native.stderr, /not recognized.*rawLockfileDir/u)
    }
    process.stdout.write(
      `pnpm ${version} override range precedence and lockfile path scope verified\n`,
    )
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
