import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import { PNPM_V11_29_MINIMUM_VERSION } from '../src/constants'
import {
  parsePnpmVersion,
  supportsMinimumVersion,
} from '../src/features/compatibility/version'

/**
 * Check v11 workspace validation and decimal release-age settings.
 *
 * @param version - Exact pnpm release, including the preceding control
 * @param runPnpm - Exact-release runner for disposable workspaces
 *
 * @returns A promise resolved after all applicable checks
 */
export async function verifyPnpm11_29(
  version: string,
  runPnpm: (
    version: string,
    cwd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<void> {
  const supported = supportsMinimumVersion(
    parsePnpmVersion(version),
    PNPM_V11_29_MINIMUM_VERSION,
  )
  if (!supported && version !== '11.28.13') {
    return
  }
  const cwd = await mkdtemp(join(tmpdir(), 'pnpm-settings-11.29-'))
  const manifest = join(cwd, 'package.json')
  const workspace = join(cwd, 'pnpm-workspace.yaml')
  const npmrc = join(cwd, '.npmrc')
  const settings = {
    noProxy: 'localhost',
    strictSsl: true,
    localAddress: '127.0.0.1',
  }
  const invalid = { noProxy: ['localhost'] }
  const decimalAge = '1.5'
  try {
    const packageJson = {
      name: 'reader-fixture',
      dependencies: { 'is-number': '7.0.0' },
      packageManager: `pnpm@${version}`,
    }
    await writeFile(
      manifest,
      JSON.stringify({
        ...packageJson,
        pnpm: { ...invalid, saveExact: true },
      }),
    )
    await migratePnpmSettings({ cwd })
    assert.deepEqual(parse(await readFile(workspace, 'utf8')), {
      saveExact: true,
      ...(supported ? {} : invalid),
    })
    assert.deepEqual(
      JSON.parse(await readFile(manifest, 'utf8')).pnpm,
      supported ? invalid : undefined,
    )

    await writeFile(
      manifest,
      JSON.stringify({ ...packageJson, pnpm: settings }),
    )
    await writeFile(workspace, '{}\n')
    await writeFile(npmrc, `minimum-release-age=${decimalAge}\n`)
    await migratePnpmSettings({ cwd })
    await assert.rejects(readFile(npmrc), { code: 'ENOENT' })
    const configList = ['config', 'list', '--json']
    const listed = await runPnpm(version, cwd, configList)
    assert.doesNotMatch(listed.stderr, /unrecognized|unknown.*setting/iu)
    const config = JSON.parse(listed.stdout)
    for (const [key, value] of Object.entries(settings)) {
      assert.equal(config[key], value)
    }
    assert.equal(
      config.minimumReleaseAge,
      supported ? Number(decimalAge) : decimalAge,
    )
    if (supported) {
      await runPnpm(version, cwd, [
        'install',
        '--no-frozen-lockfile',
        '--ignore-scripts',
      ])
      const lockfile = await readFile(join(cwd, 'pnpm-lock.yaml'), 'utf8')
      await runPnpm(version, cwd, [
        'install',
        '--frozen-lockfile',
        '--ignore-scripts',
      ])
      assert.equal(
        await readFile(join(cwd, 'pnpm-lock.yaml'), 'utf8'),
        lockfile,
      )
      await writeFile(workspace, 'minimumReleaseAge: -1\n')
      await assert.rejects(
        runPnpm(version, cwd, [
          'install',
          '--no-frozen-lockfile',
          '--ignore-scripts',
        ]),
        { stdout: /ERR_PNPM_INVALID_MINIMUM_RELEASE_AGE/u },
      )
      for (const [yaml, message] of [
        ['noProxy: [localhost]', /noProxy.*boolean or string/u],
        ['strictSsl: invalid', /strictSsl.*boolean/u],
        ['localAddress: false', /localAddress.*string/u],
        [
          'sideEffectsCache: {exclude: [false]}',
          /sideEffectsCache.exclude.*string/u,
        ],
        ['tasks: {build: null}', /tasks.*build.*has no value/u],
      ] as const) {
        await writeFile(workspace, `${yaml}\n`)
        await assert.rejects(runPnpm(version, cwd, configList), {
          stderr: message,
        })
      }
    }
    await writeFile(
      workspace,
      stringify({ otp: 'placeholder', saveExact: true }),
    )
    const otp = await runPnpm(version, cwd, configList)
    assert.equal(
      JSON.parse(otp.stdout).otp,
      supported ? undefined : 'placeholder',
    )
    if (supported) {
      assert.match(otp.stderr, /cannot be set.*"otp"/u)
    }
  } finally {
    await rm(cwd, { force: true, recursive: true })
  }
}
