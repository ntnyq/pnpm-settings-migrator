import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { parse } from 'yaml'
import { migratePnpmSettings } from '../dist/index.mjs'

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
  '12.2.1',
  '12.3.4',
  '12.4.0',
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
 * @param {string} version - pnpm release to run through `pnpm dlx`
 * @param {string} cwd - Absolute fixture workspace path
 * @param {string[]} args - Arguments passed to the selected pnpm release
 *
 * @returns Captured standard output and standard error
 *
 * @throws {Error} When pnpm cannot start or exits unsuccessfully
 */
async function runPnpm(version, cwd, args) {
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
 * @param {string} version - pnpm v11 or v12 release to verify
 *
 * @returns A promise that resolves after verification and fixture cleanup
 *
 * @throws {Error} When migration, pnpm commands, or compatibility assertions fail
 */
async function verifyVersion(version) {
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
        ? { confirmModulesPurge: false }
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

    const configList = await runPnpm(version, fixtureDir, [
      'config',
      'list',
      '--json',
    ])
    const resolvedConfig = JSON.parse(configList.stdout)
    assert.equal(resolvedConfig.nodeLinker, 'isolated')

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

/**
 * Verify the pnpm 12.4 schema and project configuration with both entry shapes.
 *
 * @param {string} version - Exact pnpm 12.4 release to execute
 *
 * @returns A promise resolved after config reading, installation, and cleanup
 */
async function verifyMinorCapabilities(version) {
  const projectSettings = {
    saveExact: true,
    savePrefix: '~',
    modulesDir: '.modules',
  }
  const settings = {
    cargo: { enabled: false },
    python: { enabled: false },
    pipelineBase: 'main',
    pipelines: { ci: ['build'] },
    tasks: {
      build: {
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

await Promise.all(
  pnpmVersions.map(async version => {
    await verifyVersion(version)
    if (version === '12.4.0') {
      await verifyMinorCapabilities(version)
    }
  }),
)
