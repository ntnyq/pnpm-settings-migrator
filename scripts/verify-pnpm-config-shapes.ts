import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parse, parseAllDocuments, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'
import { verifyRegistryRequestConcurrency } from './verify-pnpm-registry-concurrency'

/**
 * Selected real pnpm release runner, shared by the compatibility fixtures.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Check the new v11 validation rules and their actual preceding releases.
 *
 * @param version - Exact v11 release from 11.28.2 onward
 * @param fixtureDir - Temporary workspace reused between independent cases
 * @param runPnpm - Runner for the selected release
 *
 * @returns A promise resolved after migration retention and config validation
 */
async function verifyV11Validation(
  version: string,
  fixtureDir: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const parsedVersion = parsePnpmVersion(version)
  const cases = [
    {
      settings: { allowBuilds: { esbuild: 123 } },
      // eslint-disable-next-line no-magic-numbers -- Exact upstream release boundary.
      minimum: [11, 28, 3] as const,
    },
    {
      settings: { allowUnusedPatches: 'false' },
      // eslint-disable-next-line no-magic-numbers -- Exact upstream release boundary.
      minimum: [11, 28, 4] as const,
    },
    {
      settings: { ignoredOptionalDependencies: ['valid', 1] },
      // eslint-disable-next-line no-magic-numbers -- Exact upstream release boundary.
      minimum: [11, 28, 4] as const,
    },
    {
      settings: { requiredScripts: ['build', false] },
      // eslint-disable-next-line no-magic-numbers -- Exact upstream release boundary.
      minimum: [11, 28, 4] as const,
    },
    {
      settings: { httpProxy: null },
      // eslint-disable-next-line no-magic-numbers -- Exact upstream release boundary.
      minimum: [11, 28, 5] as const,
    },
    {
      settings: { httpsProxy: null },
      // eslint-disable-next-line no-magic-numbers -- Exact upstream release boundary.
      minimum: [11, 28, 5] as const,
    },
  ]
  const manifestPath = join(fixtureDir, 'package.json')
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  for (const { settings, minimum } of cases) {
    const rejectsValue = supportsMinimumVersion(parsedVersion, minimum)
    await rm(workspacePath, { force: true })
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'v11-validation',
        packageManager: `pnpm@${version}`,
        pnpm: { nodeLinker: 'isolated', ...settings },
      }),
    )
    const result = await migratePnpmSettings({ cwd: fixtureDir })
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const workspace = parse(await readFile(workspacePath, 'utf8'))
    assert.deepEqual(manifest.pnpm, rejectsValue ? settings : undefined)
    assert.deepEqual(workspace, {
      nodeLinker: 'isolated',
      ...(rejectsValue ? {} : settings),
    })
    assert.equal(result.warnings.length > 0, rejectsValue)

    await writeFile(workspacePath, stringify(settings))
    const config = runPnpm(version, fixtureDir, ['config', 'list', '--json'])
    if (rejectsValue) {
      await assert.rejects(
        config,
        /should be (?:a |an )?(?:boolean|string|array|object)/u,
      )
    } else {
      await config
    }
  }
  await writeFile(workspacePath, stringify({ httpProxy: '', httpsProxy: '' }))
  await runPnpm(version, fixtureDir, ['config', 'list', '--json'])
}

/**
 * Verify registry concurrency is migrated only when pnpm reads the nested field.
 *
 * @param version - Exact v12 release from 12.8.2 onward
 * @param fixtureDir - Temporary workspace for migration and installation
 * @param runPnpm - Runner for the selected release
 *
 * @returns A promise resolved after config reading and a frozen installation
 */
async function verifyRegistryConcurrency(
  version: string,
  fixtureDir: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const supportsConcurrency = supportsMinimumVersion(
    parsePnpmVersion(version),
    // eslint-disable-next-line no-magic-numbers -- Exact upstream release boundary.
    [12, 9, 0],
  )
  const registry = 'https://registry.npmjs.org/'
  const registries = { [registry]: { networkConcurrency: 1 } }
  const manifestPath = join(fixtureDir, 'package.json')
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: 'registry-concurrency',
      packageManager: `pnpm@${version}`,
      dependencies: { 'is-number': '7.0.0' },
      pnpm: { nodeLinker: 'isolated', registries },
    }),
  )
  const result = await migratePnpmSettings({ cwd: fixtureDir })
  assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
    nodeLinker: 'isolated',
    ...(supportsConcurrency ? { registries } : {}),
  })
  assert.deepEqual(
    JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
    supportsConcurrency ? undefined : { registries },
  )
  assert.equal(result.warnings.length > 0, !supportsConcurrency)
  const listed = await runPnpm(version, fixtureDir, [
    'config',
    'list',
    '--json',
  ])
  assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
  if (supportsConcurrency) {
    assert.equal(
      JSON.parse(listed.stdout).registries[registry].networkConcurrency,
      1,
    )
  }
  await runPnpm(version, fixtureDir, ['install', '--ignore-scripts'])
  const lockfile = await readFile(join(fixtureDir, 'pnpm-lock.yaml'), 'utf8')
  await runPnpm(version, fixtureDir, [
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
  ])
  assert.equal(
    await readFile(join(fixtureDir, 'pnpm-lock.yaml'), 'utf8'),
    lockfile,
  )
  if (supportsConcurrency) {
    await verifyRegistryRequestConcurrency(version, runPnpm)
  }
}

/**
 * Exercise loaded linking, recorded resolution settings, and empty-filter policy.
 *
 * @param version - Exact v12 release from 12.9.1 onward
 * @param fixtureDir - Temporary workspace for migration and package execution
 * @param runPnpm - Runner for the selected release
 *
 * @returns A promise resolved after capability boundary and consumption checks
 */
async function verifyLoadedLinker(
  version: string,
  fixtureDir: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const supportsLoaded = supportsMinimumVersion(
    parsePnpmVersion(version),
    // eslint-disable-next-line no-magic-numbers -- Exact upstream release boundary.
    [12, 10, 0],
  )
  const settings = {
    nodeLinker: { type: 'loaded', excluded: ['is-number'] },
    lockfile: { includeResolutionSettings: true },
    failIfNoMatch: true,
  }
  const resolutionSettings = {
    autoDedupe: false,
    dedupeInjectedDeps: false,
    dedupePeerDependents: false,
    linkWorkspacePackages: true,
  }
  const manifestPath = join(fixtureDir, 'package.json')
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  const lockfilePath = join(fixtureDir, 'pnpm-lock.yaml')
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: 'loaded-linker',
      packageManager: `pnpm@${version}`,
      dependencies: { 'is-odd': '3.0.1', 'is-number': '7.0.0' },
      pnpm: { ...resolutionSettings, ...settings },
      scripts: {
        check:
          "node -e \"if (!require('is-odd')(3) || !require('is-number')(7)) process.exit(1); console.log('loaded-ok')\"",
      },
    }),
  )
  const result = await migratePnpmSettings({ cwd: fixtureDir })
  assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
    ...resolutionSettings,
    ...(supportsLoaded ? settings : {}),
  })
  assert.deepEqual(
    JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
    supportsLoaded ? undefined : settings,
  )
  assert.equal(result.warnings.length > 0, !supportsLoaded)
  if (!supportsLoaded) {
    for (const key of ['nodeLinker', 'lockfile'] as const) {
      await writeFile(workspacePath, stringify({ [key]: settings[key] }))
      await assert.rejects(
        runPnpm(version, fixtureDir, ['config', 'list', '--json']),
      )
    }
    return
  }

  const config = await runPnpm(version, fixtureDir, [
    'config',
    'list',
    '--json',
  ])
  assert.doesNotMatch(config.stderr, /unrecognized|unknown.*setting/iu)
  assert.deepEqual(JSON.parse(config.stdout).nodeLinker, settings.nodeLinker)
  assert.equal(JSON.parse(config.stdout).failIfNoMatch, true)
  await runPnpm(version, fixtureDir, ['install', '--ignore-scripts'])
  assert.match(
    (await runPnpm(version, fixtureDir, ['run', 'check'])).stdout,
    /loaded-ok/u,
  )
  const lockfile = await readFile(lockfilePath, 'utf8')
  const lockfileSettings = parseAllDocuments(lockfile)
    .map(document => document.toJSON()?.settings)
    .find(value => value?.autoDedupe !== undefined)
  assert.ok(lockfileSettings, 'The lockfile must record resolution settings')
  for (const [key, value] of Object.entries(resolutionSettings)) {
    assert.deepEqual(lockfileSettings[key], value)
  }
  await runPnpm(version, fixtureDir, [
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
  ])
  assert.equal(await readFile(lockfilePath, 'utf8'), lockfile)
  await assert.rejects(
    runPnpm(version, fixtureDir, [
      '--filter=missing-project',
      'exec',
      'node',
      '--version',
    ]),
  )
  await runPnpm(version, fixtureDir, [
    '--filter=missing-project',
    '--no-fail-if-no-match',
    'exec',
    'node',
    '--version',
  ])
  await writeFile(
    workspacePath,
    stringify({ ...resolutionSettings, ...settings, autoDedupe: true }),
  )
  await assert.rejects(
    runPnpm(version, fixtureDir, [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
    ]),
    /OUTDATED_LOCKFILE|autoDedupe/u,
  )
}

/**
 * Verify configuration shape changes and their preceding release boundaries.
 *
 * @param version - Exact v11 or v12 release selected by the compatibility runner
 * @param runPnpm - Runner for the selected release in an isolated workspace
 *
 * @returns A promise resolved after applicable fixtures and temporary cleanup
 */
export async function verifyConfigShapes(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const parsedVersion = parsePnpmVersion(version)
  // eslint-disable-next-line no-magic-numbers -- Include the last preceding v11 release.
  const checksV11 = supportsMinimumVersion(parsedVersion, [11, 28, 2])
  // eslint-disable-next-line no-magic-numbers -- Include the last preceding v12 release.
  const checksV12 = supportsMinimumVersion(parsedVersion, [12, 8, 2])
  if (!checksV11 && !checksV12) {
    return
  }
  const fixtureDir = await mkdtemp(join(tmpdir(), 'pnpm-settings-shapes-'))
  try {
    if (checksV11) {
      await verifyV11Validation(version, fixtureDir, runPnpm)
    } else {
      await verifyRegistryConcurrency(version, fixtureDir, runPnpm)
      // eslint-disable-next-line no-magic-numbers -- Include the immediate loaded-linker predecessor.
      if (supportsMinimumVersion(parsedVersion, [12, 9, 1])) {
        await rm(fixtureDir, { recursive: true })
        const loadedDir = await mkdtemp(join(tmpdir(), 'pnpm-settings-loaded-'))
        try {
          await verifyLoadedLinker(version, loadedDir, runPnpm)
        } finally {
          await rm(loadedDir, { force: true, recursive: true })
        }
      }
    }
    process.stdout.write(`pnpm ${version} configuration shapes verified\n`)
  } finally {
    await rm(fixtureDir, { force: true, recursive: true })
  }
}
