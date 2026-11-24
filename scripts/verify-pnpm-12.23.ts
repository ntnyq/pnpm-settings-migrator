import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import { PNPM_V12_23_MINIMUM_VERSION } from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Runner with optional environment overrides for a particular fixture.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  command: string[] | { args: string[]; env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>

/**
 * Confirm the new settings affect the commands that consume them.
 *
 * @param cwd - Temporary workspace directory
 * @param run - Exact-release runner bound to the fixture
 * @param change - Arguments selecting the private package
 *
 * @returns A promise resolved after the command and lockfile assertions
 */
async function verifyNewConsumers(
  cwd: string,
  run: (command: Parameters<PnpmRunner>[2]) => ReturnType<PnpmRunner>,
  change: string[],
): Promise<void> {
  const workspace = join(cwd, 'pnpm-workspace.yaml')
  const lock = join(cwd, 'pnpm-lock.yaml')
  const lockfile = await readFile(lock, 'utf8')
  const frozen = ['install', '--frozen-lockfile', '--ignore-scripts']
  await assert.rejects(run(change), /ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE/u)
  await assert.rejects(
    run({
      args: frozen,
      env: { PNPM_CONFIG_REFERENCE_TIME: '2000-01-01T00:00:00Z' },
    }),
    /release age|minimumReleaseAge|UNVERIFIED_LOCKFILE/iu,
  )
  assert.equal(await readFile(lock, 'utf8'), lockfile)

  const publicChange = [...change.slice(0, -1), 'public-fixture']
  assert.match((await run(publicChange)).stdout, /Recorded change intent/u)

  const existing = parse(await readFile(workspace, 'utf8'))
  delete existing.warnUnusedOverrides
  await writeFile(
    workspace,
    stringify({
      ...existing,
      hoistingLimits: 'none',
      nodeLinker: { type: 'hoisted', hoistingLimits: 'dependencies' },
    }),
  )
  const hoisted = await run(['config', 'list', '--json'])
  const resolved = JSON.parse(hoisted.stdout)
  assert.deepEqual(resolved.nodeLinker, {
    type: 'hoisted',
    hoistingLimits: 'dependencies',
  })
  assert.equal(resolved.hoistingLimits, 'dependencies')
  await rm(join(cwd, 'node_modules'), { recursive: true })
  await rm(lock)
  const warned = await run([
    'install',
    '--no-frozen-lockfile',
    '--ignore-scripts',
  ])
  assert.match(
    warned.stdout + warned.stderr,
    /override.*matched no dependency.*unused-override-fixture/iu,
  )
  await run(frozen)

  await writeFile(workspace, 'editor: null\n')
  await run(['config', 'list', '--json'])
  await writeFile(workspace, 'editor: fixture-editor\n')
  await assert.rejects(
    run(['config', 'list', '--json']),
    /editor.*(?:workspace|configuration)/iu,
  )
  await writeFile(workspace, 'noProxy: [localhost]\n')
  await assert.rejects(
    run(['config', 'list', '--json']),
    /noProxy.*boolean or string/u,
  )
}

/**
 * Check workspace migration and actual linker, release-age, and change behavior.
 *
 * @param version - Exact pnpm release, including the preceding control
 * @param runPnpm - Exact-release runner for disposable workspaces
 *
 * @returns A promise resolved after all applicable checks
 */
export async function verifyPnpm12_23(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const supported = supportsMinimumVersion(
    parsePnpmVersion(version),
    PNPM_V12_23_MINIMUM_VERSION,
  )
  if (!supported && version !== '12.22.0') {
    return
  }

  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-settings-12.23-'))
  const manifest = join(cwd, 'package.json')
  const workspace = join(cwd, 'pnpm-workspace.yaml')
  const lock = join(cwd, 'pnpm-lock.yaml')
  const settings = {
    access: 'restricted',
    nodeLinker: { type: 'isolated', hoist: false },
    referenceTime: '2025-01-02T03:04:05+02:00',
    versioning: { includePrivatePackages: false },
    warnUnusedOverrides: false,
  }
  const base = {
    minimumReleaseAge: 1,
    overrides: { 'unused-override-fixture': '1.0.0' },
  }
  try {
    await mkdir(join(cwd, 'packages/private'), { recursive: true })
    await writeFile(
      join(cwd, 'packages/private/package.json'),
      JSON.stringify({
        name: 'private-fixture',
        version: '1.0.0',
        private: true,
      }),
    )
    await mkdir(join(cwd, 'packages/public'))
    await writeFile(
      join(cwd, 'packages/public/package.json'),
      JSON.stringify({ name: 'public-fixture', version: '1.0.0' }),
    )
    await writeFile(workspace, stringify({ packages: ['packages/*'] }))
    await writeFile(
      manifest,
      JSON.stringify({
        name: 'linker-fixture',
        dependencies: { 'is-number': '7.0.0' },
        packageManager: `pnpm@${version}`,
        private: true,
        pnpm: { ...base, ...settings },
      }),
    )
    await migratePnpmSettings({ cwd })
    assert.deepEqual(parse(await readFile(workspace, 'utf8')), {
      packages: ['packages/*'],
      ...base,
      ...(supported ? settings : {}),
    })
    assert.deepEqual(
      JSON.parse(await readFile(manifest, 'utf8')).pnpm,
      supported ? undefined : settings,
    )
    const listed = await runPnpm(version, cwd, ['config', 'list', '--json'])
    assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
    const config = JSON.parse(listed.stdout)
    if (supported) {
      assert.equal(config.access, settings.access)
      assert.equal(config.referenceTime, settings.referenceTime)
      assert.equal(config.warnUnusedOverrides, false)
      assert.equal(config.versioning.includePrivatePackages, false)
      assert.deepEqual(config.nodeLinker, settings.nodeLinker)
      assert.deepEqual(config.publicHoistPattern, [])
    } else {
      for (const key of ['access', 'referenceTime', 'warnUnusedOverrides']) {
        assert.equal(config[key], undefined, key)
      }
    }

    const install = await runPnpm(version, cwd, [
      'install',
      '--no-frozen-lockfile',
      '--ignore-scripts',
    ])
    assert.doesNotMatch(
      install.stdout + install.stderr,
      /override.*matched no dependency/iu,
    )
    assert.equal(
      JSON.parse(
        await readFile(
          join(cwd, 'node_modules/is-number/package.json'),
          'utf8',
        ),
      ).version,
      '7.0.0',
    )
    const lockfile = await readFile(lock, 'utf8')
    const frozen = ['install', '--frozen-lockfile', '--ignore-scripts']
    await runPnpm(version, cwd, frozen)
    assert.equal(await readFile(lock, 'utf8'), lockfile)

    const change = [
      'change',
      '--bump',
      'patch',
      '--summary',
      'Fixture change',
      'private-fixture',
    ]
    if (supported) {
      await verifyNewConsumers(
        cwd,
        command => runPnpm(version, cwd, command),
        change,
      )
    } else {
      assert.match(
        (await runPnpm(version, cwd, change)).stdout,
        /Recorded change intent/u,
      )
    }

    await writeFile(workspace, 'saveExact: true\notp: placeholder\n')
    const otp = await runPnpm(version, cwd, ['config', 'list', '--json'])
    assert.equal(JSON.parse(otp.stdout).otp, undefined)
    if (supported) {
      assert.match(otp.stderr, /cannot be set.*"otp"/u)
    }
  } finally {
    await rm(cwd, { force: true, recursive: true })
  }
}
