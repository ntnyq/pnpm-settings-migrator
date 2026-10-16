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
  PNPM_V12_13_MINIMUM_VERSION,
  PNPM_V12_14_MINIMUM_VERSION,
} from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Run an exact pnpm release inside an isolated workspace.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Compare fresh dependency trees to prove exclusion and cache reuse controls.
 *
 * @param version - Exact pnpm release under verification
 * @param fixtureDir - Isolated workspace with a completed first install
 * @param runPnpm - Runner for the selected release
 *
 * @returns A promise resolved after frozen installs and cache assertions
 */
async function verifyBuildCache(
  version: string,
  fixtureDir: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  const settings = parse(await readFile(workspacePath, 'utf8'))
  const excludesBuilds = supportsMinimumVersion(
    parsePnpmVersion(version),
    PNPM_V12_14_MINIMUM_VERSION,
  )
  const builtPath = join(
    fixtureDir,
    'node_modules/fixture-cache-build/built.txt',
  )
  const firstBuild = await readFile(builtPath, 'utf8')
  const lockfilePath = join(fixtureDir, 'pnpm-lock.yaml')
  const lockfile = await readFile(lockfilePath, 'utf8')
  await runPnpm(version, fixtureDir, ['install', '--frozen-lockfile'])
  assert.equal(await readFile(lockfilePath, 'utf8'), lockfile)
  await rm(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
  await runPnpm(version, fixtureDir, ['install', '--frozen-lockfile'])
  const secondBuild = await readFile(builtPath, 'utf8')
  if (excludesBuilds) {
    assert.notEqual(secondBuild, firstBuild)
    await writeFile(
      workspacePath,
      stringify({
        ...settings,
        sideEffectsCache: { read: true, write: true, exclude: [] },
      }),
    )
    await rm(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    await runPnpm(version, fixtureDir, ['install', '--frozen-lockfile'])
    const cachedBuild = await readFile(builtPath, 'utf8')
    await rm(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    await runPnpm(version, fixtureDir, ['install', '--frozen-lockfile'])
    assert.equal(await readFile(builtPath, 'utf8'), cachedBuild)
  } else {
    assert.equal(secondBuild, firstBuild)
  }
}

/**
 * Check actual map generation, file-index storage, and build cache exclusion.
 *
 * @param version - Exact release supporting package maps
 * @param fixtureDir - Isolated installation workspace
 * @param runPnpm - Runner for the selected pnpm release
 *
 * @returns A promise resolved after installs and consumption assertions
 */
async function verifyInstallConsumption(
  version: string,
  fixtureDir: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const excludesBuilds = supportsMinimumVersion(
    parsePnpmVersion(version),
    PNPM_V12_14_MINIMUM_VERSION,
  )
  const packageDir = join(fixtureDir, 'build-package')
  await mkdir(packageDir)
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: 'fixture-cache-build',
      version: '1.0.0',
      main: 'index.js',
      packageManager: `pnpm@${version}`,
      scripts: { install: 'node build.cjs' },
    }),
  )
  await writeFile(join(packageDir, 'index.js'), 'module.exports = 42\n')
  await writeFile(
    join(packageDir, 'build.cjs'),
    "require('node:fs').writeFileSync('built.txt', require('node:crypto').randomUUID())\n",
  )
  await runPnpm(version, packageDir, ['pack', '--pack-destination', fixtureDir])
  const manifestPath = join(fixtureDir, 'package.json')
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  const settings = {
    nodePackageMap: { mode: 'write-only', type: 'loose' },
    nodeExperimentalPackageMap: true,
    nodePackageMapType: 'standard',
    storeIndexFormat: 'files',
    storeDir: join(fixtureDir, 'store'),
    virtualStoreType: 'project',
    nodeLinker: 'isolated',
    dangerouslyAllowAllBuilds: true,
    sideEffectsCache: {
      read: true,
      write: true,
      ...(excludesBuilds ? { exclude: ['fixture-cache-build'] } : {}),
    },
  }
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: 'package-map-consumption',
      private: true,
      packageManager: `pnpm@${version}`,
      dependencies: {
        'fixture-cache-build': 'file:fixture-cache-build-1.0.0.tgz',
      },
      scripts: {
        check:
          "node -e \"if (require('fixture-cache-build') !== 42 || (process.env.NODE_OPTIONS || '').includes('--experimental-package-map')) process.exit(1)\"",
      },
      pnpm: settings,
    }),
  )
  await rm(workspacePath, { force: true })
  assert.deepEqual(
    (await migratePnpmSettings({ cwd: fixtureDir })).warnings,
    [],
  )
  assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), settings)
  assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).pnpm, undefined)
  const listed = await runPnpm(version, fixtureDir, [
    'config',
    'list',
    '--json',
  ])
  assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
  const config = JSON.parse(listed.stdout)
  assert.deepEqual(config.nodePackageMap, settings.nodePackageMap)
  assert.equal(config.nodeExperimentalPackageMap, false)
  assert.equal(config.nodePackageMapType, 'loose')
  assert.equal(config.storeIndexFormat, 'files')
  if (excludesBuilds) {
    assert.deepEqual(config.sideEffectsCache.exclude, ['fixture-cache-build'])
  }
  const mapPath = join(fixtureDir, 'node_modules/.package-map.json')
  const install = await runPnpm(version, fixtureDir, [
    'install',
    '--no-frozen-lockfile',
  ])
  assert.doesNotMatch(install.stderr, /unrecognized|unknown.*setting/iu)
  await access(mapPath)
  const storePath = (
    await runPnpm(version, fixtureDir, ['store', 'path'])
  ).stdout.trim()
  await access(join(storePath, 'index'))
  await assert.rejects(access(join(storePath, 'index.db')), { code: 'ENOENT' })
  await runPnpm(version, fixtureDir, ['run', 'check'])
  await verifyBuildCache(version, fixtureDir, runPnpm)
  await writeFile(
    workspacePath,
    stringify({ ...settings, nodePackageMap: { mode: 'off' } }),
  )
  // A no-op frozen install can retain an earlier map; test a fresh tree.
  await rm(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
  await runPnpm(version, fixtureDir, ['install', '--frozen-lockfile'])
  await assert.rejects(access(mapPath), { code: 'ENOENT' })
}

/**
 * Verify 12.13 fields, 12.14 exclusions, and both preceding release boundaries.
 *
 * @param version - Exact pnpm release selected by the compatibility harness
 * @param runPnpm - Runner for the selected release
 *
 * @returns A promise resolved after parsing, installs, and temporary cleanup
 */
export async function verifyPnpm12_13(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const parsed = parsePnpmVersion(version)
  // Include the actual predecessor to the first new capability.
  // eslint-disable-next-line no-magic-numbers -- Exact preceding release.
  if (!supportsMinimumVersion(parsed, [12, 12, 1])) {
    return
  }
  const supportsMap = supportsMinimumVersion(
    parsed,
    PNPM_V12_13_MINIMUM_VERSION,
  )
  const supportsExclude = supportsMinimumVersion(
    parsed,
    PNPM_V12_14_MINIMUM_VERSION,
  )
  const fixtureDir = await mkdtemp(join(tmpdir(), 'pnpm-settings-12.13-'))
  const manifestPath = join(fixtureDir, 'package.json')
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  const mapSettings = {
    nodePackageMap: { mode: 'write-only', type: 'loose' },
    storeIndexFormat: 'files',
  }
  const cacheSettings = {
    sideEffectsCache: { read: false, exclude: ['java', '@native/*'] },
  }
  try {
    const manifest = {
      name: 'release-settings',
      private: true,
      packageManager: `pnpm@${version}`,
    }
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...manifest,
        pnpm: { ...mapSettings, ...cacheSettings, saveExact: true },
      }),
    )
    const result = await migratePnpmSettings({ cwd: fixtureDir })
    assert.equal(result.warnings.length > 0, !supportsExclude)
    const expected = {
      saveExact: true,
      ...(supportsMap ? mapSettings : {}),
      ...(supportsExclude ? cacheSettings : {}),
    }
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), expected)
    const retained = {
      ...(supportsMap ? {} : mapSettings),
      ...(supportsExclude ? {} : cacheSettings),
    }
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      supportsExclude ? undefined : retained,
    )
    const config = await runPnpm(version, fixtureDir, [
      'config',
      'list',
      '--json',
    ])
    assert.doesNotMatch(config.stderr, /unrecognized|unknown.*setting/iu)
    assert.equal(
      JSON.parse(config.stdout).storeIndexFormat,
      supportsMap ? 'files' : undefined,
    )

    // Reading the source section directly proves older releases ignore its new field.
    await writeFile(workspacePath, stringify(cacheSettings))
    const cacheConfig = JSON.parse(
      (await runPnpm(version, fixtureDir, ['config', 'list', '--json'])).stdout,
    )
    assert.deepEqual(
      cacheConfig.sideEffectsCache?.exclude,
      supportsExclude ? cacheSettings.sideEffectsCache.exclude : undefined,
    )
    if (supportsMap) {
      for (const invalid of [
        { nodePackageMap: { mode: 'invalid' } },
        { nodePackageMap: { type: false } },
        { storeIndexFormat: 'invalid' },
      ]) {
        await writeFile(workspacePath, stringify(invalid))
        await assert.rejects(
          runPnpm(version, fixtureDir, ['config', 'list', '--json']),
        )
      }
      for (const valid of [
        { nodePackageMap: null, storeIndexFormat: null },
        { nodePackageMap: { mode: null, type: null } },
      ]) {
        await writeFile(workspacePath, stringify(valid))
        await runPnpm(version, fixtureDir, ['config', 'list', '--json'])
      }
      await verifyInstallConsumption(version, fixtureDir, runPnpm)
    } else {
      await writeFile(workspacePath, stringify(mapSettings))
      const oldConfig = JSON.parse(
        (await runPnpm(version, fixtureDir, ['config', 'list', '--json']))
          .stdout,
      )
      assert.equal(oldConfig.nodePackageMap, undefined)
      assert.equal(oldConfig.storeIndexFormat, undefined)
    }
    process.stdout.write(
      `pnpm ${version} 12.13/12.14 boundaries and consumption verified\n`,
    )
  } finally {
    await rm(fixtureDir, { recursive: true, force: true })
  }
}
