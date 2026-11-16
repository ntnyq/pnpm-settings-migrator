import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parse, parseAllDocuments, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Verify default lockfile directory consumption with custom workspace paths.
 *
 * @param version - Exact v12 release, including 12.20 as the preceding control
 * @param runPnpm - Exact-release runner for disposable workspaces
 * @returns A promise resolved after migration, config, layout and frozen checks
 */
export async function verifyPnpm12_21(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  // eslint-disable-next-line no-magic-numbers -- Actual preceding release.
  if (!supportsMinimumVersion(parsePnpmVersion(version), [12, 20, 0])) {
    return
  }
  for (const sharedWorkspaceLockfile of [true, false]) {
    const cwd = await mkdtemp(join(tmpdir(), 'pnpm-settings-12.21-'))
    const appDir = join(cwd, 'packages/app')
    const workspacePath = join(cwd, 'pnpm-workspace.yaml')
    const settings = {
      modulesDir: 'custom_modules',
      virtualStoreDir: 'cache',
      virtualStoreType: 'project',
      sharedWorkspaceLockfile,
    }
    try {
      await mkdir(appDir, { recursive: true })
      await writeFile(
        join(appDir, 'package.json'),
        JSON.stringify({ name: 'app', dependencies: { 'is-number': '7.0.0' } }),
      )
      await writeFile(
        join(cwd, 'package.json'),
        JSON.stringify({
          name: 'lockfile-layout',
          private: true,
          packageManager: `pnpm@${version}`,
          pnpm: settings,
        }),
      )
      await writeFile(workspacePath, 'packages:\n  - packages/*\n')
      await writeFile(join(cwd, '.npmrc'), 'lockfile-dir=.\n')
      await migratePnpmSettings({ cwd })
      assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
        packages: ['packages/*'],
        ...settings,
        lockfileDir: '.',
      })
      assert.equal(
        JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')).pnpm,
        undefined,
      )
      await assert.rejects(readFile(join(cwd, '.npmrc')), { code: 'ENOENT' })
      const listed = await runPnpm(version, appDir, [
        'config',
        'list',
        '--json',
      ])
      assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
      assert.equal(JSON.parse(listed.stdout).lockfileDir, '.')
      await runPnpm(version, appDir, [
        'install',
        '--no-frozen-lockfile',
        '--ignore-scripts',
      ])
      assert.equal(
        JSON.parse(
          await readFile(
            join(appDir, 'custom_modules/is-number/package.json'),
            'utf8',
          ),
        ).version,
        '7.0.0',
      )
      const lockPath = join(cwd, 'pnpm-lock.yaml')
      const lockfile = await readFile(lockPath, 'utf8')
      assert.ok(
        parseAllDocuments(lockfile).some(
          document => document.toJSON()?.importers?.['packages/app'],
        ),
      )
      await runPnpm(version, appDir, [
        'install',
        '--frozen-lockfile',
        '--ignore-scripts',
      ])
      assert.equal(await readFile(lockPath, 'utf8'), lockfile)
      if (sharedWorkspaceLockfile) {
        await writeFile(
          workspacePath,
          stringify({ packages: ['packages/*'], ...settings }),
        )
        await runPnpm(version, appDir, [
          'install',
          '--frozen-lockfile',
          '--ignore-scripts',
        ])
        assert.equal(await readFile(lockPath, 'utf8'), lockfile)
      }
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  }
  process.stdout.write(
    `pnpm ${version} default lockfile directory consumption verified\n`,
  )
}
