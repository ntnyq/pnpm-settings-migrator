import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import { verifyRegistryConversions } from './verify-pnpm-registry-conversion'
import { verifyRegistryValues } from './verify-pnpm-registry-values'

/**
 * Exact release runner supplied by the compatibility harness.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Exact routing fixtures spanning representation fixes and npm URL identity.
 */
const ROUTING_VERSIONS = [
  '11.28.8',
  '11.28.9',
  '12.9.0',
  '12.10.0',
  '12.11.0',
  '12.11.1',
  '12.11.2',
  '12.15.0',
  '12.16.1',
]

/**
 * Fixture releases independently known to canonicalize npm's registry alias.
 */
const NPM_REGISTRY_ALIAS_VERSIONS = new Set([
  '12.11.1',
  '12.11.2',
  '12.15.0',
  '12.16.1',
])

/**
 * Check whole-map retention and pnpm rejection of invalid registry siblings.
 *
 * @param options - Exact release, temporary workspace, and command runner
 * @param registries - Valid declarations already consumed by pnpm
 *
 * @returns A promise resolved after source retention and real rejection checks
 */
export async function verifyInvalidRegistrySiblings(
  options: { version: string; cwd: string; runPnpm: PnpmRunner },
  registries: Record<string, unknown>,
): Promise<void> {
  const { version, cwd, runPnpm } = options
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const manifestPath = join(cwd, 'package.json')
  const original = await readFile(workspacePath, 'utf8')
  for (const declaration of [
    { serverType: 'typo' },
    { scopes: '@invalid' },
    null,
  ]) {
    const invalid = {
      registries: { ...registries, 'https://invalid.example/': declaration },
    }
    await writeFile(
      manifestPath,
      JSON.stringify({ name: 'invalid-sibling', private: true, pnpm: invalid }),
    )
    const result = await migratePnpmSettings({ cwd, targetVersion: version })
    assert.ok(result.warnings.some(warning => warning.includes('registries')))
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      invalid,
    )
    assert.equal(await readFile(workspacePath, 'utf8'), original)
    await runPnpm(version, cwd, ['config', 'list', '--json'])

    // Prove the retained map would break pnpm if it were written to YAML.
    await writeFile(workspacePath, stringify(invalid))
    await assert.rejects(
      runPnpm(version, cwd, ['config', 'list', '--json']),
      /registries/u,
    )
    await writeFile(workspacePath, original)
  }
}

/**
 * Compare scope URL identity rules with the selected pnpm implementation.
 *
 * @param options - Release, temporary workspace, and exact command runner
 *
 * @returns A promise resolved after normalization and source retention checks
 */
async function verifyRegistryRouteNormalization(options: {
  version: string
  cwd: string
  runPnpm: PnpmRunner
}): Promise<void> {
  const { version, cwd, runPnpm } = options
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const manifestPath = join(cwd, 'package.json')
  const cases = [
    {
      first: 'https://SAME.example:443/path',
      second: 'https://same.example/path/',
      accepted: version.startsWith('11.'),
    },
    {
      first: 'https://registry.npmjs.com/',
      second: 'https://registry.npmjs.org/',
      accepted: NPM_REGISTRY_ALIAS_VERSIONS.has(version),
    },
    {
      first: '//registry.npmjs.com/',
      second: '//registry.npmjs.org/',
      accepted: NPM_REGISTRY_ALIAS_VERSIONS.has(version),
    },
  ]
  for (const { first, second, accepted } of cases) {
    const settings = {
      registries: {
        [first]: { scopes: ['@same'] },
        [second]: { scopes: ['@same'] },
      },
    }
    await rm(workspacePath)
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'normalized-routes',
        private: true,
        packageManager: `pnpm@${version}`,
        pnpm: { ...settings, saveExact: true },
      }),
    )
    const result = await migratePnpmSettings({ cwd, targetVersion: version })
    assert.equal(
      result.warnings.some(warning => warning.includes('registries')),
      !accepted,
    )
    assert.deepEqual(
      JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
      accepted ? undefined : settings,
    )
    await writeFile(workspacePath, stringify(settings))
    if (accepted) {
      await runPnpm(version, cwd, ['config', 'list', '--json'])
    } else {
      await assert.rejects(
        runPnpm(version, cwd, ['config', 'list', '--json']),
        /scope/iu,
      )
    }
  }
}

/**
 * Verify routing conflicts and final-merge rejection with real supported pnpm.
 *
 * @param version - Exact release selected by the compatibility harness
 * @param runPnpm - Runner executing that release in temporary workspaces
 *
 * @returns A promise resolved after conflict and unchanged-file assertions
 */
export async function verifyRegistryRoutes(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  if (!ROUTING_VERSIONS.includes(version)) {
    return
  }
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-registry-routes-'))
  try {
    const workspacePath = join(cwd, 'pnpm-workspace.yaml')
    const manifestPath = join(cwd, 'package.json')
    const npmrcPath = join(cwd, '.npmrc')
    for (const route of [{ prefix: 'shared' }, { scopes: ['@same'] }]) {
      const existing = { registries: { 'https://existing.example/': route } }
      const incoming = { registries: { 'https://incoming.example/': route } }
      const original = stringify(existing)
      const manifest = JSON.stringify({
        name: 'routing-conflict',
        private: true,
        packageManager: `pnpm@${version}`,
        pnpm: incoming,
      })
      await writeFile(workspacePath, original)
      await writeFile(manifestPath, manifest)
      await writeFile(npmrcPath, 'save-prefix=~\n')
      await runPnpm(version, cwd, ['config', 'list', '--json'])
      for (const strategy of ['discard', 'merge', 'overwrite'] as const) {
        await assert.rejects(
          migratePnpmSettings({ cwd, targetVersion: version, strategy }),
          /incompatible/u,
        )
        assert.equal(await readFile(workspacePath, 'utf8'), original)
        assert.equal(await readFile(manifestPath, 'utf8'), manifest)
        assert.equal(await readFile(npmrcPath, 'utf8'), 'save-prefix=~\n')
      }
      await writeFile(
        workspacePath,
        stringify({
          registries: { ...existing.registries, ...incoming.registries },
        }),
      )
      await assert.rejects(
        runPnpm(version, cwd, ['config', 'list', '--json']),
        /prefix|scope/iu,
      )
    }
    await verifyRegistryConversions({
      version,
      cwd,
      runPnpm,
      acceptsNpmAliases: NPM_REGISTRY_ALIAS_VERSIONS.has(version),
    })
    await verifyRegistryRouteNormalization({ version, cwd, runPnpm })
    await verifyRegistryValues({ version, cwd, runPnpm })
    process.stdout.write(
      `pnpm ${version} registry routing conflicts and final merge checks verified\n`,
    )
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
