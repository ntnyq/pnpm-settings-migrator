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
import { join } from 'node:path'
import process from 'node:process'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import { PNPM_V12_11_MINIMUM_VERSION } from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Run one selected pnpm release in a temporary workspace.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Check optional shapes, rejected values, and unknown capability diagnostics.
 *
 * @param version - Exact release with permission support
 * @param fixtureDir - Temporary workspace containing the fixture manifest
 * @param runPnpm - Runner for the selected release
 *
 * @returns A promise resolved after pnpm parses each independent YAML fixture
 */
async function verifyPermissionShapes(
  version: string,
  fixtureDir: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  for (const valid of [
    { permissions: null, skills: null, provenance: null },
    { permissions: { example: {} }, skills: {} },
    { permissions: { example: null } },
    {
      permissions: { example: { build: null, skills: null } },
      skills: { dirs: null },
    },
  ]) {
    await writeFile(workspacePath, stringify(valid))
    await runPnpm(version, fixtureDir, ['config', 'list', '--json'])
  }
  for (const invalid of [
    { permissions: { example: { build: 1 } } },
    { skills: { dirs: [{}] } },
    { provenance: {} },
  ]) {
    await writeFile(workspacePath, stringify(invalid))
    await assert.rejects(
      runPnpm(version, fixtureDir, ['config', 'list', '--json']),
    )
  }
  await writeFile(
    workspacePath,
    stringify({ permissions: { example: { build: true, mcp: true } } }),
  )
  const unknown = await runPnpm(version, fixtureDir, [
    'config',
    'list',
    '--json',
  ])
  assert.match(unknown.stderr, /permissions.*mcp/iu)
}

/**
 * Contents used to verify linked fixture skills.
 */
const skillText = '# Local compatibility fixture\n'

/**
 * Pack local dependencies whose scripts and skill files expose permission effects.
 *
 * @param version - Exact release used to pack fixture tarballs
 * @param fixtureDir - Temporary workspace receiving the packages
 * @param runPnpm - Runner for the selected release
 *
 * @returns Local tarball dependency specifiers
 */
async function packPermissionFixtures(
  version: string,
  fixtureDir: string,
  runPnpm: PnpmRunner,
): Promise<Record<string, string>> {
  const dependencies: Record<string, string> = {}
  for (const name of [
    'fixture-allowed',
    'fixture-denied',
    'fixture-undecided',
  ]) {
    const packageDir = join(fixtureDir, name)
    await mkdir(join(packageDir, 'skills', name), { recursive: true })
    await writeFile(join(packageDir, 'skills', name, 'SKILL.md'), skillText)
    await writeFile(
      join(packageDir, 'build.cjs'),
      "require('node:fs').writeFileSync('built.txt', 'built')\n",
    )
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        packageManager: `pnpm@${version}`,
        scripts: { postinstall: 'node build.cjs' },
      }),
    )
    await runPnpm(version, packageDir, [
      'pack',
      '--pack-destination',
      fixtureDir,
    ])
    dependencies[name] = `file:${name}-1.0.0.tgz`
  }
  return dependencies
}

/**
 * Check explicitly reported permissions without treating config list as resolved policy.
 *
 * @param stdout - JSON emitted by pnpm config list
 * @param allowBuilds - Explicit legacy build decisions
 * @param settings - Explicit permission, skill, and provenance settings
 *
 * @returns Nothing when pnpm reports every migrated setting unchanged
 */
function assertPermissionConfig(
  stdout: string,
  allowBuilds: Record<string, boolean>,
  settings: { permissions: unknown; skills: unknown; provenance: boolean },
): void {
  const config = JSON.parse(stdout)
  assert.deepEqual(config.allowBuilds, allowBuilds)
  assert.deepEqual(config.permissions, settings.permissions)
  assert.deepEqual(config.skills, settings.skills)
  assert.equal(config.provenance, false)
}

/**
 * Verify permission precedence, agent skill linking, and provenance consumption.
 *
 * @param version - Exact pnpm release at or after the 12.10.1 predecessor
 * @param runPnpm - Runner for the selected release in an isolated workspace
 *
 * @returns A promise resolved after migration, config, install, and frozen checks
 */
export async function verifyPermissions(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const parsedVersion = parsePnpmVersion(version)
  // eslint-disable-next-line no-magic-numbers -- Include the actual preceding release.
  if (!supportsMinimumVersion(parsedVersion, [12, 10, 1])) {
    return
  }
  const supported = supportsMinimumVersion(
    parsedVersion,
    PNPM_V12_11_MINIMUM_VERSION,
  )
  const fixtureDir = await mkdtemp(join(tmpdir(), 'pnpm-settings-permissions-'))
  const manifestPath = join(fixtureDir, 'package.json')
  const workspacePath = join(fixtureDir, 'pnpm-workspace.yaml')
  const settings = {
    permissions: {
      'fixture-allowed@file:fixture-allowed-1.0.0.tgz': {
        build: true,
        skills: true,
      },
      'fixture-denied@file:fixture-denied-1.0.0.tgz': {
        build: false,
        skills: false,
      },
      'fixture-undecided@file:fixture-undecided-1.0.0.tgz': {
        build: 'review this',
        skills: '',
      },
    },
    skills: { dirs: ['.fixture-skills'] },
    provenance: false,
  }
  const allowBuilds = {
    'fixture-allowed@file:fixture-allowed-1.0.0.tgz': false,
    'fixture-denied@file:fixture-denied-1.0.0.tgz': true,
    'fixture-undecided@file:fixture-undecided-1.0.0.tgz': true,
  }
  try {
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'permission-fixture',
        private: true,
        packageManager: `pnpm@${version}`,
        pnpm: { allowBuilds, ...settings },
      }),
    )
    const result = await migratePnpmSettings({ cwd: fixtureDir })
    assert.equal(result.warnings.length > 0, !supported)
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
      allowBuilds,
      ...(supported ? settings : {}),
    })
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      supported ? undefined : settings,
    )
    const listed = await runPnpm(version, fixtureDir, [
      'config',
      'list',
      '--json',
    ])
    assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
    if (!supported) {
      await writeFile(workspacePath, stringify(settings))
      const before = await runPnpm(version, fixtureDir, [
        'config',
        'list',
        '--json',
      ])
      const config = JSON.parse(before.stdout)
      assert.equal(config.permissions, undefined)
      assert.equal(config.skills, undefined)
      assert.equal(config.provenance, undefined)
      process.stdout.write(`pnpm ${version} permission boundary verified\n`)
      return
    }
    assertPermissionConfig(listed.stdout, allowBuilds, settings)

    const dependencies = await packPermissionFixtures(
      version,
      fixtureDir,
      runPnpm,
    )
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'permission-fixture',
        private: true,
        packageManager: `pnpm@${version}`,
        dependencies,
      }),
    )
    const install = await runPnpm(version, fixtureDir, [
      'install',
      '--no-frozen-lockfile',
    ])
    assert.doesNotMatch(install.stderr, /unrecognized|unknown.*setting/iu)
    assert.equal(
      await readFile(
        join(fixtureDir, 'node_modules/fixture-allowed/built.txt'),
        'utf8',
      ),
      'built',
    )
    assert.equal(
      await readFile(
        join(fixtureDir, 'node_modules/fixture-undecided/built.txt'),
        'utf8',
      ),
      'built',
    )
    await assert.rejects(
      access(join(fixtureDir, 'node_modules/fixture-denied/built.txt')),
      { code: 'ENOENT' },
    )
    assert.equal(
      await readFile(
        join(
          fixtureDir,
          '.fixture-skills/pnpm-fixture-allowed-fixture-allowed/SKILL.md',
        ),
        'utf8',
      ),
      skillText,
    )
    await assert.rejects(
      access(
        join(
          fixtureDir,
          '.fixture-skills/pnpm-fixture-denied-fixture-denied/SKILL.md',
        ),
      ),
      { code: 'ENOENT' },
    )
    const lockfilePath = join(fixtureDir, 'pnpm-lock.yaml')
    const lockfile = await readFile(lockfilePath, 'utf8')
    await runPnpm(version, fixtureDir, ['install', '--frozen-lockfile'])
    assert.equal(await readFile(lockfilePath, 'utf8'), lockfile)
    assert.equal(
      await readFile(
        join(
          fixtureDir,
          '.fixture-skills/pnpm-fixture-allowed-fixture-allowed/SKILL.md',
        ),
        'utf8',
      ),
      skillText,
    )

    await writeFile(
      workspacePath,
      stringify({ ...settings, allowBuilds, skills: { dirs: [] } }),
    )
    await runPnpm(version, fixtureDir, ['install', '--frozen-lockfile'])
    await assert.rejects(
      access(
        join(
          fixtureDir,
          '.fixture-skills/pnpm-fixture-allowed-fixture-allowed/SKILL.md',
        ),
      ),
      { code: 'ENOENT' },
    )
    assert.equal(await readFile(lockfilePath, 'utf8'), lockfile)

    await verifyPermissionShapes(version, fixtureDir, runPnpm)
    process.stdout.write(`pnpm ${version} permission consumption verified\n`)
  } finally {
    await rm(fixtureDir, { force: true, recursive: true })
  }
}
