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
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'

/**
 * Exercise the resolved store paths through project and global installs.
 * @param options - Disposable directories and the target's scope behavior
 * @param options.cwd - Disposable project workspace
 * @param options.localPackage - Package installed in the project and globally
 * @param options.projectStore - Store selected by top-level global config
 * @param options.globalStore - Store overridden for global package commands
 * @param options.consumesGlobalConfig - Whether the release supports the section
 * @param run - Exact pnpm runner within the fixture
 * @returns A promise resolved after install and lockfile assertions
 */
async function verifyStoreUsage(
  {
    cwd,
    localPackage,
    projectStore,
    globalStore,
    consumesGlobalConfig,
  }: {
    cwd: string
    localPackage: string
    projectStore: string
    globalStore: string
    consumesGlobalConfig: boolean
  },
  run: (args: string[]) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  await run(['install', '--ignore-scripts', '--no-frozen-lockfile'])
  await access(join(cwd, 'node_modules/scope-fixture/package.json'))
  const lockPath = join(cwd, 'pnpm-lock.yaml')
  const lockfile = await readFile(lockPath, 'utf8')
  await run(['install', '--ignore-scripts', '--frozen-lockfile'])
  assert.equal(await readFile(lockPath, 'utf8'), lockfile)
  await access(projectStore)
  await assert.rejects(access(globalStore), { code: 'ENOENT' })

  const globalInstall = await run([
    'add',
    '--global',
    '--ignore-scripts',
    `file:${localPackage}`,
  ])
  assert.ok(
    globalInstall.stdout.includes(
      consumesGlobalConfig ? globalStore : projectStore,
    ),
  )
  if (consumesGlobalConfig) {
    await access(globalStore)
  } else {
    await assert.rejects(access(globalStore), { code: 'ENOENT' })
  }
}

/**
 * Verify that only a global package install consumes globalPackagesConfig.
 * @param version - Exact pnpm release, including the preceding control
 * @param runPnpm - Runner for the selected release and disposable config directory
 * @returns A promise resolved after migration, config, and install checks
 */
export async function verifyGlobalPackagesConfig(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    command: { args: string[]; env: NodeJS.ProcessEnv },
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  if (!['12.21.0', '12.22.0'].includes(version)) {
    return
  }
  const consumesGlobalConfig = version === '12.22.0'
  const cwd = await mkdtemp(
    join(await realpath(tmpdir()), 'pnpm-global-packages-config-'),
  )
  const configHome = join(cwd, 'config-home')
  const configDir = join(configHome, 'pnpm')
  const globalBinDir = join(cwd, 'bin')
  const globalDir = join(cwd, 'global')
  const localPackage = join(cwd, 'local')
  const projectStore = join(cwd, 'project-store')
  const globalStore = join(cwd, 'global-store')
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const maxSockets = 8
  const env = {
    XDG_CONFIG_HOME: configHome,
    XDG_CACHE_HOME: join(cwd, 'cache'),
    XDG_STATE_HOME: join(cwd, 'state'),
    PNPM_HOME: join(cwd, 'pnpm-home'),
    PATH: [process.env.PATH, globalBinDir].join(delimiter),
  }
  const run = (args: string[]) => runPnpm(version, cwd, { args, env })
  try {
    await mkdir(configDir, { recursive: true })
    await mkdir(globalBinDir)
    await mkdir(localPackage)
    await writeFile(
      join(localPackage, 'package.json'),
      JSON.stringify({ name: 'scope-fixture', version: '1.0.0' }),
    )
    const projectOnly = { storeDir: join(cwd, 'refused-store') }
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'global-scope-fixture',
        private: true,
        dependencies: { 'scope-fixture': 'file:./local' },
        pnpm: { globalPackagesConfig: projectOnly, maxSockets },
      }),
    )
    const result = await migratePnpmSettings({ cwd, targetVersion: version })
    assert.match(
      result.warnings.join(),
      /project-refused.*globalPackagesConfig/u,
    )
    const migrated = await readFile(workspacePath, 'utf8')
    assert.deepEqual(parse(migrated), { maxSockets })
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')).pnpm, {
      globalPackagesConfig: projectOnly,
    })

    // Ask pnpm directly why the setting cannot be moved to project YAML.
    await writeFile(
      workspacePath,
      stringify({ globalPackagesConfig: projectOnly }),
    )
    const projectConfig = await run(['config', 'list', '--json'])
    assert.equal(
      JSON.parse(projectConfig.stdout).globalPackagesConfig,
      undefined,
    )
    assert.match(projectConfig.stderr, /globalPackagesConfig/u)
    if (consumesGlobalConfig) {
      assert.match(projectConfig.stderr, /cannot be set|were ignored/iu)
    }
    await writeFile(workspacePath, migrated)
    await writeFile(
      join(configDir, 'config.yaml'),
      stringify({
        globalBinDir,
        globalDir,
        storeDir: projectStore,
        globalPackagesConfig: { storeDir: globalStore },
      }),
    )
    const listed = await run(['config', 'list', '--json'])
    const resolved = JSON.parse(listed.stdout)
    assert.equal(resolved.maxSockets, maxSockets)
    assert.equal(resolved.storeDir, projectStore)
    assert.deepEqual(
      resolved.globalPackagesConfig,
      consumesGlobalConfig ? { storeDir: globalStore } : undefined,
    )
    if (consumesGlobalConfig) {
      assert.doesNotMatch(listed.stderr, /globalPackagesConfig/u)
    }
    await verifyStoreUsage(
      { cwd, projectStore, globalStore, localPackage, consumesGlobalConfig },
      run,
    )
    process.stdout.write(
      `pnpm ${version} global package configuration scope verified\n`,
    )
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
