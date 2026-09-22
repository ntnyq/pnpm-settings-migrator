import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { parse } from 'yaml'
import { migratePnpmSettings } from '../src'
import { verifyMinorCapabilities } from './verify-pnpm-minor-compatibility'

/**
 * First v11 minor supporting trust policy exclusion pruning.
 */
const TRUST_PRUNING_MINOR = 27

/**
 * First v12 minor supporting the pipeline and ecosystem settings fixture.
 */
const PIPELINE_MINOR = 4

/**
 * Promise-based process runner used to capture pnpm output and failures.
 */
const execFileAsync = promisify(execFile)

/**
 * pnpm releases checked when no versions are supplied on the command line.
 */
const DEFAULT_PNPM_VERSIONS = [
  '11.25.0',
  '11.26.0',
  '11.27.1',
  '12.2.1',
  '12.3.4',
  '12.4.0',
  '12.4.2',
  '12.5.0',
  '12.5.1',
]

/**
 * Maximum buffered output per pnpm invocation, in bytes.
 */
const MAX_BUFFER_BYTES = 10_485_760

/**
 * Explicit version arguments after removing the package-script separator.
 */
const requestedVersions = process.argv
  .slice(2)
  .filter(argument => argument !== '--')
/**
 * Effective release matrix used by this compatibility verification run.
 */
const pnpmVersions = requestedVersions.length
  ? requestedVersions
  : DEFAULT_PNPM_VERSIONS
/**
 * Platform-specific pnpm executable used to launch each requested release.
 */
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

/**
 * Run a specific pnpm release with deterministic CI and color settings.
 * The launcher reads this repository; only the selected release reads the fixture.
 *
 * @param version - pnpm release to run through `pnpm dlx`
 * @param cwd - Absolute fixture workspace path
 * @param args - Arguments passed to the selected pnpm release
 *
 * @returns Captured standard output and standard error
 *
 * @throws {Error} When pnpm cannot start or exits unsuccessfully
 */
async function runPnpm(
  version: string,
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    pnpmCommand,
    [
      '--dir',
      import.meta.dirname,
      'dlx',
      `pnpm@${version}`,
      '--dir',
      cwd,
      ...args,
    ],
    {
      cwd,
      env: {
        ...process.env,
        CI: 'true',
        NO_COLOR: '1',
      },
      maxBuffer: MAX_BUFFER_BYTES,
    },
  )
}

/**
 * Verify migration, source retention, and frozen installation with a pnpm release.
 *
 * The temporary workspace is removed even when an assertion or command fails.
 *
 * @param version - pnpm v11 or v12 release to verify
 *
 * @returns A promise that resolves after verification and fixture cleanup
 *
 * @throws {Error} When migration, pnpm commands, or compatibility assertions fail
 */
async function verifyVersion(version: string): Promise<void> {
  const compatibility = version.startsWith('11.') ? 'v11' : 'v12'
  const fixtureDir = await mkdtemp(
    join(tmpdir(), `pnpm-settings-migrator-${compatibility}-`),
  )

  try {
    assert.equal(
      (await runPnpm(version, fixtureDir, ['--version'])).stdout.trim(),
      version,
    )
    const versionSpecificSettings =
      compatibility === 'v11'
        ? {
            confirmModulesPurge: false,
            ...(Number(version.split('.')[1]) >= TRUST_PRUNING_MINOR
              ? { trustPolicyExcludePrune: true }
              : {}),
          }
        : { globalShims: { node: 'always', typescript: true } }
    await writeFile(
      join(fixtureDir, 'package.json'),
      JSON.stringify(
        {
          dependencies: { 'is-number': '7.0.0' },
          name: `compatibility-${compatibility}`,
          packageManager: `pnpm@${version}`,
          pnpm: {
            customMetadata: { preserve: true },
            globalDir: '.machine-global',
            overrides: { 'is-number': '7.0.0' },
            sideEffectsCache: { read: true, write: false },
            tasks: { test: { concurrency: 2 } },
            ...versionSpecificSettings,
          },
          private: true,
          resolutions: { '**/is-number': '7.0.0' },
          version: '1.0.0',
        },
        null,
        2,
      ),
    )
    await writeFile(
      join(fixtureDir, '.npmrc'),
      [
        'global-dir=.machine-global',
        'node-linker=isolated',
        'public-hoist-pattern=*eslint*',
        'git-shallow-hosts=github.com',
        'third-party-setting=preserve',
      ].join('\n'),
    )

    await runPnpm(version, fixtureDir, [
      'install',
      '--ignore-scripts',
      '--lockfile-only',
    ])
    const initialLockfile = await readFile(
      join(fixtureDir, 'pnpm-lock.yaml'),
      'utf8',
    )
    assert.ok(initialLockfile.length > 0)

    await migratePnpmSettings({
      compatibility,
      cwd: fixtureDir,
      showChanges: false,
    })

    const workspace = parse(
      await readFile(join(fixtureDir, 'pnpm-workspace.yaml'), 'utf8'),
    )
    assert.equal(workspace.nodeLinker, 'isolated')
    assert.deepEqual(workspace.publicHoistPattern, ['*eslint*'])
    assert.deepEqual(workspace.gitShallowHosts, ['github.com'])
    assert.deepEqual(workspace.overrides, { 'is-number': '7.0.0' })
    assert.deepEqual(workspace.sideEffectsCache, {
      read: true,
      write: false,
    })
    assert.deepEqual(workspace.tasks, { test: { concurrency: 2 } })
    assert.equal(workspace.globalDir, undefined)
    assert.equal(workspace.customMetadata, undefined)
    if (compatibility === 'v11') {
      assert.equal(workspace.confirmModulesPurge, false)
      if (Number(version.split('.')[1]) >= TRUST_PRUNING_MINOR) {
        assert.equal(workspace.trustPolicyExcludePrune, true)
      }
    } else {
      assert.deepEqual(workspace.globalShims, {
        node: 'always',
        typescript: true,
      })
    }

    const packageJson = JSON.parse(
      await readFile(join(fixtureDir, 'package.json'), 'utf8'),
    )
    assert.deepEqual(packageJson.pnpm, {
      customMetadata: { preserve: true },
      globalDir: '.machine-global',
    })
    assert.equal(packageJson.resolutions, undefined)
    const npmrc = await readFile(join(fixtureDir, '.npmrc'), 'utf8')
    assert.match(npmrc, /global-dir=.machine-global/u)
    assert.match(npmrc, /third-party-setting=preserve/u)
    assert.doesNotMatch(npmrc, /node-linker=/u)
    assert.doesNotMatch(npmrc, /public-hoist-pattern=|git-shallow-hosts=/u)

    const configList = await runPnpm(version, fixtureDir, [
      'config',
      'list',
      '--json',
    ])
    const resolvedConfig = JSON.parse(configList.stdout)
    assert.equal(resolvedConfig.nodeLinker, 'isolated')
    assert.deepEqual(resolvedConfig.publicHoistPattern, ['*eslint*'])
    assert.deepEqual(resolvedConfig.gitShallowHosts, ['github.com'])

    await runPnpm(version, fixtureDir, [
      'install',
      '--ignore-scripts',
      '--lockfile-only',
    ])
    const migratedLockfile = await readFile(
      join(fixtureDir, 'pnpm-lock.yaml'),
      'utf8',
    )
    await runPnpm(version, fixtureDir, [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
    ])
    assert.equal(
      await readFile(join(fixtureDir, 'pnpm-lock.yaml'), 'utf8'),
      migratedLockfile,
    )

    process.stdout.write(`pnpm ${version} compatibility verified\n`)
  } finally {
    await rm(fixtureDir, { force: true, recursive: true })
  }
}

await Promise.all(
  pnpmVersions.map(async version => {
    await verifyVersion(version)
    if (
      version.startsWith('12.') &&
      Number(version.split('.')[1]) >= PIPELINE_MINOR
    ) {
      await verifyMinorCapabilities(version, runPnpm)
    }
  }),
)
