import assert from 'node:assert/strict'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import {
  PNPM_V12_12_MINIMUM_VERSION,
  PNPM_V12_12_1_MINIMUM_VERSION,
} from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Run an exact pnpm release inside an isolated fixture.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Exercise peer-type linking and explicit build denial with local tarballs.
 *
 * @param version - Exact pnpm release supporting the new setting
 * @param fixtureDir - Isolated workspace for local installation
 * @param runPnpm - Runner for the selected release
 *
 * @returns A promise resolved after install and frozen-install assertions
 */
async function verifyPeerTypeConsumption(
  version: string,
  fixtureDir: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  const manifestPath = join(fixtureDir, 'package.json')
  const settings = {
    addMissingPeerTypes: true,
    remoteCache: { org: 'fixture-org' },
  }
  const manifest = {
    name: 'release-settings',
    private: true,
    packageManager: `pnpm@${version}`,
  }
  await writeFile(workspacePath, stringify(settings))
  const dependencies: Record<string, string> = {}
  for (const [name, extra] of Object.entries({
    'fixture-peer': {},
    '@types/fixture-peer': {},
    'fixture-consumer': { peerDependencies: { 'fixture-peer': '*' } },
    'fixture-denied-build': { scripts: { postinstall: 'node build.cjs' } },
  })) {
    const packageDir = join(fixtureDir, name)
    await mkdir(packageDir, { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        packageManager: `pnpm@${version}`,
        ...extra,
      }),
    )
    await writeFile(
      join(packageDir, 'build.cjs'),
      "require('node:fs').writeFileSync('built.txt', 'built')\n",
    )
    await runPnpm(version, packageDir, [
      'pack',
      '--pack-destination',
      fixtureDir,
    ])
    dependencies[name] =
      `file:${name.replace('@', '').replace('/', '-')}-1.0.0.tgz`
  }
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...manifest,
      dependencies,
      pnpm: {
        ...settings,
        dangerouslyAllowAllBuilds: true,
        allowBuilds: {
          'fixture-denied-build@file:fixture-denied-build-1.0.0.tgz': false,
        },
        sideEffectsCache: { remote: { org: 'legacy-org', packages: [] } },
        nodeLinker: 'isolated',
        hoist: false,
      },
    }),
  )
  await rm(workspacePath)
  const migrated = await migratePnpmSettings({ cwd: fixtureDir })
  assert.deepEqual(migrated.warnings, [])
  assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).pnpm, undefined)
  const consumed = parse(await readFile(workspacePath, 'utf8'))
  assert.deepEqual(consumed.remoteCache, settings.remoteCache)
  assert.equal(consumed.sideEffectsCache.remote.org, 'legacy-org')
  const install = await runPnpm(version, fixtureDir, [
    'install',
    '--no-frozen-lockfile',
  ])
  assert.doesNotMatch(install.stderr, /unrecognized|unknown.*setting/iu)
  const consumerDir = await realpath(
    join(fixtureDir, 'node_modules/fixture-consumer'),
  )
  await access(join(dirname(consumerDir), '@types/fixture-peer/package.json'))
  await assert.rejects(
    access(join(fixtureDir, 'node_modules/fixture-denied-build/built.txt')),
    { code: 'ENOENT' },
  )
  const lockfilePath = join(fixtureDir, 'pnpm-lock.yaml')
  const lockfile = await readFile(lockfilePath, 'utf8')
  await runPnpm(version, fixtureDir, ['install', '--frozen-lockfile'])
  assert.equal(await readFile(lockfilePath, 'utf8'), lockfile)
  await access(join(dirname(consumerDir), '@types/fixture-peer/package.json'))

  // Disable the migrated option and resolve afresh to prove the link depends on it.
  await writeFile(
    workspacePath,
    stringify({ ...consumed, addMissingPeerTypes: false }),
  )
  await rm(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
  await rm(lockfilePath)
  await runPnpm(version, fixtureDir, ['install', '--no-frozen-lockfile'])
  const withoutTypes = await realpath(
    join(fixtureDir, 'node_modules/fixture-consumer'),
  )
  await assert.rejects(
    access(join(dirname(withoutTypes), '@types/fixture-peer/package.json')),
    { code: 'ENOENT' },
  )
}

/**
 * Verify new settings against actual parsing, peer linking, and frozen installs.
 *
 * @param version - Exact release, including the 12.11.2 predecessor
 * @param runPnpm - Runner preserving the fixture's pnpm version
 *
 * @returns A promise resolved after assertions and temporary workspace cleanup
 */
export async function verifyPnpm12_12(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const parsedVersion = parsePnpmVersion(version)
  // eslint-disable-next-line no-magic-numbers -- Actual preceding release.
  if (!supportsMinimumVersion(parsedVersion, [12, 11, 2])) {
    return
  }
  const supported = supportsMinimumVersion(
    parsedVersion,
    PNPM_V12_12_MINIMUM_VERSION,
  )
  const reservedTool = supportsMinimumVersion(
    parsedVersion,
    PNPM_V12_12_1_MINIMUM_VERSION,
  )
  const fixtureDir = await mkdtemp(join(tmpdir(), 'pnpm-settings-12.12-'))
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  const manifestPath = join(fixtureDir, 'package.json')
  const settings = {
    addMissingPeerTypes: true,
    remoteCache: { org: 'fixture-org' },
  }
  const manifest = {
    name: 'release-settings',
    private: true,
    packageManager: `pnpm@${version}`,
  }
  try {
    await writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, pnpm: { ...settings, saveExact: true } }),
    )
    const result = await migratePnpmSettings({ cwd: fixtureDir })
    assert.equal(result.warnings.length > 0, !supported)
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
      saveExact: true,
      ...(supported ? settings : {}),
    })
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      supported ? undefined : settings,
    )
    const listed = await runPnpm(version, fixtureDir, [
      'config',
      'list',
      '--json',
    ])
    assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
    const config = JSON.parse(listed.stdout)
    assert.deepEqual(
      config.remoteCache,
      supported ? settings.remoteCache : undefined,
    )
    assert.equal(config.addMissingPeerTypes, supported ? true : undefined)

    // Both registry spellings are accepted before the patch and rejected after it.
    for (const registry of [
      { namedRegistries: { tool: 'https://registry.example/' } },
      { registries: { 'https://registry.example/': { prefix: 'tool' } } },
    ]) {
      await writeFile(workspacePath, stringify(registry))
      if (reservedTool) {
        await assert.rejects(
          runPnpm(version, fixtureDir, ['install', '--lockfile-only']),
          /reserved/iu,
        )
      } else {
        await runPnpm(version, fixtureDir, ['install', '--lockfile-only'])
      }
    }
    await writeFile(
      workspacePath,
      stringify({
        registries: { 'https://registry.example/': { prefix: 'ToOl' } },
      }),
    )
    await runPnpm(version, fixtureDir, ['install', '--lockfile-only'])
    if (!supported) {
      await writeFile(workspacePath, stringify(settings))
      const before = await runPnpm(version, fixtureDir, [
        'config',
        'list',
        '--json',
      ])
      assert.equal(JSON.parse(before.stdout).remoteCache, undefined)
      assert.equal(JSON.parse(before.stdout).addMissingPeerTypes, undefined)
      process.stdout.write(`pnpm ${version} 12.12 boundary verified\n`)
      return
    }

    for (const valid of [
      { remoteCache: null, addMissingPeerTypes: null },
      { remoteCache: {} },
      { remoteCache: { org: null } },
    ]) {
      await writeFile(workspacePath, stringify(valid))
      await runPnpm(version, fixtureDir, ['config', 'list', '--json'])
    }
    for (const invalid of [
      { remoteCache: { org: [] } },
      { remoteCache: { org: 'fixture', unknown: true } },
      { remoteCache: { org: 'fixture', url: 'https://cache.example/' } },
      { remoteCache: { privateKey: 'fixture-key' } },
      { remoteCache: { publish: false } },
      { addMissingPeerTypes: {} },
    ]) {
      await writeFile(workspacePath, stringify(invalid))
      await assert.rejects(
        runPnpm(version, fixtureDir, ['config', 'list', '--json']),
      )
    }

    await verifyPeerTypeConsumption(version, fixtureDir, runPnpm)
    process.stdout.write(
      `pnpm ${version} 12.12 settings consumption verified\n`,
    )
  } finally {
    await rm(fixtureDir, { recursive: true, force: true })
  }
}
