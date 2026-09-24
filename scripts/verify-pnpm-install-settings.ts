import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'
import { migratePnpmSettings } from '../src'

/**
 * Verify pnpm 12.6 settings are read and consumed by real project commands.
 *
 * @param version - Exact pnpm v12 release from 12.6 onward
 * @param runPnpm - Runner for the selected release in an isolated workspace
 *
 * @returns A promise resolved after installation, task execution, and cleanup
 */
export async function verifyInstallSettings(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'pnpm-settings-install-'))
  const manifestPath = join(fixtureDir, 'package.json')
  const lockfilePath = join(fixtureDir, 'pnpm-lock.yaml')
  const manifest = {
    name: 'install-settings',
    version: '1.0.0',
    packageManager: `pnpm@${version}`,
    scripts: { build: 'node -e "process.exit(0)"' },
    dependencies: {
      'odd-old': 'npm:is-odd@3.0.0',
      'odd-new': 'npm:is-odd@3.0.1',
    },
  }
  const settings = {
    autoDedupe: true,
    saveTypes: true,
    progress: false,
    loglevel: 'warn',
    tagVersionPrefix: '',
    concurrencyGroups: { build: 1 },
    tasks: { build: { concurrencyGroup: 'build', priority: -1 } },
  }
  try {
    await writeFile(manifestPath, JSON.stringify(manifest))
    await runPnpm(version, fixtureDir, [
      'install',
      '--lockfile-only',
      '--ignore-scripts',
    ])
    manifest.dependencies['odd-old'] = 'npm:is-odd@^3.0.0'
    await writeFile(manifestPath, JSON.stringify(manifest))
    // Broaden the recorded range while keeping a valid older resolution.
    // A normal resolution after a manifest edit may already choose the newest.
    const initialLockfile = await readFile(lockfilePath, 'utf8')
    const broaderLockfile = initialLockfile.replace(
      'specifier: npm:is-odd@3.0.0',
      'specifier: npm:is-odd@^3.0.0',
    )
    assert.notEqual(broaderLockfile, initialLockfile)
    await writeFile(lockfilePath, broaderLockfile)
    await runPnpm(version, fixtureDir, [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
    ])
    assert.equal(
      JSON.parse(
        await readFile(
          join(fixtureDir, 'node_modules/odd-old/package.json'),
          'utf8',
        ),
      ).version,
      '3.0.0',
    )

    await writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, pnpm: settings }),
    )
    const result = await migratePnpmSettings({ cwd: fixtureDir })
    assert.deepEqual(result.warnings, [])
    assert.deepEqual(
      parse(await readFile(join(fixtureDir, 'pnpm-workspace.yaml'), 'utf8')),
      settings,
    )
    assert.equal(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      undefined,
    )
    const configList = await runPnpm(version, fixtureDir, [
      'config',
      'list',
      '--json',
    ])
    assert.doesNotMatch(configList.stderr, /unrecognized|unknown.*setting/iu)
    const config = JSON.parse(configList.stdout)
    for (const [key, value] of Object.entries(settings)) {
      assert.deepEqual(config[key], value)
    }

    const beforeDedupe = await readFile(lockfilePath, 'utf8')
    await runPnpm(version, fixtureDir, [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
    ])
    assert.equal(await readFile(lockfilePath, 'utf8'), beforeDedupe)
    await runPnpm(version, fixtureDir, [
      'install',
      '--no-frozen-lockfile',
      '--ignore-scripts',
    ])
    assert.equal(
      JSON.parse(
        await readFile(
          join(fixtureDir, 'node_modules/odd-old/package.json'),
          'utf8',
        ),
      ).version,
      '3.0.1',
    )
    await runPnpm(version, fixtureDir, [
      'add',
      'is-number@7.0.0',
      '--ignore-scripts',
    ])
    const updatedManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    assert.ok(updatedManifest.devDependencies['@types/is-number'])
    const frozenLockfile = await readFile(lockfilePath, 'utf8')
    await runPnpm(version, fixtureDir, [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
    ])
    assert.equal(await readFile(lockfilePath, 'utf8'), frozenLockfile)
    await runPnpm(version, fixtureDir, ['run', 'build'])
  } finally {
    await rm(fixtureDir, { force: true, recursive: true })
  }
  process.stdout.write(`pnpm ${version} install settings verified\n`)
}
