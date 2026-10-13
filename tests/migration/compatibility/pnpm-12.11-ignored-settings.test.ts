import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src/core'
import { createTestWorkspace } from '../../helpers'

describe('pnpm v12 ignored workspace settings', () => {
  const {
    testDir,
    writePackageJson,
    writeNpmrc,
    writeWorkspaceYaml,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-12.11-ignored-settings')

  const ignored = {
    production: true,
    dev: false,
    recursive: true,
    lockfileOnly: true,
    force: true,
    depth: 2,
    saveDev: true,
    fetchingConcurrency: 3,
    requiredScripts: ['build'],
    extraEnv: { EXAMPLE: 'value' },
  }

  describe.each(['12.2.1', '12.11.2', '12.12.1'])(
    'target %s',
    targetVersion => {
      it.each(['discard', 'merge', 'overwrite'] as const)(
        'retains ignored package settings with %s',
        async strategy => {
          await writePackageJson({ pnpm: { ...ignored, saveExact: true } })
          const options = { cwd: testDir, targetVersion, strategy }
          const result = await migratePnpmSettings(options)
          await expect(readWorkspaceYaml()).resolves.toStrictEqual({
            saveExact: true,
          })
          expect(
            JSON.parse(await readWorkspaceFile('package.json')).pnpm,
          ).toStrictEqual(ignored)
          for (const key of Object.keys(ignored)) {
            expect(result.warnings.join()).toContain(`"${key}"`)
          }
          await expect(migratePnpmSettings(options)).resolves.toMatchObject({
            changedFiles: [],
          })
        },
      )

      it('retains ignored npmrc settings while cleaning supported values', async () => {
        const retained =
          'production=true\nlockfile-only=true\nrequired-scripts[]=build\n'
        await writeNpmrc(`save-exact=true\n${retained}`)
        const result = await migratePnpmSettings({
          cwd: testDir,
          targetVersion,
        })
        await expect(readWorkspaceFile('.npmrc')).resolves.toBe(retained)
        await expect(readWorkspaceYaml()).resolves.toStrictEqual({
          saveExact: true,
        })
        expect(result.warnings.join()).toContain('production')
      })

      it.each(Object.entries(ignored))(
        'rejects existing ignored %s before writes',
        async (key, value) => {
          const original = stringify({ [key]: value })
          await writeWorkspaceYaml(original)
          await writePackageJson({ pnpm: { saveExact: true } })
          const manifest = await readWorkspaceFile('package.json')
          await expect(
            migratePnpmSettings({ cwd: testDir, targetVersion }),
          ).rejects.toThrow(key)
          await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
            original,
          )
          await expect(readWorkspaceFile('package.json')).resolves.toBe(
            manifest,
          )
        },
      )
    },
  )

  it.each(['v10', 'v11'] as const)(
    'keeps production migration available for %s',
    async compatibility => {
      await writeNpmrc('production=true\n')
      await migratePnpmSettings({ cwd: testDir, compatibility })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        production: true,
      })
    },
  )
})
