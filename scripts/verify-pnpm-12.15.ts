import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'
import { migratePnpmSettings } from '../src'
import {
  PNPM_V11_28_6_MINIMUM_VERSION,
  PNPM_V11_28_7_MINIMUM_VERSION,
  PNPM_V11_28_9_MINIMUM_VERSION,
  PNPM_V12_14_MINIMUM_VERSION,
  PNPM_V12_15_MINIMUM_VERSION,
} from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'
import { verifyTarballConsumption } from './verify-pnpm-tarball-settings'

/**
 * Generous unpacked size for successful fixture installs.
 */
const MAX_UNPACKED_BYTES = 1048576

/**
 * Exact release runner supplied by the compatibility harness.
 */
type PnpmRunner = (
  version: string,
  cwd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>

/**
 * Verify new settings and their actual preceding releases with real pnpm.
 *
 * @param version - Exact v11 or v12 release requested by the harness
 * @param runPnpm - Runner executing that release in temporary workspaces
 *
 * @returns A promise resolved after boundary, config, and install assertions
 */
export async function verifyPnpm12_15(
  version: string,
  runPnpm: PnpmRunner,
): Promise<void> {
  const parsed = parsePnpmVersion(version)
  if (
    !supportsMinimumVersion(parsed, PNPM_V11_28_6_MINIMUM_VERSION) &&
    !supportsMinimumVersion(parsed, PNPM_V12_14_MINIMUM_VERSION)
  ) {
    return
  }
  const supportsTar = supportsMinimumVersion(
    parsed,
    PNPM_V12_15_MINIMUM_VERSION,
  )
  const supportsV11 = supportsMinimumVersion(
    parsed,
    PNPM_V11_28_7_MINIMUM_VERSION,
  )
  const supportsLimit = supportsTar || supportsV11
  const supportsPnpr =
    supportsTar || supportsMinimumVersion(parsed, PNPM_V11_28_9_MINIMUM_VERSION)
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-settings-12.15-'))
  try {
    const manifestPath = join(cwd, 'package.json')
    const workspacePath = join(cwd, 'pnpm-workspace.yaml')
    const registry = 'https://registry.example/npm/'
    const newSettings = {
      bootConfig: { minimumReleaseAge: 0, trustPolicy: 'no-downgrade' },
      lockfile: { integrityTarget: 'tar' },
      registries: { [registry]: { serverType: 'pnpr' } },
    }
    const v11Settings = {
      autoInstallPeersFromHighestMatch: false,
      externalDependencies: ['example'],
    }
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'release-settings',
        private: true,
        packageManager: `pnpm@${version}`,
        pnpm: {
          ...newSettings,
          ...v11Settings,
          maxTarballUnpackedSize: MAX_UNPACKED_BYTES,
          saveExact: true,
        },
      }),
    )
    const result = await migratePnpmSettings({ cwd })
    assert.equal(result.warnings.length > 0, !supportsTar)
    const expected = {
      saveExact: true,
      ...(supportsTar
        ? { bootConfig: newSettings.bootConfig, lockfile: newSettings.lockfile }
        : {}),
      ...(supportsPnpr ? { registries: newSettings.registries } : {}),
      ...(supportsLimit ? { maxTarballUnpackedSize: MAX_UNPACKED_BYTES } : {}),
      ...(supportsV11 || version.startsWith('12.') ? v11Settings : {}),
    }
    assert.deepEqual(parse(await readFile(workspacePath, 'utf8')), expected)
    const retained = JSON.parse(await readFile(manifestPath, 'utf8')).pnpm
    assert.deepEqual(
      retained,
      supportsTar
        ? undefined
        : {
            bootConfig: newSettings.bootConfig,
            lockfile: newSettings.lockfile,
            ...(supportsPnpr ? {} : { registries: newSettings.registries }),
            ...(supportsLimit
              ? {}
              : { maxTarballUnpackedSize: MAX_UNPACKED_BYTES }),
            ...(supportsV11 || version.startsWith('12.') ? {} : v11Settings),
          },
    )
    const listed = await runPnpm(version, cwd, ['config', 'list', '--json'])
    assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
    const config = JSON.parse(listed.stdout)
    if (supportsLimit) {
      assert.equal(config.maxTarballUnpackedSize, MAX_UNPACKED_BYTES)
    }
    if (supportsV11) {
      assert.equal(config.autoInstallPeersFromHighestMatch, false)
    }
    if (supportsTar) {
      assert.equal(config.bootConfig.minimumReleaseAge, 0)
      assert.equal(config.bootConfig.trustPolicy, 'no-downgrade')
      assert.equal(config.lockfile.integrityTarget, 'tar')
      assert.equal(config.registries[registry].serverType, 'pnpr')
    }
    if (supportsLimit) {
      await verifyTarballConsumption(version, cwd, runPnpm)
    }
    process.stdout.write(
      `pnpm ${version} 11.28.7/12.15 boundaries and consumption verified\n`,
    )
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
