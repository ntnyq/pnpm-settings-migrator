import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'
import { migratePnpmSettings } from '../src'

/**
 * First v12 minor supporting registry ecosystems and concurrency groups.
 */
const ECOSYSTEM_MINOR = 5

/**
 * Verify versioned v12 settings and project configuration with both entry shapes.
 *
 * @param version - Exact pnpm release from 12.4 onward to execute
 * @param runPnpm - Runner for the selected release in an isolated workspace
 *
 * @returns A promise resolved after config reading, installation, and cleanup
 */
export async function verifyMinorCapabilities(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  const [, minor, patch] = version.split('.').map(Number)
  const supportsV12_5 = minor >= ECOSYSTEM_MINOR
  const supportsRegistryPackages =
    minor > ECOSYSTEM_MINOR || (minor === ECOSYSTEM_MINOR && patch >= 1)
  const projectSettings = {
    saveExact: true,
    savePrefix: '~',
    modulesDir: '.modules',
  }
  const settings = {
    cargo: { enabled: false },
    python: {
      enabled: false,
      ...(supportsV12_5
        ? {
            versions: ['3.12', '3.13'],
            constraints: ['requests>=2'],
            overrides: ['urllib3==2.5.0'],
          }
        : {}),
    },
    ...(supportsV12_5
      ? {
          concurrencyGroups: { build: 2 },
          supportedArchitectures: ['current'],
          registries: {
            'https://pypi.org/simple/': {
              ecosystem: 'pypi',
              ...(supportsRegistryPackages ? { packages: ['*'] } : {}),
            },
            'https://index.crates.io/': { ecosystem: 'cargo' },
          },
        }
      : {}),
    pipelineBase: 'main',
    pipelines: { ci: ['build'] },
    tasks: {
      build: {
        ...(supportsV12_5 ? { concurrencyGroup: 'build' } : {}),
        outputs: [],
        inputs: ['src/**'],
        env: ['NODE_ENV'],
        cache: false,
        cargoTargetDir: 'target',
      },
    },
    trustPolicyExcludePrune: true,
    sharedWorkspaceLockfile: false,
    packages: ['packages/*'],
  }
  for (const packageConfigs of [
    { app: projectSettings },
    [{ match: ['app'], ...projectSettings }],
  ]) {
    const fixtureDir = await mkdtemp(join(tmpdir(), 'pnpm-settings-minor-'))
    const projectDir = join(fixtureDir, 'packages/app')
    try {
      await mkdir(projectDir, { recursive: true })
      await writeFile(
        join(projectDir, 'package.json'),
        JSON.stringify({ name: 'app', version: '1.0.0' }),
      )
      await writeFile(
        join(fixtureDir, 'package.json'),
        JSON.stringify({
          name: 'minor-capabilities',
          packageManager: `pnpm@${version}`,
          pnpm: { ...settings, packageConfigs },
        }),
      )
      const result = await migratePnpmSettings({ cwd: fixtureDir })
      assert.deepEqual(result.warnings, [])
      const workspace = parse(
        await readFile(join(fixtureDir, 'pnpm-workspace.yaml'), 'utf8'),
      )
      assert.deepEqual(workspace, { ...settings, packageConfigs })
      const config = JSON.parse(
        (await runPnpm(version, fixtureDir, ['config', 'list', '--json']))
          .stdout,
      )
      assert.equal(config.trustPolicyExcludePrune, true)
      assert.equal(config.sharedWorkspaceLockfile, false)
      assert.deepEqual(config.pipelines, settings.pipelines)
      assert.equal(config.tasks.build.cargoTargetDir, 'target')
      if (supportsV12_5) {
        assert.deepEqual(config.concurrencyGroups, { build: 2 })
        assert.equal(config.tasks.build.concurrencyGroup, 'build')
        assert.deepEqual(config.python.versions, ['3.12', '3.13'])
        assert.deepEqual(config.python.constraints, ['requests>=2'])
        assert.deepEqual(config.python.overrides, ['urllib3==2.5.0'])
      }
      await runPnpm(version, projectDir, [
        'add',
        'is-number',
        '--ignore-scripts',
      ])
      const projectManifest = JSON.parse(
        await readFile(join(projectDir, 'package.json'), 'utf8'),
      )
      assert.equal(projectManifest.dependencies['is-number'], '7.0.0')
      const installedPackage = JSON.parse(
        await readFile(
          join(projectDir, '.modules/is-number/package.json'),
          'utf8',
        ),
      )
      assert.equal(installedPackage.version, '7.0.0')
      await runPnpm(version, fixtureDir, [
        'install',
        '--ignore-scripts',
        '--lockfile-only',
      ])
      await runPnpm(version, fixtureDir, [
        'install',
        '--ignore-scripts',
        '--frozen-lockfile',
      ])
    } finally {
      await rm(fixtureDir, { force: true, recursive: true })
    }
  }
  process.stdout.write(`pnpm ${version} minor capabilities verified\n`)
}
