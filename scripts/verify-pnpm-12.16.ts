import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import {
  PNPM_V12_15_MINIMUM_VERSION,
  PNPM_V12_16_MINIMUM_VERSION,
} from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Status returned for routes outside the registry fixture.
 */
const HTTP_NOT_FOUND = 404

/**
 * Exact release runner supplied by the compatibility harness.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Consume migrated 12.16 settings against a temporary HTTPS registry.
 *
 * @param options - Release, temporary workspace, runner, and migrated settings
 *
 * @returns A promise resolved after all behavior checks and server cleanup
 */
async function verifyConsumption(options: {
  version: string
  cwd: string
  runPnpm: PnpmRunner
  settings: {
    strictSsl: boolean
    localAddress: string
    runtime: boolean
    requiredScripts: string[]
    tag: string
  }
}): Promise<void> {
  const { version, cwd, runPnpm, settings } = options
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const packageName = 'fixture-dist-tag'
  const packageDir = join(cwd, 'fixture')
  await mkdir(packageDir)
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({ name: packageName, version: '1.0.0' }),
  )
  await runPnpm(version, packageDir, ['pack', '--pack-destination', cwd])
  const tarball = await readFile(join(cwd, `${packageName}-1.0.0.tgz`))
  await promisify(execFile)('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    join(cwd, 'key.pem'),
    '-out',
    join(cwd, 'cert.pem'),
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
  ])
  let registry = ''
  const server = createServer(
    {
      key: await readFile(join(cwd, 'key.pem')),
      cert: await readFile(join(cwd, 'cert.pem')),
    },
    (request, response) => {
      if (request.url === `/${packageName}`) {
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            name: packageName,
            'dist-tags': { latest: '2.0.0', next: '1.0.0' },
            versions: Object.fromEntries(
              ['1.0.0', '2.0.0'].map(packageVersion => [
                packageVersion,
                {
                  name: packageName,
                  version: packageVersion,
                  dist: {
                    tarball: `${registry}fixture.tgz`,
                    integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`,
                  },
                },
              ]),
            ),
          }),
        )
      } else if (request.url === '/fixture.tgz') {
        response.end(tarball)
      } else {
        response.writeHead(HTTP_NOT_FOUND).end()
      }
    },
  )
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    registry = `https://127.0.0.1:${address.port}/`
    const installSettings = {
      ...settings,
      registry,
      minimumReleaseAge: 0,
      fetchRetries: 0,
      storeDir: join(cwd, 'store'),
      virtualStoreType: 'project',
      nodeLinker: 'isolated',
      packages: ['packages/*'],
    }
    await writeFile(workspacePath, stringify(installSettings))
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'release-12.16',
        private: true,
        packageManager: `pnpm@${version}`,
        devEngines: { runtime: { name: 'node', version: '0.0.0' } },
      }),
    )
    // This invalid runtime can only install successfully if runtime:false is consumed.
    const added = await runPnpm(version, cwd, [
      'add',
      packageName,
      '--ignore-scripts',
    ])
    assert.doesNotMatch(
      added.stderr,
      /unrecognized|unknown.*setting|were ignored/iu,
    )
    assert.equal(
      JSON.parse(
        await readFile(
          join(cwd, 'node_modules', packageName, 'package.json'),
          'utf8',
        ),
      ).version,
      '1.0.0',
    )
    const lockfilePath = join(cwd, 'pnpm-lock.yaml')
    const lockfile = await readFile(lockfilePath, 'utf8')
    await runPnpm(version, cwd, [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
    ])
    assert.equal(await readFile(lockfilePath, 'utf8'), lockfile)

    // Certificate validation must fail when the migrated TLS preference is flipped.
    await writeFile(
      workspacePath,
      stringify({ ...installSettings, strictSsl: true }),
    )
    await assert.rejects(
      runPnpm(version, cwd, ['view', packageName, 'version']),
      /certificate|self.signed|UnknownIssuer/iu,
    )
    await writeFile(workspacePath, stringify(installSettings))

    await mkdir(join(cwd, 'packages/without-build'), { recursive: true })
    await writeFile(
      join(cwd, 'packages/without-build/package.json'),
      JSON.stringify({ name: 'without-build', version: '1.0.0' }),
    )
    await assert.rejects(
      runPnpm(version, cwd, ['-r', 'run', 'build']),
      /ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT/u,
    )
    await writeFile(
      join(cwd, 'packages/without-build/package.json'),
      JSON.stringify({
        name: 'without-build',
        version: '1.0.0',
        scripts: { build: 'node -e "process.exit(0)"' },
      }),
    )
    await runPnpm(version, cwd, ['-r', 'run', 'build'])
    process.stdout.write(
      `pnpm ${version} 12.16 TLS, tag, runtime, and required scripts consumed\n`,
    )
  } finally {
    const closed = once(server, 'close')
    server.close()
    await closed
  }
}

/**
 * Verify 12.16 migration boundaries and actual TLS, tag, runtime, and script use.
 * OpenSSL creates a disposable self-signed certificate for the loopback registry.
 *
 * @param version - Exact release selected by the compatibility harness
 * @param runPnpm - Runner executing that release in isolated workspaces
 *
 * @returns A promise resolved after config, install, and consumption assertions
 */
export async function verifyPnpm12_16(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const parsedVersion = parsePnpmVersion(version)
  if (!supportsMinimumVersion(parsedVersion, PNPM_V12_15_MINIMUM_VERSION)) {
    return
  }
  const supported = supportsMinimumVersion(
    parsedVersion,
    PNPM_V12_16_MINIMUM_VERSION,
  )
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-settings-12.16-'))
  try {
    const manifestPath = join(cwd, 'package.json')
    const workspacePath = join(cwd, 'pnpm-workspace.yaml')
    const settings = {
      strictSsl: false,
      localAddress: '127.0.0.1',
      runtime: false,
      requiredScripts: ['build'],
      tag: 'next',
    }
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'release-12.16',
        private: true,
        packageManager: `pnpm@${version}`,
        pnpm: { ...settings, saveExact: true },
      }),
    )
    await migratePnpmSettings({ cwd })
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
      saveExact: true,
      ...(supported ? settings : {}),
    })
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      supported ? undefined : settings,
    )
    const listed = await runPnpm(version, cwd, ['config', 'list', '--json'])
    assert.doesNotMatch(
      listed.stderr,
      /unrecognized|unknown.*setting|were ignored/iu,
    )
    const config = JSON.parse(listed.stdout)
    if (!supported) {
      for (const key of Object.keys(settings)) {
        assert.equal(config[key], undefined)
      }
      process.stdout.write(
        `pnpm ${version} 12.16 preceding boundary verified\n`,
      )
      return
    }
    for (const [key, value] of Object.entries(settings)) {
      assert.deepEqual(config[key], value)
    }

    await verifyConsumption({ version, cwd, runPnpm, settings })
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
