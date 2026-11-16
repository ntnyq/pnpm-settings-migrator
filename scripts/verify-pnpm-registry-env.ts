import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Verify native registry placeholder rejection and existing migration protections.
 *
 * @param version - Exact release, including the preceding v11/v12 controls
 * @param runPnpm - Exact-release runner for disposable workspaces
 * @returns A promise resolved after source retention and native config checks
 */
export async function verifyRegistryEnv(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  const parsed = parsePnpmVersion(version)
  if (
    // eslint-disable-next-line no-magic-numbers -- Actual preceding v11 release.
    !supportsMinimumVersion(parsed, [11, 28, 11]) &&
    // eslint-disable-next-line no-magic-numbers -- Actual preceding v12 release.
    !supportsMinimumVersion(parsed, [12, 18, 0])
  ) {
    return
  }
  const rejectsRegistry =
    // eslint-disable-next-line no-magic-numbers -- Exact v11 rejection boundary.
    supportsMinimumVersion(parsed, [11, 28, 12]) ||
    // eslint-disable-next-line no-magic-numbers -- Exact v12 rejection boundary.
    supportsMinimumVersion(parsed, [12, 19, 0])
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-settings-registry-env-'))
  const manifestPath = join(cwd, 'package.json')
  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const npmrcPath = join(cwd, '.npmrc')
  // eslint-disable-next-line no-template-curly-in-string -- Preserve the native placeholder.
  const registry = 'https://${MIGRATOR_REGISTRY_HOST}/'
  const cases = [
    { registry },
    { namedRegistries: { corp: registry } },
    { registries: { '@corp': registry } },
    { registries: { [registry]: { scopes: ['@corp'] } } },
  ]
  const manifest = {
    name: 'registry-env',
    private: true,
    packageManager: `pnpm@${version}`,
  }
  const run = () => runPnpm(version, cwd, ['config', 'list', '--json'])
  try {
    for (const settings of cases) {
      for (const strategy of ['discard', 'merge', 'overwrite'] as const) {
        await writeFile(
          manifestPath,
          JSON.stringify({
            ...manifest,
            pnpm: { saveExact: true, ...settings },
          }),
        )
        await writeFile(workspacePath, 'nodeLinker: isolated\n')
        const result = await migratePnpmSettings({ cwd, strategy })
        assert.deepEqual(
          JSON.parse(await readFile(manifestPath, 'utf8')).pnpm,
          settings,
        )
        assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), {
          nodeLinker: 'isolated',
          saveExact: true,
        })
        assert.match(result.warnings.join(), /unsafe registry/u)

        const existing = stringify(settings)
        await writeFile(workspacePath, existing)
        const originalManifest = await readFile(manifestPath, 'utf8')
        await assert.rejects(
          migratePnpmSettings({ cwd, strategy }),
          /unsafe registry/u,
        )
        assert.equal(await readFile(workspacePath, 'utf8'), existing)
        assert.equal(await readFile(manifestPath, 'utf8'), originalManifest)
      }
      await writeFile(manifestPath, JSON.stringify(manifest))
      const config = run()
      if (rejectsRegistry) {
        await assert.rejects(
          config,
          /ERR_PNPM_REGISTRY_ENV_NOT_EXPANDED|registry URL.*contains an environment variable/u,
        )
      } else {
        await config
      }
    }

    await writeFile(workspacePath, 'saveExact: true\n')
    const npmrc = `registry=${registry}\n`
    await writeFile(npmrcPath, npmrc)
    await migratePnpmSettings({ cwd })
    assert.equal(await readFile(npmrcPath, 'utf8'), npmrc)
    const config = run()
    if (rejectsRegistry) {
      await assert.rejects(
        config,
        /ERR_PNPM_REGISTRY_ENV_NOT_EXPANDED|registry URL.*contains an environment variable/u,
      )
    } else {
      await config
    }
    await rm(npmrcPath)

    const placeholders = {
      // eslint-disable-next-line no-template-curly-in-string -- Preserve the native placeholder.
      httpProxy: 'http://${MIGRATOR_PROXY_HOST}:8080',
      // eslint-disable-next-line no-template-curly-in-string -- Preserve the native placeholder.
      pnprServer: 'https://${MIGRATOR_PNPR_HOST}/',
      // eslint-disable-next-line no-template-curly-in-string -- Preserve the native placeholder.
      userAgent: '${MIGRATOR_USER_AGENT}',
    }
    await writeFile(workspacePath, stringify(placeholders))
    const ignored = await run()
    if (rejectsRegistry) {
      for (const field of Object.keys(placeholders)) {
        assert.match(ignored.stderr, new RegExp(`Ignored "${field}"`, 'u'))
      }
    }
    process.stdout.write(
      `pnpm ${version} registry environment boundary verified\n`,
    )
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
