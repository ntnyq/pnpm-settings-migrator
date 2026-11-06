import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { parse, parseAllDocuments, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'

/**
 * Exact-release runner bound to a temporary workspace.
 */
type RunPnpm = (args: string[]) => Promise<{ stdout: string; stderr: string }>

/**
 * Locate the project importer in both single- and multi-document lockfiles.
 *
 * @param lockfile - Contents of the lockfile written by the release under test
 *
 * @returns Lockfile document containing the fixture's resolved dependencies
 */
function parseFixtureLockfile(lockfile: string) {
  const parsed = parseAllDocuments(lockfile)
    .map(document => document.toJSON())
    .find(
      document => document?.importers?.['.']?.dependencies?.['fixture-core'],
    )
  assert.ok(parsed, 'lockfile must record the fixture dependencies')
  return parsed
}

/**
 * Exercise the migrated release settings in a disposable Git repository.
 *
 * @param cwd - Temporary package directory and Git root
 * @param run - pnpm 12.17 release runner
 *
 * @returns A promise resolved after publish branch and version tag checks
 */
async function verifyReleaseCommands(cwd: string, run: RunPnpm): Promise<void> {
  const git = async (...args: string[]) =>
    (await promisify(execFile)('git', args, { cwd })).stdout.trim()
  // Publishing records the package manager pin. Track that lockfile before
  // pnpm checks that the disposable working tree is clean.
  await run([
    'install',
    '--lockfile-only',
    '--no-frozen-lockfile',
    '--ignore-scripts',
  ])
  await git('init', '-b', 'fixture-release')
  await git('add', '.')
  await git(
    '-c',
    'core.hooksPath=unused-hooks',
    '-c',
    'commit.gpgSign=false',
    '-c',
    'user.name=pnpm fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'fixture',
  )
  const head = await git('rev-parse', 'HEAD')
  await run(['publish', '--dry-run', '--ignore-scripts'])
  await assert.rejects(
    run([
      'publish',
      '--dry-run',
      '--ignore-scripts',
      '--publish-branch',
      'other',
    ]),
    /ERR_PNPM_GIT_NOT_CORRECT_BRANCH/u,
  )
  await run(['version', 'patch'])
  assert.equal(
    JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')).version,
    '1.0.1',
  )
  assert.equal(await git('rev-parse', 'HEAD'), head)
  assert.equal(await git('tag', '--list'), '')
}

/**
 * Verify selector matching in an actual lockfile, including equal-specificity
 * order, parent patterns, and optional and peer dependency removal.
 *
 * @param cwd - Temporary workspace with no external dependencies
 * @param version - Exact pnpm version under verification
 * @param run - Runner for this workspace and version
 *
 * @returns A promise resolved after installation and frozen lockfile checks
 */
async function verifySelectors(
  cwd: string,
  version: string,
  run: RunPnpm,
): Promise<void> {
  const supported = version === '12.17.0'
  for (const name of ['base', 'first', 'second', 'peer-consumer']) {
    await mkdir(join(cwd, name))
    await writeFile(
      join(cwd, name, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        ...(name === 'peer-consumer' && {
          peerDependencies: { 'absent-fixture-peer': '1.0.0' },
        }),
      }),
    )
  }
  const overrides = {
    'fixture-*:prod': 'link:./first',
    '*-core:prod': 'link:./second',
    'project-*>fixture-parent:prod': 'link:./second',
    'fixture-*:optional': '-',
    'peer-*>absent-fixture-peer:peer': '-',
  }
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: 'project-root',
      version: '1.0.0',
      packageManager: `pnpm@${version}`,
      dependencies: {
        'fixture-core': 'link:./base',
        'fixture-parent': 'link:./base',
        ...(supported && { 'peer-consumer': 'file:./peer-consumer' }),
      },
      optionalDependencies: { 'fixture-optional': 'link:./base' },
      devDependencies: { 'fixture-dev': 'link:./base' },
      pnpm: { overrides, saveExact: true },
    }),
  )
  const result = await migratePnpmSettings({ cwd, sortKeys: true })
  const saved = parse(await readFile(workspacePath, 'utf8'))
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (supported) {
    assert.deepEqual(result.warnings, [])
    assert.deepEqual(Object.entries(saved.overrides), Object.entries(overrides))
    assert.equal(manifest.pnpm, undefined)
  } else {
    assert.match(result.warnings.join(), /overrides/u)
    assert.equal(saved.overrides, undefined)
    assert.deepEqual(manifest.pnpm, { overrides })
    // Earlier pnpm accepts a name glob in YAML but matches it literally.
    delete manifest.pnpm
    await writeFile(manifestPath, JSON.stringify(manifest))
    await writeFile(
      workspacePath,
      stringify({ overrides: { 'fixture-*': 'link:./first' } }),
    )
  }
  const listed = await run(['config', 'list', '--json'])
  assert.doesNotMatch(
    listed.stderr,
    /unknown.*setting|unrecognized|were ignored/iu,
  )
  assert.deepEqual(
    JSON.parse(listed.stdout).overrides,
    supported ? overrides : { 'fixture-*': 'link:./first' },
  )
  await run(['install', '--ignore-scripts', '--no-frozen-lockfile'])
  const lockPath = join(cwd, 'pnpm-lock.yaml')
  const lockfile = await readFile(lockPath, 'utf8')
  const parsed = parseFixtureLockfile(lockfile)
  const root = parsed.importers['.']
  assert.equal(
    root.dependencies['fixture-core'].version,
    supported ? 'link:first' : 'link:base',
  )
  assert.equal(
    root.dependencies['fixture-parent'].version,
    supported ? 'link:second' : 'link:base',
  )
  assert.equal(
    root.optionalDependencies?.['fixture-optional']?.version,
    supported ? undefined : 'link:base',
  )
  assert.equal(root.devDependencies['fixture-dev'].version, 'link:base')
  if (supported) {
    const peerPackage = Object.keys(parsed.packages).find(key =>
      key.startsWith('peer-consumer@'),
    )
    assert.ok(peerPackage)
    assert.equal(
      parsed.packages[peerPackage].peerDependencies?.['absent-fixture-peer'],
      undefined,
    )
  }
  await run(['install', '--ignore-scripts', '--frozen-lockfile'])
  assert.equal(await readFile(lockPath, 'utf8'), lockfile)

  // The previous parser could match the original dependency spec literally.
  await writeFile(
    workspacePath,
    stringify({ overrides: { 'fixture-core@link:./base': 'link:./second' } }),
  )
  const install = run([
    'install',
    '--lockfile-only',
    '--ignore-scripts',
    '--no-frozen-lockfile',
  ])
  if (supported) {
    await assert.rejects(install, /ERR_PNPM_INVALID_SELECTOR/u)
  } else {
    await install
    const updated = parseFixtureLockfile(await readFile(lockPath, 'utf8'))
    assert.equal(
      updated.importers['.'].dependencies['fixture-core'].version,
      'link:second',
    )
  }
}

/**
 * Verify pnpm 12.17 and its preceding v12 and concurrent v11 controls.
 *
 * @param version - Exact pnpm version from the release matrix
 * @param runPnpm - Harness runner for each disposable workspace
 *
 * @returns A promise resolved after all applicable consumption checks
 */
export async function verifyPnpm12_17(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => ReturnType<RunPnpm>,
): Promise<void> {
  if (!['11.28.10', '12.16.1', '12.17.0'].includes(version)) {
    return
  }
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-12-17-'))
  try {
    const run: RunPnpm = args => runPnpm(version, cwd, args)
    const manifestPath = join(cwd, 'package.json')
    const workspacePath = join(cwd, 'pnpm-workspace.yaml')
    const npmrcPath = join(cwd, '.npmrc')
    const branch = 'fixture-release'
    const registry = 'registry=http://127.0.0.1:1/\n'
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'fixture-release-commands',
        version: '1.0.0',
        packageManager: `pnpm@${version}`,
        pnpm: { publishBranch: branch, saveExact: true },
      }),
    )
    await writeFile(npmrcPath, `git-tag-version=false\n${registry}`)
    const result = await migratePnpmSettings({ cwd })
    const acceptsFields = version !== '12.16.1'
    const settings = { gitTagVersion: false, publishBranch: branch }
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
      saveExact: true,
      ...(acceptsFields && settings),
    })
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      acceptsFields ? undefined : { publishBranch: branch },
    )
    assert.equal(
      await readFile(npmrcPath, 'utf8'),
      acceptsFields ? registry : `git-tag-version=false\n${registry}`,
    )
    if (acceptsFields) {
      assert.deepEqual(result.warnings, [])
    } else {
      assert.match(result.warnings.join(), /incompatible/u)
      // Verify the ignored workspace fields independently of the retained npmrc.
      await writeFile(npmrcPath, registry)
      await writeFile(workspacePath, stringify(settings))
    }
    const listed = await run(['config', 'list', '--json'])
    const config = JSON.parse(listed.stdout)
    assert.equal(config.gitTagVersion, acceptsFields ? false : undefined)
    assert.equal(config.publishBranch, acceptsFields ? branch : undefined)
    if (acceptsFields) {
      assert.doesNotMatch(
        listed.stderr,
        /unknown.*setting|unrecognized|were ignored/iu,
      )
    }
    if (version === '12.17.0') {
      await verifyReleaseCommands(cwd, run)
    }
    const selectors = join(cwd, 'selectors')
    await mkdir(selectors)
    await writeFile(join(selectors, 'pnpm-workspace.yaml'), '{}\n')
    await verifySelectors(selectors, version, args =>
      runPnpm(version, selectors, args),
    )
    process.stdout.write(
      `pnpm ${version} 12.17 release settings and override selectors verified\n`,
    )
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
