import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parse, parseAllDocuments, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import {
  PNPM_V12_18_MINIMUM_VERSION,
  PNPM_V12_19_MINIMUM_VERSION,
} from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Exact-release runner shared with the compatibility harness.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Verify optional-peer scoping through installed local tarballs and both formats.
 *
 * @param version - Exact release supporting the new settings
 * @param cwd - Disposable fixture workspace
 * @param runPnpm - Exact-release runner
 * @returns A promise resolved after consumption and frozen installation checks
 */
async function verifyOptionalPeers(
  version: string,
  cwd: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const run = (args: string[]) => runPnpm(version, cwd, args)
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const lockPath = join(cwd, 'pnpm-lock.yaml')
  for (const name of ['fixture-peer', 'fixture-consumer']) {
    const packageDir = join(cwd, name)
    await mkdir(packageDir)
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        packageManager: `pnpm@${version}`,
        ...(name === 'fixture-consumer'
          ? {
              peerDependencies: { 'fixture-peer': '1.0.0' },
              peerDependenciesMeta: { 'fixture-peer': { optional: true } },
            }
          : {}),
      }),
    )
    await runPnpm(version, packageDir, ['pack', '--pack-destination', cwd])
  }
  for (const name of ['provider', 'consumer']) {
    const dir = join(cwd, 'packages', name)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        dependencies: {
          'fixture-consumer': 'file:../../fixture-consumer-1.0.0.tgz',
          ...(name === 'provider'
            ? { 'fixture-peer': 'file:../../fixture-peer-1.0.0.tgz' }
            : {}),
        },
      }),
    )
  }
  const settings = {
    packages: ['packages/*'],
    dedupePeerDependents: true,
    resolvePeersFromWorkspaceRoot: false,
    virtualStoreType: 'project',
    hoist: false,
  }
  for (const format of ['v9', 'v13']) {
    for (const scoped of [false, true]) {
      await writeFile(
        workspacePath,
        stringify({
          ...settings,
          projectScopedOptionalPeers: scoped,
          lockfile: { format },
        }),
      )
      // A clean resolution proves the setting's effect without lockfile reuse.
      await rm(lockPath, { force: true })
      const installed = await run([
        'install',
        '--no-frozen-lockfile',
        '--ignore-scripts',
      ])
      assert.doesNotMatch(
        installed.stderr,
        /unrecognized|unknown.*setting|were ignored/iu,
      )
      const lockfile = await readFile(lockPath, 'utf8')
      const lock = parseAllDocuments(lockfile)
        .map(document => document.toJSON())
        .find(
          document =>
            (document?.importers ?? document?.projects)?.['packages/consumer'],
        )
      assert.ok(lock, lockfile)
      assert.equal(
        String(lock.lockfileVersion),
        format === 'v13' ? '13.0' : '9.0',
      )
      assert.equal(
        lock.settings.projectScopedOptionalPeers,
        scoped ? true : undefined,
      )
      // Actual installed peer bindings distinguish scoped and shared resolution.
      const peerPath = [
        'exec',
        'node',
        '-e',
        "const {createRequire}=require('node:module'); const from=createRequire(require.resolve('fixture-consumer/package.json')); try { from.resolve('fixture-peer/package.json'); console.log('present') } catch { console.log('absent') }",
      ]
      assert.equal(
        (
          await runPnpm(version, join(cwd, 'packages/consumer'), peerPath)
        ).stdout.trim(),
        scoped ? 'absent' : 'present',
      )
      assert.equal(
        (
          await runPnpm(version, join(cwd, 'packages/provider'), peerPath)
        ).stdout.trim(),
        'present',
      )
      await run(['install', '--frozen-lockfile', '--ignore-scripts'])
      assert.equal(await readFile(lockPath, 'utf8'), lockfile)
    }
  }
}

/**
 * Verify migration, configuration parsing and the exact 12.19 capability boundary.
 *
 * @param version - Exact pnpm release selected by the harness
 * @param runPnpm - Runner using isolated temporary workspaces
 * @returns A promise resolved after all applicable fixture checks and cleanup
 */
export async function verifyPnpm12_19(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  if (
    !supportsMinimumVersion(
      parsePnpmVersion(version),
      PNPM_V12_18_MINIMUM_VERSION,
    )
  ) {
    return
  }
  const supported = supportsMinimumVersion(
    parsePnpmVersion(version),
    PNPM_V12_19_MINIMUM_VERSION,
  )
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-settings-12.19-'))
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const settings = {
    projectScopedOptionalPeers: true,
    lockfile: {
      format: 'v13',
      includeResolutionSettings: true,
      integrityTarget: 'tar',
    },
  }
  const run = (args: string[]) => runPnpm(version, cwd, args)
  try {
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'compatibility-12.19',
        private: true,
        packageManager: `pnpm@${version}`,
        pnpm: { ...settings, saveExact: true },
      }),
    )
    const result = await migratePnpmSettings({ cwd })
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
      saveExact: true,
      ...(supported ? settings : {}),
    })
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      supported ? undefined : settings,
    )
    assert.equal(result.warnings.length > 0, !supported)
    const listed = await run(['config', 'list', '--json'])
    assert.doesNotMatch(
      listed.stderr,
      /unrecognized|unknown.*setting|were ignored/iu,
    )
    if (supported) {
      const config = JSON.parse(listed.stdout)
      assert.equal(config.projectScopedOptionalPeers, true)
      assert.deepEqual(config.lockfile, settings.lockfile)
      for (const value of [
        { projectScopedOptionalPeers: 'invalid' },
        { lockfile: { format: 'v10' } },
        { lockfile: { format: ['v13'] } },
        { lockfile: { format: 'v13', unknown: true } },
      ]) {
        await writeFile(workspacePath, stringify(value))
        await assert.rejects(
          run(['config', 'list', '--json']),
          /ERR_PNPM_INVALID_SETTING/u,
        )
      }
      for (const value of [
        { projectScopedOptionalPeers: null, lockfile: { format: null } },
        { projectScopedOptionalPeers: false, lockfile: { format: 'v9' } },
        // eslint-disable-next-line no-template-curly-in-string -- pnpm expands this fixture value.
        { lockfile: { format: '${PNPM_FIXTURE_FORMAT:-v13}' } },
      ]) {
        await writeFile(workspacePath, stringify(value))
        await run(['config', 'list', '--json'])
      }
      await verifyOptionalPeers(version, cwd, runPnpm)
    } else {
      await writeFile(
        workspacePath,
        stringify({ projectScopedOptionalPeers: true }),
      )
      const ignored = await run(['config', 'list', '--json'])
      assert.equal(
        JSON.parse(ignored.stdout).projectScopedOptionalPeers,
        undefined,
      )
      assert.match(ignored.stderr, /projectScopedOptionalPeers/u)
      await writeFile(workspacePath, stringify({ lockfile: settings.lockfile }))
      await assert.rejects(
        run(['config', 'list', '--json']),
        /ERR_PNPM_INVALID_SETTING/u,
      )
    }
    // Dynamic registry destinations remain in their source. pnpm now rejects
    // them instead of silently selecting another registry.
    await writeFile(workspacePath, '{}\n')
    await writeFile(
      join(cwd, '.npmrc'),
      // eslint-disable-next-line no-template-curly-in-string -- An unexpanded project URL is intentional.
      'registry=https://${PNPM_FIXTURE_HOST}/\n',
    )
    const dynamic = run(['config', 'list', '--json'])
    if (supported) {
      await assert.rejects(dynamic, /ERR_PNPM_REGISTRY_ENV_NOT_EXPANDED/u)
    } else {
      await dynamic
    }
    process.stdout.write(
      `pnpm ${version} 12.19 boundary, optional peers and lockfile formats verified\n`,
    )
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
