import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../../src/core'
import { fsExists } from '../../src/utils/fs'
import { createTestWorkspace } from '../helpers'

describe('migratePnpmSettings/ordered filters', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('filters')

  it.each(['12.10.0', '12.10.1', '12.11.0', '12.11.2'])(
    'retains filters ignored by pnpm %s in both sources',
    async targetVersion => {
      const settings = { filter: ['app', '!app', 'app'], filterProd: ['other'] }
      const npmrc = 'filter[]=app\nfilter-prod[]=other\n'
      await writePackageJson({ pnpm: { ...settings, saveExact: true } })
      await writeNpmrc(npmrc)
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      expect(result.warnings.join()).toContain('incompatible')
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        saveExact: true,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(npmrc)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(settings)
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'rejects ignored v12 workspace filters before writes with %s',
    async strategy => {
      const original = 'filter: [app]\nfilterProd: [other]\n'
      await writeWorkspaceYaml(original)
      await writePackageJson({ pnpm: { saveExact: true } })
      const manifest = await readWorkspaceFile('package.json')
      await expect(
        migratePnpmSettings({
          cwd: testDir,
          targetVersion: '12.11.2',
          strategy,
        }),
      ).rejects.toThrow('incompatible')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
      await expect(readWorkspaceFile('package.json')).resolves.toBe(manifest)
    },
  )

  describe.each([
    ['filter', 'filter'],
    ['filterProd', 'filter-prod'],
  ])('%s', (key, npmrcKey) => {
    it.each([
      ['discard', ['app', '!app'], { [key]: ['app', '!app', 'app'] }],
      ['merge', ['app', '!app', 'app'], undefined],
      ['overwrite', ['app', '!app', 'app'], undefined],
    ] as const)(
      'preserves repeated selectors and only cleans applied sources with %s',
      async (strategy, expectedFilter, expectedPnpm) => {
        const incoming = ['app', '!app', 'app']
        await writePackageJson({ pnpm: { [key]: incoming } })
        await writeWorkspaceYaml(`${key}: [app, "!app"]\n`)
        const options = { cwd: testDir, targetVersion: '11.28.5', strategy }

        await migratePnpmSettings(options)

        await expect(readWorkspaceYaml()).resolves.toStrictEqual({
          [key]: expectedFilter,
        })
        expect(
          JSON.parse(await readWorkspaceFile('package.json')).pnpm,
        ).toStrictEqual(expectedPnpm)
        expect((await migratePnpmSettings(options)).changedFiles).toStrictEqual(
          [],
        )
      },
    )

    it('retains existing repeated selectors when merging an empty list', async () => {
      await writePackageJson({ pnpm: { [key]: [] } })
      await writeWorkspaceYaml(`${key}: [app, "!app", app]\n`)

      await migratePnpmSettings({ cwd: testDir, targetVersion: '11.28.5' })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        [key]: ['app', '!app', 'app'],
      })
    })

    it('retains a source whose selectors have been reordered by discard', async () => {
      const incoming = ['app', '!app']
      await writePackageJson({ pnpm: { [key]: incoming } })
      await writeWorkspaceYaml(`${key}: ["!app", app]\n`)

      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '11.28.5',
        strategy: 'discard',
      })

      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ [key]: incoming })
    })

    it('retains an inclusion followed by an exclusion in the discarded destination', async () => {
      await writePackageJson({ pnpm: { [key]: ['app'] } })
      await writeWorkspaceYaml(`${key}: [app, "!app"]\n`)

      await migratePnpmSettings({
        cwd: testDir,
        targetVersion: '11.28.5',
        strategy: 'discard',
      })

      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual({ [key]: ['app'] })
    })

    it.each([
      [{ cleanPackageJson: false, cleanNpmrc: true }, { [key]: ['app'] }],
      [{ cleanPackageJson: true, cleanNpmrc: false }, undefined],
      [{ cleanPackageJson: false, cleanNpmrc: false }, { [key]: ['app'] }],
    ] as const)(
      'keeps selective source cleanup stable with %j',
      async (cleanup, expectedPnpm) => {
        await writePackageJson({ pnpm: { [key]: ['app'] } })
        await writeNpmrc(`${npmrcKey}[]=!app\n`)
        const options = { cwd: testDir, targetVersion: '11.28.5', ...cleanup }

        await migratePnpmSettings(options)

        expect((await migratePnpmSettings(options)).changedFiles).toStrictEqual(
          [],
        )
        await expect(readWorkspaceYaml()).resolves.toStrictEqual({
          [key]: ['app', '!app'],
        })
        await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
          `${npmrcKey}[]=!app\n`,
        )
        expect(
          JSON.parse(await readWorkspaceFile('package.json')).pnpm,
        ).toStrictEqual(expectedPnpm)
      },
    )

    it('keeps a repeated source sequence stable when cleanup is disabled', async () => {
      await writePackageJson({ pnpm: { [key]: ['app', '!app', 'app'] } })
      await writeWorkspaceYaml(`${key}: [other]\n`)
      const options = {
        cwd: testDir,
        targetVersion: '11.28.5',
        cleanPackageJson: false,
      }

      await migratePnpmSettings(options)
      const repeated = await migratePnpmSettings(options)

      expect(repeated.changedFiles).toStrictEqual([])
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        [key]: ['other', 'app', '!app', 'app'],
      })
    })

    it('keeps merged root sources stable after cleaning both ordered sequences', async () => {
      await writePackageJson({ pnpm: { [key]: ['app', '!app'] } })
      await writeNpmrc(`${npmrcKey}[]=app\n`)
      const options = { cwd: testDir, targetVersion: '11.28.5' }

      await migratePnpmSettings(options)

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        [key]: ['app', '!app', 'app'],
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
      await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(false)
      expect((await migratePnpmSettings(options)).changedFiles).toStrictEqual(
        [],
      )
    })

    it.each([
      ['discard', ['app', '!app'], true],
      ['merge', ['app', '!app', 'app'], false],
      ['overwrite', ['app', '!app', 'app'], false],
    ] as const)(
      'checks ordered npmrc selectors before cleanup with %s',
      async (strategy, expectedFilter, npmrcExists) => {
        const content = `${npmrcKey}[]=app\n${npmrcKey}[]=!app\n${npmrcKey}[]=app\n`
        await writeNpmrc(content)
        await writeWorkspaceYaml(`${key}: [app, "!app"]\n`)

        await migratePnpmSettings({
          cwd: testDir,
          targetVersion: '11.28.5',
          strategy,
        })

        await expect(readWorkspaceYaml()).resolves.toStrictEqual({
          [key]: expectedFilter,
        })
        await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(npmrcExists)
      },
    )
  })
})
