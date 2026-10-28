import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parseAllDocuments, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import {
  PNPM_V11_28_9_MINIMUM_VERSION,
  PNPM_V12_15_MINIMUM_VERSION,
} from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'
import { verifyInvalidRegistrySiblings } from './verify-pnpm-registry-declarations'

/**
 * HTTP response for fixture routes that do not exist.
 */
const HTTP_NOT_FOUND = 404

/**
 * Generous unpacked size for successful fixture installs.
 */
const MAX_UNPACKED_BYTES = 1048576

/**
 * Package identity served by the local registry fixture.
 */
const packageName = 'fixture-unpacked-limit'

/**
 * Uncompressed payload size, larger than the failing limit.
 */
const payloadBytes = 8192

/**
 * Exact release runner supplied by the compatibility harness.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Prepare a compressible package tarball without external package downloads.
 *
 * @param version - Release used to pack the fixture
 * @param cwd - Temporary workspace directory
 * @param runPnpm - Exact release runner
 *
 * @returns The compressed tarball bytes
 */
async function createTarball(
  version: string,
  cwd: string,
  runPnpm: PnpmRunner,
): Promise<Buffer> {
  const packageDir = join(cwd, 'fixture')
  await mkdir(packageDir)
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({ name: packageName, version: '1.0.0' }),
  )
  // Compressible payload ensures the unpacked limit, not download size, is tested.
  await writeFile(join(packageDir, 'payload.txt'), 'x'.repeat(payloadBytes))
  await runPnpm(version, packageDir, ['pack', '--pack-destination', cwd])
  const tgz = await readFile(join(cwd, `${packageName}-1.0.0.tgz`))
  return tgz
}

/**
 * Require a subsequent install to fetch packages from the fixture registry.
 *
 * @param cwd - Temporary workspace whose dependency tree and store are reset
 *
 * @returns A promise resolved after both paths are removed
 */
async function resetInstall(cwd: string): Promise<void> {
  await rm(join(cwd, 'node_modules'), { recursive: true, force: true })
  await rm(join(cwd, 'store'), { recursive: true, force: true })
}

/**
 * Verify v11 pnpr URLs and frozen installs after registry migration.
 *
 * @param options - Release, workspace, runner, registry, and migrated settings
 *
 * @returns A promise resolved after fresh and frozen installs
 */
async function verifyV11Pnpr(options: {
  version: string
  cwd: string
  runPnpm: PnpmRunner
  registry: string
  validSettings: Record<string, unknown>
}): Promise<void> {
  const { version, cwd, runPnpm, registry, validSettings } = options
  if (
    !supportsMinimumVersion(
      parsePnpmVersion(version),
      PNPM_V11_28_9_MINIMUM_VERSION,
    )
  ) {
    return
  }
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const lockPath = join(cwd, 'pnpm-lock.yaml')
  const registries = {
    [registry]: { serverType: 'pnpr', scopes: ['@'], prefix: 'fixture' },
    'https://unused.example/': { serverType: 'npm', scopes: ['@unused'] },
  }
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: 'pnpr-consumption',
      private: true,
      dependencies: { [packageName]: 'fixture:1.0.0' },
      pnpm: { registries },
    }),
  )
  await writeFile(
    workspacePath,
    stringify({
      ...validSettings,
    }),
  )
  assert.deepEqual(
    (await migratePnpmSettings({ cwd, targetVersion: version })).warnings,
    [],
  )
  const listed = await runPnpm(version, cwd, ['config', 'list', '--json'])
  assert.doesNotMatch(
    listed.stderr,
    /unrecognized|unknown.*setting|were ignored/iu,
  )
  await resetInstall(cwd)
  await rm(lockPath)
  const installed = await runPnpm(version, cwd, [
    'install',
    '--no-frozen-lockfile',
  ])
  assert.doesNotMatch(
    installed.stderr,
    /unrecognized|unknown.*setting|were ignored/iu,
  )
  const pnprLockfileText = await readFile(lockPath, 'utf8')
  const pnprLockfile = parseAllDocuments(pnprLockfileText)[0]!.toJSON()
  assert.equal(
    pnprLockfile.packages[`${packageName}@fixture:1.0.0`].resolution.tarball,
    undefined,
  )
  await resetInstall(cwd)
  await runPnpm(version, cwd, ['install', '--frozen-lockfile'])
  assert.equal(await readFile(lockPath, 'utf8'), pnprLockfileText)
  await verifyInvalidRegistrySiblings(options, registries)
}

/**
 * Hash fixture bytes in the integrity representation used by pnpm.
 *
 * @param bytes - Compressed or uncompressed tarball bytes
 *
 * @returns SHA-512 subresource integrity string
 */
function hash(bytes: Uint8Array): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

/**
 * Prove unpack limits and tar integrity through a local, deterministic registry.
 *
 * @param version - Release supporting unpack limits
 * @param cwd - Temporary workspace directory
 * @param runPnpm - Exact release runner
 *
 * @returns A promise resolved after real installs and server cleanup
 */
export async function verifyTarballConsumption(
  version: string,
  cwd: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const supportsTar = supportsMinimumVersion(
    parsePnpmVersion(version),
    PNPM_V12_15_MINIMUM_VERSION,
  )
  const tgz = await createTarball(version, cwd, runPnpm)
  const tar = gunzipSync(tgz)
  let registry = ''
  let servesTar = false
  const server = createServer((request, response) => {
    const requestPath = request.url?.replace(/^\/tar/u, '')
    if (requestPath === `/${packageName}`) {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          name: packageName,
          'dist-tags': { latest: '1.0.0' },
          versions: {
            '1.0.0': {
              name: packageName,
              version: '1.0.0',
              dist: servesTar
                ? { integrity: hash(tar) }
                : {
                    tarball: `${registry}${packageName}@1.0.0`,
                    integrity: hash(tgz),
                  },
            },
          },
        }),
      )
      return
    }
    if (
      requestPath === `/${packageName}/-/fixture.tgz` ||
      requestPath === `/${packageName}@1.0.0`
    ) {
      response.end(servesTar ? tar : tgz)
      return
    }
    response.writeHead(HTTP_NOT_FOUND).end()
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    registry = `http://127.0.0.1:${address.port}/`
    const manifestPath = join(cwd, 'package.json')
    const workspacePath = join(cwd, 'pnpm-workspace.yaml')
    await writeFile(join(cwd, '.npmrc'), `registry=${registry}\n`)
    const settings = {
      registry,
      storeDir: join(cwd, 'store'),
      virtualStoreType: 'project',
      nodeLinker: supportsTar ? 'isolated' : 'hoisted',
      ...(supportsTar
        ? {}
        : {
            autoInstallPeersFromHighestMatch: false,
            externalDependencies: ['example'],
          }),
      minimumReleaseAge: 0,
      fetchRetries: 0,
      maxTarballUnpackedSize: 1024,
      ...(supportsTar ? { lockfile: { integrityTarget: 'tar' } } : {}),
    }
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'unpack-consumption',
        private: true,
        packageManager: `pnpm@${version}`,
        dependencies: { [packageName]: '1.0.0' },
        pnpm: settings,
      }),
    )
    await rm(workspacePath, { force: true })
    assert.deepEqual((await migratePnpmSettings({ cwd })).warnings, [])
    await assert.rejects(
      runPnpm(version, cwd, ['install', '--no-frozen-lockfile']),
      error => {
        assert.ok(error && typeof error === 'object')
        assert.match(
          String(Reflect.get(error, 'stdout')) +
            String(Reflect.get(error, 'stderr')),
          /ERR_PNPM_TARBALL_TOO_LARGE|files total more than 1024 bytes/u,
        )
        return true
      },
    )
    const validSettings = {
      ...settings,
      maxTarballUnpackedSize: MAX_UNPACKED_BYTES,
    }
    await writeFile(workspacePath, stringify(validSettings))
    await runPnpm(version, cwd, ['install', '--no-frozen-lockfile'])
    assert.equal(
      (await readFile(join(cwd, 'node_modules', packageName, 'payload.txt')))
        .length,
      payloadBytes,
    )
    const lockPath = join(cwd, 'pnpm-lock.yaml')
    const lockfileText = await readFile(lockPath, 'utf8')
    if (supportsTar) {
      const lockfile = parseAllDocuments(lockfileText)
        .map(document => document.toJSON())
        .find(document => document?.settings?.integrityTarget === 'tar')
      assert.equal(lockfile.settings.integrityTarget, 'tar')
      assert.equal(
        lockfile.packages[`${packageName}@1.0.0`].resolution.integrity,
        hash(tar),
      )
    }
    await runPnpm(version, cwd, ['install', '--frozen-lockfile'])
    assert.equal(await readFile(lockPath, 'utf8'), lockfileText)
    await verifyV11Pnpr({ version, cwd, runPnpm, registry, validSettings })

    if (supportsTar) {
      servesTar = true
      // A distinct registry URL avoids reusing the tgz registry's cached metadata.
      registry += 'tar/'
      await writeFile(join(cwd, '.npmrc'), `registry=${registry}\n`)
      await writeFile(
        manifestPath,
        JSON.stringify({
          name: 'tar-consumption',
          private: true,
          dependencies: { [packageName]: 'fixture:1.0.0' },
        }),
      )
      await writeFile(
        workspacePath,
        stringify({
          ...validSettings,
          registry,
          registries: {
            [registry]: {
              serverType: 'pnpr',
              scopes: ['@'],
              prefix: 'fixture',
            },
          },
        }),
      )
      await resetInstall(cwd)
      await rm(lockPath)
      const install = await runPnpm(version, cwd, [
        'install',
        '--no-frozen-lockfile',
      ])
      assert.doesNotMatch(
        install.stderr,
        /unrecognized|unknown.*setting|were ignored/iu,
      )
      const lockfile = parseAllDocuments(
        await readFile(lockPath, 'utf8'),
      )[0]!.toJSON()
      assert.equal(
        lockfile.packages[`${packageName}@fixture:1.0.0`].resolution.integrity,
        hash(tar),
      )
      assert.equal(
        lockfile.packages[`${packageName}@fixture:1.0.0`].resolution.tarball,
        undefined,
      )
      await resetInstall(cwd)
      await runPnpm(version, cwd, ['install', '--frozen-lockfile'])
    }
  } finally {
    const closed = once(server, 'close')
    server.close()
    await closed
  }
}
