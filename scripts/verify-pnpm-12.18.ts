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
import {
  PNPM_V12_17_MINIMUM_VERSION,
  PNPM_V12_18_MINIMUM_VERSION,
  PNPM_PYTHON_ARRAY_SETTINGS,
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
 * Chosen skill and platform values used by migration and installation fixtures.
 */
const settings = {
  permissions: {
    'fixture-skills@file:fixture-skills-1.0.0.tgz': { skills: ['migrate'] },
  },
  skills: { dirs: ['.fixture-skills'] },
  supportedArchitectures: [
    'current',
    'freebsd-x64',
    'linux-x64-node127',
    'darwin-arm64-macos_14_0',
  ],
}

/**
 * Check nested null entries affected by pnpm's YAML deserializer upgrade.
 *
 * @param version - Exact v12 release at either side of the boundary
 * @param cwd - Temporary workspace, reset for each case
 * @param runPnpm - Exact-release runner
 *
 * @returns A promise resolved after source retention and real parser checks
 */
async function verifyNullMappings(
  version: string,
  cwd: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  if (!version.startsWith('12.')) {
    return
  }
  const rejectsNull = supportsMinimumVersion(
    parsePnpmVersion(version),
    PNPM_V12_18_MINIMUM_VERSION,
  )
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  for (const value of [
    { permissions: { example: null } },
    { tasks: { build: null } },
    { auditConfig: { ignoreGhsas: null } },
    { versioning: { fixed: null } },
    { versioning: { epics: null } },
    { versioning: { ignore: null } },
    { versioning: { lanes: null } },
    { versioning: { fixed: [null] } },
    { versioning: { epics: [{ lead: 'example', packages: null }] } },
    { remoteSideEffectsCache: { packages: null } },
    { catalogs: { example: null } },
    { pipelines: { build: null } },
    { packageExtensions: { example: null } },
    ...PNPM_PYTHON_ARRAY_SETTINGS.map(field => ({ python: { [field]: null } })),
    {
      packageExtensions: { example: { peerDependenciesMeta: { peer: null } } },
    },
  ]) {
    await rm(workspacePath, { force: true })
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'null-mapping-fixture',
        packageManager: `pnpm@${version}`,
        pnpm: { saveExact: true, ...value },
      }),
    )
    await migratePnpmSettings({ cwd })
    // Catalog validation already retained null named catalogs on older targets.
    const retained = rejectsNull || Object.hasOwn(value, 'catalogs')
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      retained ? value : undefined,
    )
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
      saveExact: true,
      ...(retained ? {} : value),
    })
    await writeFile(workspacePath, stringify(value))
    const listed = runPnpm(version, cwd, ['config', 'list', '--json'])
    if (rejectsNull) {
      await assert.rejects(listed, /ERR_PNPM_INVALID_SETTING/u)
    } else {
      await listed
    }
  }
}

/**
 * Check chosen nested skills and platform optionals through real installations.
 *
 * @param version - Supporting pnpm release
 * @param cwd - Isolated fixture workspace
 * @param runPnpm - Exact-release runner
 *
 * @returns A promise resolved after install, pruning and frozen checks
 */
async function verifySkillInstall(
  version: string,
  cwd: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const run = (args: string[]) => runPnpm(version, cwd, args)
  await mkdir(join(cwd, '.fixture-skills'))
  const packageDir = join(cwd, 'skill-package')
  for (const skill of ['guide', 'engineering/migrate']) {
    await mkdir(join(packageDir, 'skills', skill), { recursive: true })
    await writeFile(
      join(packageDir, 'skills', skill, 'SKILL.md'),
      `# ${skill}\n`,
    )
  }
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: 'fixture-skills',
      version: '1.0.0',
      packageManager: `pnpm@${version}`,
    }),
  )
  await runPnpm(version, packageDir, ['pack', '--pack-destination', cwd])

  const platformDir = join(cwd, 'platform-package')
  await mkdir(platformDir)
  await writeFile(
    join(platformDir, 'package.json'),
    JSON.stringify({
      name: 'fixture-freebsd',
      version: '1.0.0',
      os: ['freebsd'],
      cpu: ['x64'],
      packageManager: `pnpm@${version}`,
    }),
  )
  await runPnpm(version, platformDir, ['pack', '--pack-destination', cwd])
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: 'compatibility-12.18',
      private: true,
      packageManager: `pnpm@${version}`,
      dependencies: { 'fixture-skills': 'file:fixture-skills-1.0.0.tgz' },
      optionalDependencies: {
        'fixture-freebsd': 'file:fixture-freebsd-1.0.0.tgz',
      },
    }),
  )
  const install = await run(['install', '--no-frozen-lockfile'])
  assert.doesNotMatch(install.stderr, /unrecognized|unknown.*setting/iu)
  const chosenPath = join(cwd, '.fixture-skills/migrate/SKILL.md')
  const otherPath = join(cwd, '.fixture-skills/guide/SKILL.md')
  const platformPath = join(cwd, 'node_modules/fixture-freebsd/package.json')
  assert.equal(await readFile(chosenPath, 'utf8'), '# engineering/migrate\n')
  await assert.rejects(access(otherPath), { code: 'ENOENT' })
  await access(platformPath)
  const lockfilePath = join(cwd, 'pnpm-lock.yaml')
  const lockfile = await readFile(lockfilePath, 'utf8')
  await run(['install', '--frozen-lockfile'])
  assert.equal(await readFile(lockfilePath, 'utf8'), lockfile)
  assert.equal(await readFile(chosenPath, 'utf8'), '# engineering/migrate\n')

  await writeFile(
    workspacePath,
    stringify({
      ...settings,
      permissions: {
        'fixture-skills@file:fixture-skills-1.0.0.tgz': { skills: [] },
      },
      supportedArchitectures: ['current'],
      saveExact: true,
    }),
  )
  await run(['install', '--frozen-lockfile'])
  await assert.rejects(access(chosenPath), { code: 'ENOENT' })
  if (process.platform !== 'freebsd' || process.arch !== 'x64') {
    await assert.rejects(access(platformPath), { code: 'ENOENT' })
  }
  assert.equal(await readFile(lockfilePath, 'utf8'), lockfile)
}

/**
 * Verify chosen skill lists and new platform tags at the 12.18 boundary.
 *
 * @param version - Exact release; only 12.17+, and the concurrent v11, run
 * @param runPnpm - Release runner using temporary fixture workspaces
 *
 * @returns A promise resolved after migration, parsing and consumption checks
 */
export async function verifyPnpm12_18(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  if (
    version !== '11.28.11' &&
    !supportsMinimumVersion(
      parsePnpmVersion(version),
      PNPM_V12_17_MINIMUM_VERSION,
    )
  ) {
    return
  }
  const supported = supportsMinimumVersion(
    parsePnpmVersion(version),
    PNPM_V12_18_MINIMUM_VERSION,
  )
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-settings-12.18-'))
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const run = (args: string[]) => runPnpm(version, cwd, args)
  try {
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'compatibility-12.18',
        private: true,
        packageManager: `pnpm@${version}`,
        pnpm: { saveExact: true, ...settings },
      }),
    )
    const result = await migratePnpmSettings({ cwd })
    const migrated = parse(await readFile(workspacePath, 'utf8'))
    const supportsDirectories = version.startsWith('12.')
    const precedingSettings = supportsDirectories
      ? { skills: settings.skills }
      : {}
    assert.deepEqual(migrated, {
      saveExact: true,
      ...(supported ? settings : precedingSettings),
    })
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      supported
        ? undefined
        : {
            permissions: settings.permissions,
            supportedArchitectures: settings.supportedArchitectures,
            ...(supportsDirectories ? {} : { skills: settings.skills }),
          },
    )
    assert.equal(result.warnings.length > 0, !supported)
    const listed = await run(['config', 'list', '--json'])
    assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
    await verifyNullMappings(version, cwd, runPnpm)
    if (!supported) {
      if (supportsDirectories) {
        for (const value of [
          { permissions: settings.permissions },
          { supportedArchitectures: settings.supportedArchitectures },
        ]) {
          await writeFile(workspacePath, stringify(value))
          await assert.rejects(run(['config', 'list', '--json']))
        }
        await writeFile(
          workspacePath,
          stringify({ permissions: { example: { skills: 'review' } } }),
        )
        await run(['config', 'list', '--json'])
      }
      process.stdout.write(`pnpm ${version} 12.18 boundary verified\n`)
      return
    }
    const config = JSON.parse(listed.stdout)
    assert.deepEqual(config.permissions, settings.permissions)
    assert.deepEqual(
      config.supportedArchitectures,
      settings.supportedArchitectures,
    )

    for (const invalid of [
      { permissions: { example: { skills: 'review' } } },
      { permissions: { example: { skills: ['guide', false] } } },
      { permissions: { example: { build: [] } } },
      { supportedArchitectures: ['linux-x64-napi8-node127'] },
      { supportedArchitectures: ['freebsd-x64-musl'] },
      { supportedArchitectures: ['linux-x64-node01'] },
      { supportedArchitectures: ['linux-x64-node4294967296'] },
    ]) {
      await writeFile(workspacePath, stringify(invalid))
      await assert.rejects(run(['config', 'list', '--json']))
    }
    await writeFile(workspacePath, stringify({ ...settings, saveExact: true }))
    await verifySkillInstall(version, cwd, runPnpm)
    process.stdout.write(
      `pnpm ${version} chosen skills and platform consumption verified\n`,
    )
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
