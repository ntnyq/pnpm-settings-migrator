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
import {
  PNPM_V11_28_1_MINIMUM_VERSION,
  PNPM_V12_8_2_MINIMUM_VERSION,
} from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Verify settings introduced in 11.28/12.7 and shim scope changed in 12.8.2.
 *
 * @param version - Exact pnpm release with forceIgnoresPlatform support
 * @param runPnpm - Runner for the selected release in an isolated workspace
 *
 * @returns A promise resolved after config, forced/frozen installs, and cleanup
 */
export async function verifyReleaseSettings(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'pnpm-settings-release-'))
  const manifestPath = join(fixtureDir, 'package.json')
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  const isV12 = version.startsWith('12.')
  const settings = {
    forceIgnoresPlatform: false,
    ...(isV12 ? { publishWaitTimeout: 0, reporter: 'silent' } : {}),
  }
  try {
    const packageDir = join(fixtureDir, 'optional-package')
    await mkdir(packageDir)
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'foreign-platform',
        version: '1.0.0',
        os: ['pnpm-test-foreign-os'],
        packageManager: `pnpm@${version}`,
      }),
    )
    await runPnpm(version, packageDir, [
      'pack',
      '--pack-destination',
      fixtureDir,
    ])
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'release-settings',
        private: true,
        version: '1.0.0',
        packageManager: `pnpm@${version}`,
        optionalDependencies: {
          'foreign-platform': 'file:foreign-platform-1.0.0.tgz',
        },
        // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
        pnpm: { ...settings, userAgent: 'agent/${PNPM_MIGRATOR_SECRET}' },
      }),
    )
    const migration = await migratePnpmSettings({ cwd: fixtureDir })
    assert.ok(migration.warnings.some(warning => warning.includes('userAgent')))
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), settings)
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')).pnpm, {
      // eslint-disable-next-line no-template-curly-in-string -- Preserve the literal pnpm environment placeholder.
      userAgent: 'agent/${PNPM_MIGRATOR_SECRET}',
    })
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

    const install = await runPnpm(version, fixtureDir, [
      'install',
      '--force',
      '--no-frozen-lockfile',
      '--ignore-scripts',
    ])
    assert.doesNotMatch(install.stderr, /unrecognized|unknown.*setting/iu)
    if (isV12) {
      assert.equal(install.stdout.trim(), '')
    }
    const installedPackage = join(
      fixtureDir,
      'node_modules/foreign-platform/package.json',
    )
    await assert.rejects(access(installedPackage), { code: 'ENOENT' })
    await writeFile(
      workspacePath,
      stringify({ ...settings, forceIgnoresPlatform: true }),
    )
    await runPnpm(version, fixtureDir, [
      'install',
      '--force',
      '--no-frozen-lockfile',
      '--ignore-scripts',
    ])
    assert.equal(
      JSON.parse(await readFile(installedPackage, 'utf8')).name,
      'foreign-platform',
    )
    const lockfile = await readFile(join(fixtureDir, 'pnpm-lock.yaml'), 'utf8')
    await runPnpm(version, fixtureDir, [
      'install',
      '--force',
      '--frozen-lockfile',
      '--ignore-scripts',
    ])
    assert.equal(
      await readFile(join(fixtureDir, 'pnpm-lock.yaml'), 'utf8'),
      lockfile,
    )

    if (isV12) {
      const reported = await runPnpm(version, fixtureDir, [
        'install',
        '--frozen-lockfile',
        '--ignore-scripts',
        '--reporter=append-only',
      ])
      assert.ok(
        reported.stdout.trim(),
        'CLI reporter must override silent workspace reporter',
      )
    }
    if (
      supportsMinimumVersion(
        parsePnpmVersion(version),
        PNPM_V12_8_2_MINIMUM_VERSION,
      )
    ) {
      const before = await runPnpm(version, fixtureDir, [
        'config',
        'get',
        'globalShims',
        '--json',
      ])
      await writeFile(
        workspacePath,
        stringify({ ...settings, globalShims: false }),
      )
      const after = await runPnpm(version, fixtureDir, [
        'config',
        'get',
        'globalShims',
        '--json',
      ])
      assert.equal(
        after.stdout,
        before.stdout,
        'Project globalShims must not change resolved shims',
      )
    }
    if (
      supportsMinimumVersion(
        parsePnpmVersion(version),
        PNPM_V11_28_1_MINIMUM_VERSION,
      )
    ) {
      for (const invalid of [
        { patchedDependencies: { bad: false } },
        { packages: false },
      ]) {
        await writeFile(workspacePath, stringify(invalid))
        await assert.rejects(
          runPnpm(version, fixtureDir, ['config', 'list', '--json']),
        )
      }
    }
    process.stdout.write(`pnpm ${version} release settings verified\n`)
  } finally {
    await rm(fixtureDir, { force: true, recursive: true })
  }
}
