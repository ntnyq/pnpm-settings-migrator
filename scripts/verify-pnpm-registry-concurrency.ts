import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migratePnpmSettings } from '../src'

/**
 * Keep metadata responses open long enough for concurrent requests to overlap.
 */
const METADATA_DELAY_MS = 100

/**
 * Refuse endpoints other than the fixture's package metadata.
 */
const HTTP_NOT_FOUND = 404

/**
 * Observe real request concurrency against a temporary loopback npm registry.
 *
 * The registry serves deterministic package metadata for lockfile resolution;
 * no package is published and no tarball or lifecycle script is executed.
 *
 * @param version - Exact pnpm release supporting registry concurrency limits
 * @param runPnpm - Runner for the selected release in an isolated workspace
 *
 * @returns A promise resolved after observing both caps and closing the server
 */
export async function verifyRegistryRequestConcurrency(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  let activeRequests = 0
  let maximumRequests = 0
  let completedRequests = 0
  let registry = ''
  const server = createServer((request, response) => {
    const name = request.url?.slice(1)
    if (!name?.startsWith('pnpm-concurrency-') || name.endsWith('.tgz')) {
      response.writeHead(HTTP_NOT_FOUND).end()
      return
    }
    activeRequests++
    maximumRequests = Math.max(maximumRequests, activeRequests)
    setTimeout(() => {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          name,
          'dist-tags': { latest: '1.0.0' },
          versions: {
            '1.0.0': {
              name,
              version: '1.0.0',
              dist: {
                tarball: `${registry}${name}.tgz`,
                shasum: '0000000000000000000000000000000000000000',
              },
            },
          },
          time: { '1.0.0': '2020-01-01T00:00:00.000Z' },
        }),
      )
      activeRequests--
      completedRequests++
    }, METADATA_DELAY_MS)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  registry = `http://127.0.0.1:${address.port}/`
  try {
    for (const cap of [1, 2]) {
      const fixtureDir = await mkdtemp(join(tmpdir(), 'pnpm-registry-cap-'))
      try {
        maximumRequests = 0
        completedRequests = 0
        const dependencies = Object.fromEntries(
          ['first', 'second', 'third', 'fourth'].map(name => [
            `pnpm-concurrency-${cap}-${name}`,
            '^1.0.0',
          ]),
        )
        await writeFile(
          join(fixtureDir, 'package.json'),
          JSON.stringify({
            name: 'registry-request-concurrency',
            packageManager: `pnpm@${version}`,
            dependencies,
            pnpm: {
              networkConcurrency: Object.keys(dependencies).length,
              registries: {
                [registry]: { scopes: ['@'], networkConcurrency: cap },
              },
            },
          }),
        )
        const migration = await migratePnpmSettings({ cwd: fixtureDir })
        assert.deepEqual(migration.warnings, [])
        await runPnpm(version, fixtureDir, [
          'install',
          '--lockfile-only',
          '--ignore-scripts',
        ])
        assert.equal(completedRequests, Object.keys(dependencies).length)
        assert.equal(maximumRequests, cap)
        const lockfilePath = join(fixtureDir, 'pnpm-lock.yaml')
        const lockfile = await readFile(lockfilePath, 'utf8')
        await runPnpm(version, fixtureDir, [
          'install',
          '--lockfile-only',
          '--frozen-lockfile',
          '--ignore-scripts',
        ])
        assert.equal(await readFile(lockfilePath, 'utf8'), lockfile)
        assert.equal(completedRequests, Object.keys(dependencies).length)
      } finally {
        await rm(fixtureDir, { force: true, recursive: true })
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }
}
