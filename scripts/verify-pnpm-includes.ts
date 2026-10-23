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
import { join, resolve } from 'node:path'
import process from 'node:process'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import {
  PNPM_V12_14_MINIMUM_VERSION,
  PNPM_V12_15_MINIMUM_VERSION,
} from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'
import { verifyIncludedConfigDependency } from './verify-pnpm-include-packages'

/**
 * Exact pnpm release runner supplied by the compatibility harness.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Create local owners and a file dependency without registry traffic.
 *
 * @param cwd - Temporary workspace root
 * @param include - Root delegation index
 * @returns Original root text and the local owner's path
 */
async function prepareLocalFixture(
  cwd: string,
  include: Record<string, string[]>,
): Promise<{ originalRoot: string; localPath: string }> {
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  await mkdir(join(cwd, 'config'))
  await mkdir(join(cwd, 'dependency'))
  await mkdir(join(cwd, 'packages/app'), { recursive: true })
  await writeFile(
    join(cwd, 'dependency/package.json'),
    JSON.stringify({
      name: 'fixture-included-dependency',
      version: '1.0.0',
      main: 'index.js',
    }),
  )
  await writeFile(join(cwd, 'dependency/index.js'), 'module.exports = 42\n')
  await writeFile(
    join(cwd, 'packages/app/package.json'),
    JSON.stringify({ name: 'included-app', private: true }),
  )
  const originalRoot = `# the root remains unchanged\n${stringify({ include, storeDir: join(cwd, 'store'), virtualStoreType: 'project' })}`
  await writeFile(workspacePath, originalRoot)
  const localPath = join(cwd, 'config/layout.yaml')
  await writeFile(
    localPath,
    `# local owner\n${stringify({ nodeLinker: 'isolated', catalog: { 'fixture-included-dependency': '../dependency' } })}`,
  )
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: 'include-consumption',
      private: true,
      dependencies: { 'fixture-included-dependency': 'catalog:' },
      pnpm: {
        nodeLinker: 'hoisted',
        modulesDir: './vendor_modules',
        packages: ['packages/*'],
        catalog: { unused: '^1' },
        catalogs: { frontend: { example: '^1' } },
      },
    }),
  )
  await writeFile(join(cwd, '.npmrc'), 'save-exact=true\n')
  return { originalRoot, localPath }
}

/**
 * Verify physical local owners and pnpm's consumption of their relative paths.
 *
 * @param version - Exact pnpm release with include support
 * @param runPnpm - Runner executing the selected release
 * @returns A promise resolved after local and config dependency verification
 */
export async function verifyWorkspaceIncludes(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const parsedVersion = parsePnpmVersion(version)
  if (!supportsMinimumVersion(parsedVersion, PNPM_V12_14_MINIMUM_VERSION)) {
    return
  }
  const supported = supportsMinimumVersion(
    parsedVersion,
    PNPM_V12_15_MINIMUM_VERSION,
  )
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-includes-'))
  try {
    const manifestPath = join(cwd, 'package.json')
    const workspacePath = join(cwd, 'pnpm-workspace.yaml')
    const include = {
      './config/layout.yaml': [
        'nodeLinker',
        'modulesDir',
        'packages',
        'catalog',
        'catalogs.frontend',
        'saveExact',
      ],
    }
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'include-boundary',
        private: true,
        pnpm: { include, saveExact: true },
      }),
    )
    if (supported) {
      const { originalRoot, localPath } = await prepareLocalFixture(
        cwd,
        include,
      )
      const migration = await migratePnpmSettings({
        cwd,
        targetVersion: version,
        strategy: 'overwrite',
      })
      assert.deepEqual(migration.warnings, [])
      assert.equal(await readFile(workspacePath, 'utf8'), originalRoot)
      assert.equal(
        JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
        undefined,
      )
      await assert.rejects(access(join(cwd, '.npmrc')), { code: 'ENOENT' })
      const local = parse(await readFile(localPath, 'utf8'))
      assert.equal(local.modulesDir, '../vendor_modules')
      assert.equal(
        local.catalog['fixture-included-dependency'],
        '../dependency',
      )
      assert.deepEqual(local.packages, ['../packages/*'])
      const listed = await runPnpm(version, cwd, ['config', 'list', '--json'])
      assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
      const config = JSON.parse(listed.stdout)
      assert.equal(config.nodeLinker, 'hoisted')
      assert.equal(resolve(cwd, config.modulesDir), join(cwd, 'vendor_modules'))
      assert.equal(config.saveExact, true)
      const install = await runPnpm(version, cwd, [
        'install',
        '--no-frozen-lockfile',
      ])
      assert.doesNotMatch(install.stderr, /unrecognized|unknown.*setting/iu)
      await access(
        join(cwd, 'vendor_modules/fixture-included-dependency/index.js'),
      )
      const lockfile = await readFile(join(cwd, 'pnpm-lock.yaml'), 'utf8')
      await runPnpm(version, cwd, ['install', '--frozen-lockfile'])
      assert.equal(
        await readFile(join(cwd, 'pnpm-lock.yaml'), 'utf8'),
        lockfile,
      )
      assert.deepEqual(
        (await migratePnpmSettings({ cwd, targetVersion: version }))
          .changedFiles,
        [],
      )
      await writeFile(workspacePath, `${originalRoot}\nsaveExact: false\n`)
      await assert.rejects(runPnpm(version, cwd, ['config', 'list', '--json']))
      await writeFile(workspacePath, originalRoot)
      await verifyIncludedConfigDependency(version, runPnpm)
    } else {
      const result = await migratePnpmSettings({ cwd, targetVersion: version })
      assert.match(result.warnings.join(), /include/u)
      assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
        saveExact: true,
      })
      assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')).pnpm, {
        include,
      })
    }
    process.stdout.write(
      `pnpm ${version} include ownership and consumption verified\n`,
    )
  } finally {
    await rm(cwd, { force: true, recursive: true })
  }
}
