import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'

/**
 * Exact pnpm release runner supplied by the compatibility harness.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Status for endpoints outside this fixture registry's packages.
 */
const HTTP_NOT_FOUND = 404

/**
 * Pack registry fixtures without pnpm stripping their pnpm.config entry.
 *
 * @param directory - Directory of the local package fixture
 * @param destination - Temporary registry tarball directory
 * @returns A promise resolved when npm has packed the files without scripts
 */
async function packPackage(
  directory: string,
  destination: string,
): Promise<void> {
  await promisify(execFile)(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--ignore-scripts', '--pack-destination', destination],
    { cwd: directory },
  )
}

/**
 * Pack the dependency policy and runtime package served by the mock registry.
 *
 * @param cwd - Temporary fixture root
 * @returns Compressed tarball bytes keyed by package name
 */
async function packFixtures(cwd: string): Promise<Map<string, Buffer>> {
  const tarballs = new Map<string, Buffer>()
  for (const name of ['fixture-include-policy', 'fixture-include-runtime']) {
    const directory = join(cwd, name)
    await mkdir(directory)
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        ...(name.endsWith('policy') ? { pnpm: { config: 'policy.yaml' } } : {}),
      }),
    )
    await writeFile(
      join(directory, 'policy.yaml'),
      stringify({
        saveExact: true,
        catalogs: { policy: { 'fixture-include-runtime': '1.0.0' } },
      }),
    )
    await packPackage(directory, cwd)
    tarballs.set(name, await readFile(join(cwd, `${name}-1.0.0.tgz`)))
  }
  return tarballs
}

/**
 * Exercise each strategy against an installed, read-only policy owner.
 *
 * @param version - Exact pnpm release under verification
 * @param cwd - Installed policy workspace
 * @returns A promise resolved after all strategies retain conflicting sources
 */
async function verifyReadonlyStrategies(
  version: string,
  cwd: string,
): Promise<void> {
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const policyPath = join(
    cwd,
    'node_modules/.pnpm-config/fixture-include-policy/policy.yaml',
  )
  const policyText = await readFile(policyPath, 'utf8')
  for (const strategy of ['discard', 'merge', 'overwrite'] as const) {
    await writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, pnpm: { saveExact: false } }),
    )
    const result = await migratePnpmSettings({
      cwd,
      targetVersion: version,
      strategy,
    })
    assert.match(result.warnings.join(), /read-only config dependency/u)
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')).pnpm, {
      saveExact: false,
    })
    assert.equal(
      parse(await readFile(workspacePath, 'utf8')).saveExact,
      undefined,
    )
    assert.equal(await readFile(policyPath, 'utf8'), policyText)
  }
  const root = await readFile(workspacePath, 'utf8')
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...manifest,
      pnpm: {
        configDependencies: { 'fixture-include-policy': '2.0.0' },
        saveExact: true,
      },
    }),
  )
  const pending = await migratePnpmSettings({
    cwd,
    targetVersion: version,
    strategy: 'overwrite',
  })
  assert.match(pending.warnings.join(), /read-only config dependency/u)
  assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')).pnpm, {
    saveExact: true,
  })
  assert.equal(
    parse(await readFile(workspacePath, 'utf8')).configDependencies[
      'fixture-include-policy'
    ],
    '2.0.0',
  )
  assert.equal(await readFile(policyPath, 'utf8'), policyText)
  await writeFile(workspacePath, root)
  await writeFile(manifestPath, JSON.stringify(manifest))
}

/**
 * Install a real policy package, consume its catalog, and preserve read-only owners.
 *
 * @param version - Exact release supporting delegated config dependencies
 * @param runPnpm - Runner executing the selected release
 * @returns A promise resolved after migration, installs, and server cleanup
 */
export async function verifyIncludedConfigDependency(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-include-packages-'))
  const server = createServer()
  try {
    const tarballs = await packFixtures(cwd)
    let registry = ''
    server.on('request', (request, response) => {
      const name = request.url?.slice(1)
      const tarball = tarballs.get(name ?? '')
      if (tarball && name) {
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            name,
            'dist-tags': { latest: '1.0.0' },
            time: { '1.0.0': '2020-01-01T00:00:00Z' },
            versions: {
              '1.0.0': {
                name,
                version: '1.0.0',
                dist: {
                  tarball: `${registry}${name}.tgz`,
                  integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`,
                },
              },
            },
          }),
        )
      } else if (
        name?.endsWith('.tgz') &&
        tarballs.has(name.slice(0, -'.tgz'.length))
      ) {
        response.end(tarballs.get(name.slice(0, -'.tgz'.length)))
      } else {
        response.writeHead(HTTP_NOT_FOUND).end()
      }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    registry = `http://127.0.0.1:${address.port}/`
    const manifestPath = join(cwd, 'package.json')
    const workspacePath = join(cwd, 'pnpm-workspace.yaml')
    const include = {
      'fixture-include-policy': ['saveExact', 'catalogs.policy'],
    }
    const root = {
      include,
      configDependencies: { 'fixture-include-policy': '1.0.0' },
      bootConfig: { minimumReleaseAge: 0 },
      minimumReleaseAge: 0,
      storeDir: join(cwd, 'store'),
      virtualStoreType: 'project',
      nodeLinker: 'isolated',
    }
    await writeFile(workspacePath, stringify(root))
    await writeFile(join(cwd, '.npmrc'), `registry=${registry}\n`)
    const manifest = {
      name: 'include-packages',
      private: true,
      dependencies: { 'fixture-include-runtime': 'catalog:policy' },
    }
    const policyValues = {
      saveExact: true,
      catalogs: { policy: { 'fixture-include-runtime': '1.0.0' } },
    }
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...manifest,
        pnpm: { ...policyValues, savePrefix: '~' },
      }),
    )
    const pending = await migratePnpmSettings({ cwd, targetVersion: version })
    assert.match(pending.warnings.join(), /read-only config dependency/u)
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      policyValues,
    )
    assert.equal(
      parse(await readFile(workspacePath, 'utf8')).saveExact,
      undefined,
    )
    const install = await runPnpm(version, cwd, [
      'install',
      '--no-frozen-lockfile',
    ])
    assert.doesNotMatch(install.stderr, /unrecognized|unknown.*setting/iu)
    const policyPath = join(
      cwd,
      'node_modules/.pnpm-config/fixture-include-policy/policy.yaml',
    )
    const policyText = await readFile(policyPath, 'utf8')
    await access(join(cwd, 'node_modules/fixture-include-runtime/package.json'))
    const listed = await runPnpm(version, cwd, ['config', 'list', '--json'])
    assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
    assert.equal(JSON.parse(listed.stdout).saveExact, true)
    assert.deepEqual(
      (await migratePnpmSettings({ cwd, targetVersion: version })).warnings,
      [],
    )
    assert.equal(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      undefined,
    )
    assert.equal(await readFile(policyPath, 'utf8'), policyText)
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
      ...root,
      savePrefix: '~',
    })
    const lockfilePath = join(cwd, 'pnpm-lock.yaml')
    const lockfile = await readFile(lockfilePath, 'utf8')
    await verifyReadonlyStrategies(version, cwd)
    await runPnpm(version, cwd, ['install', '--frozen-lockfile'])
    assert.equal(await readFile(lockfilePath, 'utf8'), lockfile)
    await rm(join(cwd, 'node_modules'), { recursive: true, force: true })
    await runPnpm(version, cwd, ['install', '--frozen-lockfile'])
    await access(policyPath)
    await access(join(cwd, 'node_modules/fixture-include-runtime/package.json'))
  } finally {
    if (server.listening) {
      const closed = once(server, 'close')
      server.close()
      await closed
    }
    await rm(cwd, { recursive: true, force: true })
  }
}
