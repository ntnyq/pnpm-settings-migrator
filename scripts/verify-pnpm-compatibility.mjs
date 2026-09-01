import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { parse } from 'yaml'
import { migratePnpmSettings } from '../dist/index.mjs'

const execFileAsync = promisify(execFile)
const DEFAULT_PNPM_VERSIONS = ['11.25.0', '12.2.1']
const MAX_BUFFER_BYTES = 10_485_760
const requestedVersions = process.argv
  .slice(2)
  .filter(argument => argument !== '--')
const pnpmVersions = requestedVersions.length
  ? requestedVersions
  : DEFAULT_PNPM_VERSIONS
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

async function runPnpm(version, cwd, args) {
  return execFileAsync(
    pnpmCommand,
    ['dlx', `pnpm@${version}`, '--dir', cwd, ...args],
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

async function verifyVersion(version) {
  const compatibility = version.startsWith('11.') ? 'v11' : 'v12'
  const fixtureDir = await mkdtemp(
    join(tmpdir(), `pnpm-settings-migrator-${compatibility}-`),
  )

  try {
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

await Promise.all(pnpmVersions.map(version => verifyVersion(version)))
