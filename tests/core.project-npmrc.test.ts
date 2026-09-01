import consola from 'consola'
import { stripAnsi } from 'consola/utils'
import { describe, expect, it, vi } from 'vitest'
import { migratePnpmSettings } from '../src/core'
import { fsExists } from '../src/utils'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/project npmrc discovery', () => {
  const {
    readWorkspaceFile,
    readWorkspaceYaml,
    testDir,
    writePackageJson,
    writeWorkspaceFile,
    writeWorkspaceYaml,
  } = createTestWorkspace('project-npmrc')

  it('respects negated workspace package patterns', async () => {
    await writePackageJson({ name: 'test-workspace', private: true })
    await writeWorkspaceYaml(
      'packages:\n  - packages/*\n  - "!packages/excluded"\n',
    )
    await writeWorkspaceFile(
      'packages/included/package.json',
      JSON.stringify({ name: '@example/included', version: '1.0.0' }),
    )
    await writeWorkspaceFile('packages/included/.npmrc', 'save-exact=true\n')
    await writeWorkspaceFile(
      'packages/excluded/package.json',
      JSON.stringify({ name: '@example/excluded', version: '1.0.0' }),
    )
    await writeWorkspaceFile('packages/excluded/.npmrc', 'save-prefix=^\n')
    await writeWorkspaceFile(
      'packages/no-config/package.json',
      JSON.stringify({ name: '@example/no-config', version: '1.0.0' }),
    )

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })

    const workspace = await readWorkspaceYaml()
    expect(workspace.packageConfigs).toStrictEqual({
      '@example/included': { saveExact: true },
    })
    await expect(fsExists(`${testDir}/packages/included/.npmrc`)).resolves.toBe(
      false,
    )
    await expect(readWorkspaceFile('packages/excluded/.npmrc')).resolves.toBe(
      'save-prefix=^\n',
    )
  })

  it('keeps a project npmrc when package.json has no name', async () => {
    await writePackageJson({ name: 'test-workspace', private: true })
    await writeWorkspaceYaml('packages:\n  - packages/*\n')
    await writeWorkspaceFile(
      'packages/unnamed/package.json',
      JSON.stringify({ version: '1.0.0' }),
    )
    await writeWorkspaceFile('packages/unnamed/.npmrc', 'save-exact=true\n')
    const warn = vi.spyOn(consola, 'warn').mockImplementation(() => {})

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.not.toHaveProperty(
      'packageConfigs',
    )
    await expect(readWorkspaceFile('packages/unnamed/.npmrc')).resolves.toBe(
      'save-exact=true\n',
    )
    const messages = warn.mock.calls.map(([message]) =>
      stripAnsi(String(message)),
    )
    expect(messages).toContain(
      'packages/unnamed/.npmrc was kept because its package.json has no name for packageConfigs matching.',
    )

    warn.mockRestore()
  })

  it('keeps project npmrc files when package names are duplicated', async () => {
    await writePackageJson({ name: 'test-workspace', private: true })
    await writeWorkspaceYaml('packages:\n  - packages/*\n')
    await Promise.all(
      ['first', 'second'].flatMap(project => [
        writeWorkspaceFile(
          `packages/${project}/package.json`,
          JSON.stringify({ name: '@example/duplicate', version: '1.0.0' }),
        ),
        writeWorkspaceFile(`packages/${project}/.npmrc`, 'save-exact=true\n'),
      ]),
    )
    const warn = vi.spyOn(consola, 'warn').mockImplementation(() => {})

    await migratePnpmSettings({ compatibility: 'v11', cwd: testDir })

    await expect(readWorkspaceYaml()).resolves.not.toHaveProperty(
      'packageConfigs',
    )
    await expect(readWorkspaceFile('packages/first/.npmrc')).resolves.toBe(
      'save-exact=true\n',
    )
    await expect(readWorkspaceFile('packages/second/.npmrc')).resolves.toBe(
      'save-exact=true\n',
    )
    const messages = warn.mock.calls.map(([message]) =>
      stripAnsi(String(message)),
    )
    expect(messages).toContain(
      'Subproject .npmrc files for duplicate package name "@example/duplicate" were kept: packages/first/package.json, packages/second/package.json.',
    )

    warn.mockRestore()
  })

  it.each([
    ['discard', [{ match: ['@example/app'], saveExact: false }], true],
    ['merge', [{ match: ['@example/app'], saveExact: false }], true],
    ['overwrite', { '@example/app': { saveExact: true } }, false],
  ] as const)(
    'preserves project settings not applied to array packageConfigs under %s',
    async (strategy, packageConfigs, npmrcExists) => {
      await writePackageJson({ name: 'test-workspace', private: true })
      await writeWorkspaceYaml(
        [
          'packages:',
          '  - packages/*',
          'packageConfigs:',
          '  - match: ["@example/app"]',
          '    saveExact: false',
        ].join('\n'),
      )
      await writeWorkspaceFile(
        'packages/app/package.json',
        JSON.stringify({ name: '@example/app', version: '1.0.0' }),
      )
      await writeWorkspaceFile('packages/app/.npmrc', 'save-exact=true\n')

      await migratePnpmSettings({
        compatibility: 'v11',
        cwd: testDir,
        strategy,
      })

      const workspace = await readWorkspaceYaml()
      expect(workspace.packageConfigs).toStrictEqual(packageConfigs)
      await expect(fsExists(`${testDir}/packages/app/.npmrc`)).resolves.toBe(
        npmrcExists,
      )
    },
  )
})
