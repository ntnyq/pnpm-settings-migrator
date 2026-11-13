import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { PNPM_V12_19_MINIMUM_VERSION } from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

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
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-settings-12.20-'))
  const run = (args: string[]) => runPnpm(version, cwd, args)
  try {
    const local = join(cwd, 'local')
    await mkdir(local)
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
          dependencies: { 'is-number': range },
        }),
      )
    await writeLocal('7.0.0')
    await run(['install', '--no-frozen-lockfile', '--ignore-scripts'])
    const lockPath = join(cwd, 'pnpm-lock.yaml')
    const original = await readFile(lockPath, 'utf8')
    assert.equal(original.includes('"specifiers"'), recordsInputs)
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
    await run(['install', '--frozen-lockfile', '--ignore-scripts'])
    assert.equal(await readFile(lockPath, 'utf8'), updated)
    process.stdout.write(
      `pnpm ${version} 12.20 v13 directory specifier boundary verified\n`,
    )
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
