import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import { createTestWorkspace } from '../../helpers'

const projectRefusedSettings = [
  {
    version: '11.28.13',
    key: 'rawLockfileDir',
    value: 'derived-lockfiles',
    npmrc: 'raw-lockfile-dir=derived-lockfiles\n',
  },
  {
    version: '12.22.0',
    key: 'globalPackagesConfig',
    value: { storeDir: './global-store' },
    npmrc: 'global-packages-config=local-value\n',
  },
]

describe.each(projectRefusedSettings)('pnpm $version $key', fixture => {
  const { key, npmrc, value, version } = fixture
  const {
    testDir,
    readWorkspaceFile,
    readWorkspaceYaml,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace(`project-refused-${version}`)

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'retains project-refused source values with %s',
    async strategy => {
      await writePackageJson({
        packageManager: `pnpm@${version}`,
        pnpm: { [key]: value, saveExact: true },
      })
      await writeNpmrc(`${npmrc}node-linker=isolated\n`)
      await writeWorkspaceYaml('preferOffline: true\n')

      const result = await migratePnpmSettings({ cwd: testDir, strategy })

      const warnings = result.warnings.filter(warning =>
        warning.includes('project-refused'),
      )
      expect(warnings).toHaveLength(2)
      expect(warnings.join()).toContain(`"${key}"`)
      expect(warnings.join()).toContain(`"${npmrc.split('=')[0]}"`)
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        nodeLinker: 'isolated',
        preferOffline: true,
        saveExact: true,
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ [key]: value })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(npmrc)
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'rejects an existing project-refused field before writing with %s',
    async strategy => {
      await writePackageJson({ pnpm: { saveExact: true } })
      const manifest = await readWorkspaceFile('package.json')
      const workspace = stringify({ [key]: value })
      await writeWorkspaceYaml(workspace)
      await writeNpmrc('node-linker=isolated\n')

      await expect(
        migratePnpmSettings({ cwd: testDir, strategy, targetVersion: version }),
      ).rejects.toThrow(`refused: "${key}"`)
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        workspace,
      )
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
        'node-linker=isolated\n',
      )
    },
  )
})
