import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../../../src/core'
import { createTestWorkspace } from '../../helpers'

describe('pnpm 10.26 build permission conversion', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
    writeNpmrc,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('pnpm-10-26')

  it.each(['10.25.0', '10.26.0-rc.0', undefined])(
    'keeps legacy build settings for unconfirmed or older target %s',
    async targetVersion => {
      const legacy = {
        onlyBuiltDependencies: ['esbuild'],
        ignoredBuiltDependencies: ['core-js'],
      }
      await writePackageJson({ pnpm: legacy })

      const result = await migratePnpmSettings({
        cwd: testDir,
        targetVersion,
        compatibility: 'v10',
        replaceDeprecated: true,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual(legacy)
      expect(result.warnings.join('\n')).toContain('10.26.0')
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'preserves existing v10 build settings with %s',
    async strategy => {
      await writeWorkspaceYaml('onlyBuiltDependencies: [esbuild]\n')
      await writePackageJson({
        packageManager: 'pnpm@10.25.0',
        pnpm: { saveExact: true },
      })

      await migratePnpmSettings({
        cwd: testDir,
        replaceDeprecated: true,
        strategy,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        onlyBuiltDependencies: ['esbuild'],
        saveExact: true,
      })
    },
  )

  it('keeps npmrc build permissions in their supported legacy shape', async () => {
    await writeNpmrc(
      'only-built-dependencies[]=esbuild\nignored-built-dependencies[]=core-js\n',
    )

    await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '10.25.0',
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      onlyBuiltDependencies: ['esbuild'],
      ignoredBuiltDependencies: ['core-js'],
    })
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe('\n')
  })

  it('does not read a deferred build allowlist file on an older target', async () => {
    await writePackageJson({
      pnpm: { onlyBuiltDependenciesFile: 'not-installed-yet.json' },
    })

    await migratePnpmSettings({
      cwd: testDir,
      targetVersion: '10.25.0',
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      onlyBuiltDependenciesFile: 'not-installed-yet.json',
    })
  })

  it.each(['10.26.0', '10.26.0+build.1', '10.34.6'])(
    'replaces legacy build settings on supported target %s',
    async targetVersion => {
      await writePackageJson({
        packageManager: `pnpm@${targetVersion}`,
        pnpm: {
          onlyBuiltDependencies: ['esbuild'],
          ignoredBuiltDependencies: ['core-js'],
        },
      })

      const result = await migratePnpmSettings({
        cwd: testDir,
        replaceDeprecated: true,
      })

      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        allowBuilds: { esbuild: true, 'core-js': false },
      })
      expect(result.warnings).toStrictEqual([])
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toBeUndefined()
    },
  )
})
