import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
 * Reject mixed registry representations and duplicate prefixes after conversion.
 *
 * @param options - Release, temporary workspace, and exact command runner
 *
 * @returns A promise resolved after unchanged-file and native rejection checks
 */
async function verifyConvertedRegistryMaps(options: {
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
      existing: { registries: { default: 'https://first.example/' } },
      incoming: { namedRegistries: { work: 'https://second.example/' } },
      invalid: {
        registries: {
          default: 'https://first.example/',
          'https://second.example/': { prefix: 'work' },
        },
      },
    },
    {
      existing: { namedRegistries: { work: 'https://first.example/' } },
      incoming: { registries: { default: 'https://second.example/' } },
      invalid: {
        registries: {
          default: 'https://second.example/',
          'https://first.example/': { prefix: 'work' },
        },
      },
    },
    {
      existing: { namedRegistries: { work: 'https://first.example/' } },
      incoming: { namedRegistries: { work: 'https://second.example/' } },
      invalid: {
        registries: {
          'https://first.example/': { prefix: 'work' },
          'https://second.example/': { prefix: 'work' },
        },
      },
    },
  ]
  for (const { existing, incoming, invalid } of cases) {
    const original = stringify(existing)
    const manifest = JSON.stringify({
      name: 'converted-map',
      private: true,
      pnpm: incoming,
    })
    await writeFile(workspacePath, original)
    await writeFile(manifestPath, manifest)
    await writeFile(npmrcPath, 'save-prefix=~\n')
    await runPnpm(version, cwd, ['config', 'list', '--json'])
    for (const strategy of ['discard', 'merge', 'overwrite'] as const) {
      await assert.rejects(
        migratePnpmSettings({
          cwd,
          targetVersion: version,
          strategy,
          replaceDeprecated: true,
        }),
        /incompatible/u,
      )
      assert.equal(await readFile(workspacePath, 'utf8'), original)
      assert.equal(await readFile(manifestPath, 'utf8'), manifest)
      assert.equal(await readFile(npmrcPath, 'utf8'), 'save-prefix=~\n')
    }
    await writeFile(workspacePath, stringify(invalid))
    await assert.rejects(
      runPnpm(version, cwd, ['config', 'list', '--json']),
      /registries|prefix/iu,
    )
  }
}

/**
 * Verify converted scope routing on both sides of npm alias canonicalization.
 *
 * @param options - Release, temporary workspace, and exact command runner
 *
 * @returns A promise resolved after strategy, cleanup, and native config checks
 */
async function verifyConvertedScopeRouting(options: {
  version: string
  cwd: string
  runPnpm: PnpmRunner
  acceptsNpmAliases: boolean
}): Promise<void> {
  const { version, cwd, runPnpm } = options
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const manifestPath = join(cwd, 'package.json')
  const npmrcPath = join(cwd, '.npmrc')
  const original = stringify({
    namedRegistries: { first: 'https://registry.npmjs.com/' },
    registries: { '@same': 'https://registry.npmjs.com/' },
  })
  const manifest = JSON.stringify({
    name: 'converted-scopes',
    private: true,
    pnpm: {
      namedRegistries: { second: 'https://registry.npmjs.org/' },
      registries: { '@same': 'https://registry.npmjs.org/' },
    },
  })
  for (const strategy of ['discard', 'merge', 'overwrite'] as const) {
    await writeFile(workspacePath, original)
    await writeFile(manifestPath, manifest)
    await writeFile(npmrcPath, 'save-prefix=~\n')
    await runPnpm(version, cwd, ['config', 'list', '--json'])
    const migrate = () =>
      migratePnpmSettings({
        cwd,
        targetVersion: version,
        strategy,
        replaceDeprecated: true,
      })
    if (options.acceptsNpmAliases) {
      assert.deepEqual((await migrate()).warnings, [])
      assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
        registries: {
          'https://registry.npmjs.com/': { prefix: 'first', scopes: ['@same'] },
          'https://registry.npmjs.org/': {
            prefix: 'second',
            scopes: ['@same'],
          },
        },
        savePrefix: '~',
      })
      assert.equal(
        JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
        undefined,
      )
      await assert.rejects(readFile(npmrcPath), { code: 'ENOENT' })
      await runPnpm(version, cwd, ['config', 'list', '--json'])
    } else {
      await assert.rejects(migrate(), /incompatible/u)
      assert.equal(await readFile(workspacePath, 'utf8'), original)
      assert.equal(await readFile(manifestPath, 'utf8'), manifest)
      assert.equal(await readFile(npmrcPath, 'utf8'), 'save-prefix=~\n')
    }
  }
}

/**
 * Verify deprecated registry conversion against native release-specific routing.
 *
 * @param options - Release, workspace, command runner, and expected URL identity
 *
 * @returns A promise resolved after converted map and scope routing checks
 */
export async function verifyRegistryConversions(options: {
  version: string
  cwd: string
  runPnpm: PnpmRunner
  acceptsNpmAliases: boolean
}): Promise<void> {
  await verifyConvertedRegistryMaps(options)
  await verifyConvertedScopeRouting(options)
}
