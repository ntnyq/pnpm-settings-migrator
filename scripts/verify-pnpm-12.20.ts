import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parseAllDocuments } from 'yaml'
import { PNPM_V12_19_MINIMUM_VERSION } from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Find the fixture package in the project lockfile document.
 * @param lockfile - Written lockfile, possibly with a package-manager document
 * @returns The local fixture package entry
 */
function getLocalPackageEntry(lockfile: string) {
  const entry = parseAllDocuments(lockfile)
    .map(document => document.toJS()?.packages?.['local@file:local'])
    .find(value => value !== undefined)
  assert.ok(entry, 'The lockfile should contain the local fixture package')
  return entry
}

/**
 * Check v13 directory input records without adding a new migration capability.
 *
 * @param version - Exact pnpm release; 12.19 is the preceding control
 * @param runPnpm - Harness runner for the disposable fixture
 * @returns A promise resolved after lockfile and frozen install assertions
 */
export async function verifyPnpm12_20(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  const parsed = parsePnpmVersion(version)
  if (!supportsMinimumVersion(parsed, PNPM_V12_19_MINIMUM_VERSION)) {
    return
  }
  // eslint-disable-next-line no-magic-numbers -- Exact upstream behavior boundary.
  const recordsInputs = supportsMinimumVersion(parsed, [12, 20, 0])
  // eslint-disable-next-line no-magic-numbers -- Exact upstream format boundary.
  const recordsInlineInputs = supportsMinimumVersion(parsed, [12, 22, 0])
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-settings-12.20-'))
  const run = (args: string[]) => runPnpm(version, cwd, args)
  try {
    const local = join(cwd, 'local')
    const child = join(cwd, 'child')
    await mkdir(local)
    await mkdir(child)
    await writeFile(
      join(child, 'package.json'),
      JSON.stringify({ name: 'child', version: '1.0.0' }),
    )
    await writeFile(
      join(cwd, 'pnpm-workspace.yaml'),
      'lockfile:\n  format: v13\n',
    )
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({
        name: 'directory-consumer',
        private: true,
        packageManager: `pnpm@${version}`,
        dependencies: { local: 'file:./local' },
      }),
    )
    const writeLocal = (range: string) =>
      writeFile(
        join(local, 'package.json'),
        JSON.stringify({
          name: 'local',
          version: '1.0.0',
          dependencies: { child: 'file:../child', 'is-number': range },
          dependenciesMeta: { child: { injected: true } },
        }),
      )
    await writeLocal('7.0.0')
    await run(['install', '--no-frozen-lockfile', '--ignore-scripts'])
    const lockPath = join(cwd, 'pnpm-lock.yaml')
    const original = await readFile(lockPath, 'utf8')
    const localEntry = getLocalPackageEntry(original)
    assert.equal(
      Object.hasOwn(localEntry, 'specifiers'),
      recordsInputs && !recordsInlineInputs,
    )
    if (recordsInlineInputs) {
      assert.deepEqual(localEntry.dependencies.child, {
        specifier: 'file:../child',
        version: 'file:child',
        injected: true,
      })
      assert.equal(localEntry.dependenciesMeta, undefined)
    }
    await run(['install', '--frozen-lockfile', '--ignore-scripts'])
    assert.equal(await readFile(lockPath, 'utf8'), original)
    await writeLocal('^7.0.0')
    await rm(join(cwd, 'node_modules'), { recursive: true, force: true })
    const frozen = run(['install', '--frozen-lockfile', '--ignore-scripts'])
    if (recordsInputs) {
      await assert.rejects(frozen, /ERR_PNPM_OUTDATED_LOCKFILE/u)
    } else {
      await frozen
    }
    await run(['install', '--no-frozen-lockfile', '--ignore-scripts'])
    const updated = await readFile(lockPath, 'utf8')
    assert.equal(updated !== original, recordsInputs)
    if (recordsInlineInputs) {
      assert.deepEqual(
        getLocalPackageEntry(updated).dependencies['is-number'],
        { specifier: '^7.0.0', version: '7.0.0' },
      )
    }
    await run(['install', '--frozen-lockfile', '--ignore-scripts'])
    assert.equal(await readFile(lockPath, 'utf8'), updated)
    process.stdout.write(
      `pnpm ${version} 12.20 v13 directory specifier boundary verified\n`,
    )
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
