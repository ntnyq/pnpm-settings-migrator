import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../../../src/core'
import { fsExists } from '../../../src/utils/fs'
import { createTestWorkspace } from '../../helpers'

describe('migratePnpmSettings/source cleanup', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writeNpmrc,
    writePackageJson,
    writeWorkspaceYaml,
  } = createTestWorkspace('source-cleanup')

  it.each([
    ['discard', 'hoisted', true],
    ['merge', 'hoisted', true],
    ['overwrite', 'isolated', false],
  ] as const)(
    'cleans root npmrc values applied by the %s strategy',
    async (strategy, nodeLinker, npmrcExists) => {
      await writeWorkspaceYaml('nodeLinker: hoisted\n')
      await writeNpmrc('node-linker=isolated\n')

      await migratePnpmSettings({
        compatibility: 'v11',
        cwd: testDir,
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({ nodeLinker })
      await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(npmrcExists)
    },
  )

  it.each([
    ['discard', 'https://old.invalid/node/', true],
    ['merge', 'https://old.invalid/node/', true],
    ['overwrite', 'https://new.invalid/node/', false],
  ] as const)(
    'cleans Node mirror values applied by the %s strategy',
    async (strategy, mirrorUrl, npmrcExists) => {
      await writeWorkspaceYaml(
        'nodeDownloadMirrors:\n  release: https://old.invalid/node/\n',
      )
      await writeNpmrc('node-mirror:release=https://new.invalid/node/\n')

      await migratePnpmSettings({
        compatibility: 'v11',
        cwd: testDir,
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toMatchObject({
        nodeDownloadMirrors: { release: mirrorUrl },
      })
      await expect(fsExists(`${testDir}/.npmrc`)).resolves.toBe(npmrcExists)
    },
  )

  it.each([
    ['discard', '1.0.0', { overrides: { bar: '3.0.0', foo: '2.0.0' } }],
    ['merge', '1.0.0', { overrides: { bar: '3.0.0', foo: '2.0.0' } }],
    ['overwrite', '2.0.0', undefined],
  ] as const)(
    'cleans package settings fully applied by the %s strategy',
    async (strategy, fooVersion, expectedPnpm) => {
      await writeWorkspaceYaml('overrides:\n  foo: 1.0.0\n')
      await writePackageJson({
        name: 'test-workspace',
        pnpm: {
          overrides: {
            bar: '3.0.0',
            foo: '2.0.0',
          },
        },
      })

      await migratePnpmSettings({
        compatibility: 'v11',
        cwd: testDir,
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toMatchObject({
        overrides: { bar: '3.0.0', foo: fooVersion },
      })
      const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
      expect(packageJson.pnpm).toStrictEqual(expectedPnpm)
    },
  )

  it('cleans exact v10 keys without deleting prefix matches', async () => {
    await writeNpmrc('tag-version-prefix=v\nnode-linker=hoisted')

    await migratePnpmSettings({ compatibility: 'v10', cwd: testDir })

    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'tag-version-prefix=v\n',
    )
    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      nodeLinker: 'hoisted',
    })
  })

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'retains conflicting root sources with %s',
    async strategy => {
      await writePackageJson({ pnpm: { nodeLinker: 'isolated' } })
      await writeNpmrc('node-linker=hoisted\n')

      await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v11',
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        nodeLinker: 'isolated',
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toContain(
        'node-linker=hoisted',
      )
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'checks each normalized source independently with %s',
    async strategy => {
      await writePackageJson({ pnpm: { allowNonAppliedPatches: false } })
      await writeNpmrc('allow-non-applied-patches=true\n')

      await migratePnpmSettings({
        cwd: testDir,
        compatibility: 'v11',
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        allowUnusedPatches: false,
      })
      await expect(readWorkspaceFile('.npmrc')).resolves.toContain(
        'allow-non-applied-patches=true',
      )
    },
  )
})
