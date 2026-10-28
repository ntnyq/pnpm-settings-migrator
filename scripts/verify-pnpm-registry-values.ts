import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'

/**
 * Exact release runner supplied by the compatibility harness.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Fixture releases whose YAML readers coerce a boolean prefix to a string.
 */
const STRING_COERCING_VERSIONS = new Set([
  '12.9.0',
  '12.10.0',
  '12.11.0',
  '12.11.1',
  '12.11.2',
  '12.15.0',
])

/**
 * Validate complete source retention and native refusal of ordinary bad maps.
 *
 * @param options - Release, temporary workspace, and exact command runner
 *
 * @returns A promise resolved after strategy and unchanged-file assertions
 */
async function verifyInvalidRegistryValues(options: {
  version: string
  cwd: string
  runPnpm: PnpmRunner
}): Promise<void> {
  const { version, cwd, runPnpm } = options
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const manifestPath = join(cwd, 'package.json')
  const npmrcPath = join(cwd, '.npmrc')
  const existing = {
    registries: { 'https://existing.example/': { prefix: 'existing' } },
  }
  const invalidMaps = [
    ...[
      { declaration: { prefix: false }, coercesPrefix: true },
      { declaration: { scopes: '@acme' }, coercesPrefix: false },
      { declaration: { unknown: true }, coercesPrefix: false },
    ].map(({ declaration, coercesPrefix }) => ({
      invalid: {
        registries: {
          'https://valid.example/': { prefix: 'valid' },
          'https://invalid.example/': declaration,
        },
      },
      coercesPrefix,
    })),
    ...[
      'https://registry.example/',
      '//registry.example/',
      'https://invalid host/',
    ].map(key => ({
      invalid: {
        registries: {
          '@valid': 'https://valid.example/',
          [key]: 'https://other.example/',
        },
      },
      coercesPrefix: false,
    })),
  ]
  for (const { invalid, coercesPrefix } of invalidMaps) {
    for (const strategy of ['discard', 'merge', 'overwrite'] as const) {
      await writeFile(workspacePath, stringify(existing))
      await writeFile(npmrcPath, '# keep auth settings\n')
      await writeFile(
        manifestPath,
        JSON.stringify({
          name: 'invalid-values',
          private: true,
          pnpm: { ...invalid, saveExact: true },
        }),
      )
      const result = await migratePnpmSettings({
        cwd,
        targetVersion: version,
        strategy,
      })
      assert.ok(result.warnings.some(warning => warning.includes('registries')))
      assert.deepEqual(
        JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
        invalid,
      )
      assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
        ...existing,
        saveExact: true,
      })
    }
    await runPnpm(version, cwd, ['config', 'list', '--json'])

    const original = stringify(invalid)
    const manifest = JSON.stringify({
      name: 'existing-invalid-values',
      private: true,
      pnpm: { saveExact: true },
    })
    await writeFile(workspacePath, original)
    await writeFile(manifestPath, manifest)
    await writeFile(npmrcPath, 'save-prefix=~\n')
    for (const strategy of ['discard', 'merge', 'overwrite'] as const) {
      await assert.rejects(
        migratePnpmSettings({ cwd, targetVersion: version, strategy }),
        /incompatible/u,
      )
      assert.equal(await readFile(workspacePath, 'utf8'), original)
      assert.equal(await readFile(manifestPath, 'utf8'), manifest)
      assert.equal(await readFile(npmrcPath, 'utf8'), 'save-prefix=~\n')
    }
    if (coercesPrefix && STRING_COERCING_VERSIONS.has(version)) {
      const listed = await runPnpm(version, cwd, ['config', 'list', '--json'])
      assert.equal(
        JSON.parse(listed.stdout).registries['https://invalid.example/'].prefix,
        'false',
      )
    } else {
      await assert.rejects(
        runPnpm(version, cwd, ['config', 'list', '--json']),
        /registries|prefix|scopes/iu,
        JSON.stringify({ version, invalid }),
      )
    }
  }
}

/**
 * Preserve invalid registry sections in both source formats during valid cleanup.
 *
 * @param options - Exact release and temporary workspace
 *
 * @returns A promise resolved after original JSON and INI content checks
 */
async function verifyInvalidNpmrcRegistryValues(options: {
  version: string
  cwd: string
}): Promise<void> {
  const { version, cwd } = options
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const manifestPath = join(cwd, 'package.json')
  const npmrcPath = join(cwd, '.npmrc')
  const manifest = JSON.stringify({
    name: 'invalid-npmrc',
    private: true,
    pnpm: {
      registries: { 'https://registry.example/': { prefix: false } },
    },
  })
  for (const body of [
    '[registries.https://registry\\.example/]\nprefix=false\n',
    '[registries]\nhttps://registry.example/=https://other.example/\n',
  ]) {
    const retained = `# keep invalid registry settings\n${body}`
    for (const strategy of ['discard', 'merge', 'overwrite'] as const) {
      await writeFile(workspacePath, '{}\n')
      await writeFile(manifestPath, manifest)
      await writeFile(npmrcPath, `save-exact=true\n${retained}`)
      const result = await migratePnpmSettings({
        cwd,
        targetVersion: version,
        strategy,
      })
      assert.ok(result.warnings.some(warning => warning.includes('.npmrc')))
      assert.ok(
        result.warnings.some(warning => warning.includes('package.json#pnpm')),
      )
      assert.equal(await readFile(manifestPath, 'utf8'), manifest)
      assert.equal(await readFile(npmrcPath, 'utf8'), retained)
      assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
        saveExact: true,
      })
    }
  }
}

/**
 * Keep valid ordinary declarations, nullable fields, and legacy scopes migratable.
 *
 * @param options - Release, temporary workspace, and exact command runner
 *
 * @returns A promise resolved after cleanup and native configuration acceptance
 */
async function verifyValidRegistryValues(options: {
  version: string
  cwd: string
  runPnpm: PnpmRunner
}): Promise<void> {
  const { version, cwd, runPnpm } = options
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const manifestPath = join(cwd, 'package.json')
  const npmrcPath = join(cwd, '.npmrc')
  const cases = [
    {
      default: 'https://registry.example/',
      '@acme': 'https://registry.example/',
    },
    {
      'https://registry.example/': {
        prefix: 'work',
        scopes: ['@acme'],
        supportsTimeField: false,
      },
      'https://empty.example/': {},
    },
    {
      'https://registry.example/': {
        prefix: null,
        scopes: null,
        serverType: null,
        supportsTimeField: null,
      },
    },
  ]
  for (const registries of cases) {
    for (const strategy of ['discard', 'merge', 'overwrite'] as const) {
      await writeFile(workspacePath, '{}\n')
      await writeFile(npmrcPath, '# keep auth settings\n')
      await writeFile(
        manifestPath,
        JSON.stringify({
          name: 'valid-values',
          private: true,
          pnpm: { registries },
        }),
      )
      const result = await migratePnpmSettings({
        cwd,
        targetVersion: version,
        strategy,
      })
      assert.deepEqual(result.warnings, [])
      assert.equal(
        JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
        undefined,
      )
      assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
        registries,
      })
    }
    await runPnpm(version, cwd, ['config', 'list', '--json'])
  }
}

/**
 * Verify ordinary declaration validation and complete invalid source retention.
 *
 * @param options - Release, temporary workspace, and exact command runner
 *
 * @returns A promise resolved after invalid and valid map checks in all strategies
 */
export async function verifyRegistryValues(options: {
  version: string
  cwd: string
  runPnpm: PnpmRunner
}): Promise<void> {
  await verifyInvalidRegistryValues(options)
  await verifyInvalidNpmrcRegistryValues(options)
  await verifyValidRegistryValues(options)
  process.stdout.write(
    `pnpm ${options.version} registry value validation and source retention verified\n`,
  )
}
