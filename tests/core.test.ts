import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { resolve } from '../scripts/utils'
import { migratePnpmSettings } from '../src/core'
import { fsExists, fsReadFile } from '../src/utils'

describe('migratePnpmSettings', () => {
  const TEST_DIR = resolve('tests/.tmp')

  beforeEach(async () => {
    await rm(TEST_DIR, { force: true, recursive: true })
    await mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_DIR, { force: true, recursive: true })
  })

  it('should warn when no .npmrc or package.json exists', async () => {
    await expect(
      migratePnpmSettings({ cwd: TEST_DIR }),
    ).resolves.toBeUndefined()
  })

  it('should migrate pnpm settings from package.json', async () => {
    const packageJson = {
      name: 'test-workspace',
      pnpm: {
        overrides: {
          foo: '1.0.0',
        },
        peerDependencyRules: {
          ignoreMissing: ['react'],
        },
      },
    }

    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )

    await migratePnpmSettings({ cwd: TEST_DIR })

    const workspaceExists = await fsExists(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
    )
    expect(workspaceExists).toBe(true)

    const workspaceContent = await fsReadFile(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
    )
    const workspace = parse(workspaceContent)

    expect(workspace).toMatchObject({
      overrides: {
        foo: '1.0.0',
      },
      peerDependencyRules: {
        ignoreMissing: ['react'],
      },
    })
  })

  it('should migrate pnpm settings from .npmrc', async () => {
    const npmrcContent = `
ignored-optional-dependencies[]=fsevents
ignored-optional-dependencies[]=@esbuild/*
`.trim()

    await writeFile(join(TEST_DIR, '.npmrc'), npmrcContent)

    await migratePnpmSettings({ cwd: TEST_DIR })

    const workspaceExists = await fsExists(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
    )
    expect(workspaceExists).toBe(true)

    const workspaceContent = await fsReadFile(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
    )
    const workspace = parse(workspaceContent)

    expect(workspace).toMatchObject({
      ignoredOptionalDependencies: ['fsevents', '@esbuild/*'],
    })
  })

  it('should merge settings from both package.json and .npmrc', async () => {
    const packageJson = {
      name: 'test-workspace',
      pnpm: {
        overrides: {
          foo: '1.0.0',
        },
      },
    }

    const npmrcContent = 'ignored-optional-dependencies[]=fsevents'

    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )
    await writeFile(join(TEST_DIR, '.npmrc'), npmrcContent)

    await migratePnpmSettings({ cwd: TEST_DIR })

    const workspaceContent = await fsReadFile(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
    )
    const workspace = parse(workspaceContent)

    expect(workspace).toMatchObject({
      ignoredOptionalDependencies: ['fsevents'],
      overrides: {
        foo: '1.0.0',
      },
    })
  })

  it('should convert resolutions to overrides when yarnResolutions is true', async () => {
    const packageJson = {
      name: 'test-workspace',
      pnpm: {
        overrides: {
          foo: '1.0.0',
        },
      },
      resolutions: {
        bar: '2.0.0',
      },
    }

    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )

    await migratePnpmSettings({ cwd: TEST_DIR, yarnResolutions: true })

    const workspaceContent = await fsReadFile(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
    )
    const workspace = parse(workspaceContent)

    expect(workspace.overrides).toMatchObject({
      bar: '2.0.0',
      foo: '1.0.0',
    })
  })

  it('should not convert resolutions when yarnResolutions is false', async () => {
    const packageJson = {
      name: 'test-workspace',
      resolutions: {
        bar: '2.0.0',
      },
    }

    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )

    await migratePnpmSettings({ cwd: TEST_DIR, yarnResolutions: false })

    const workspaceExists = await fsExists(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
    )
    expect(workspaceExists).toBe(false)
  })

  it('should preserve existing pnpm-workspace.yaml', async () => {
    const packageJson = {
      name: 'test-workspace',
      pnpm: {
        overrides: {
          foo: '1.0.0',
        },
      },
    }

    await writeFile(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
      `packages:\n  - packages/*\ncatalog:\n  vue: ^3.0.0\n`,
    )
    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )

    await migratePnpmSettings({ cwd: TEST_DIR })

    const workspaceContent = await fsReadFile(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
    )
    const workspace = parse(workspaceContent)

    expect(workspace).toMatchObject({
      packages: ['packages/*'],
      catalog: {
        vue: '^3.0.0',
      },
      overrides: {
        foo: '1.0.0',
      },
    })
  })

  it('should clean pnpm field from package.json when cleanPackageJson is true', async () => {
    const packageJson = {
      name: 'test-workspace',
      version: '1.0.0',
      pnpm: {
        overrides: {
          foo: '1.0.0',
        },
      },
    }

    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )

    await migratePnpmSettings({ cleanPackageJson: true, cwd: TEST_DIR })

    const updatedContent = await fsReadFile(join(TEST_DIR, 'package.json'))
    const updated = JSON.parse(updatedContent)

    expect(updated.pnpm).toBeUndefined()
    expect(updated.name).toBe('test-workspace')
    expect(updated.version).toBe('1.0.0')
  })

  it('should not clean package.json when cleanPackageJson is false', async () => {
    const packageJson = {
      name: 'test-workspace',
      pnpm: {
        overrides: {
          foo: '1.0.0',
        },
      },
    }

    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )

    await migratePnpmSettings({ cleanPackageJson: false, cwd: TEST_DIR })

    const updatedContent = await fsReadFile(join(TEST_DIR, 'package.json'))
    const updated = JSON.parse(updatedContent)

    expect(updated.pnpm).toMatchObject({
      overrides: {
        foo: '1.0.0',
      },
    })
  })

  it('should clean pnpm settings from .npmrc when cleanNpmrc is true', async () => {
    const npmrcContent = `
ignored-optional-dependencies[]=fsevents
ignored-optional-dependencies[]=@esbuild/*
registry=https://registry.npmjs.org/
`.trim()

    await writeFile(join(TEST_DIR, '.npmrc'), npmrcContent)

    await migratePnpmSettings({ cleanNpmrc: true, cwd: TEST_DIR })

    const updatedNpmrc = await fsReadFile(join(TEST_DIR, '.npmrc'))

    expect(updatedNpmrc).not.toContain('ignored-optional-dependencies')
    expect(updatedNpmrc).toContain('registry=https://registry.npmjs.org/')
  })

  it('should not clean .npmrc when cleanNpmrc is false', async () => {
    const npmrcContent = `ignored-optional-dependencies[]=fsevents\nregistry=https://registry.npmjs.org/`

    await writeFile(join(TEST_DIR, '.npmrc'), npmrcContent)

    await migratePnpmSettings({ cleanNpmrc: false, cwd: TEST_DIR })

    const updatedNpmrc = await fsReadFile(join(TEST_DIR, '.npmrc'))

    expect(updatedNpmrc).toContain('ignored-optional-dependencies')
    expect(updatedNpmrc).toContain('registry=https://registry.npmjs.org/')
  })

  it('should preserve indentation from package.json', async () => {
    const packageJson = {
      name: 'test-workspace',
      pnpm: {
        overrides: {
          foo: '1.0.0',
        },
      },
    }

    // Use 4 spaces for indentation
    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 4),
    )

    await migratePnpmSettings({ cleanPackageJson: true, cwd: TEST_DIR })

    const updatedContent = await fsReadFile(join(TEST_DIR, 'package.json'))

    // Check that 4-space indentation is preserved
    expect(updatedContent).toContain('    "name"')
  })

  it('should warn when no pnpm settings fields exist', async () => {
    const packageJson = {
      name: 'test-workspace',
      version: '1.0.0',
    }

    const npmrcContent = 'registry=https://registry.npmjs.org/'

    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )
    await writeFile(join(TEST_DIR, '.npmrc'), npmrcContent)

    await expect(
      migratePnpmSettings({ cwd: TEST_DIR }),
    ).resolves.toBeUndefined()

    const workspaceExists = await fsExists(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
    )
    expect(workspaceExists).toBe(false)
  })

  it('should handle empty overrides correctly', async () => {
    const packageJson = {
      name: 'test-workspace',
      pnpm: {
        overrides: {},
        peerDependencyRules: {
          ignoreMissing: ['react'],
        },
      },
    }

    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )

    await migratePnpmSettings({ cwd: TEST_DIR })

    const workspaceContent = await fsReadFile(
      join(TEST_DIR, 'pnpm-workspace.yaml'),
    )
    const workspace = parse(workspaceContent)

    expect(workspace.overrides).toBeUndefined()
    expect(workspace.peerDependencyRules).toMatchObject({
      ignoreMissing: ['react'],
    })
  })

  it('should delete resolutions when yarnResolutions is true and cleanPackageJson is true', async () => {
    const packageJson = {
      name: 'test-workspace',
      resolutions: {
        bar: '2.0.0',
      },
    }

    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )

    await migratePnpmSettings({
      cleanPackageJson: true,
      cwd: TEST_DIR,
      yarnResolutions: true,
    })

    const updatedContent = await fsReadFile(join(TEST_DIR, 'package.json'))
    const updated = JSON.parse(updatedContent)

    expect(updated.resolutions).toBeUndefined()
  })

  it('should not delete resolutions when yarnResolutions is false', async () => {
    const packageJson = {
      name: 'test-workspace',
      pnpm: {
        overrides: {
          foo: '1.0.0',
        },
      },
      resolutions: {
        bar: '2.0.0',
      },
    }

    await writeFile(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    )

    await migratePnpmSettings({
      cleanPackageJson: true,
      cwd: TEST_DIR,
      yarnResolutions: false,
    })

    const updatedContent = await fsReadFile(join(TEST_DIR, 'package.json'))
    const updated = JSON.parse(updatedContent)

    expect(updated.resolutions).toMatchObject({
      bar: '2.0.0',
    })
  })

  describe('merge strategies', () => {
    it('should use discard strategy to keep existing values', async () => {
      const existingWorkspace = `packages:
  - packages/*

overrides:
  foo: 1.0.0
`

      await writeFile(join(TEST_DIR, 'pnpm-workspace.yaml'), existingWorkspace)

      const packageJson = {
        name: 'test-workspace',
        pnpm: {
          packages: ['apps/*'],
          overrides: {
            bar: '2.0.0',
          },
        },
      }

      await writeFile(
        join(TEST_DIR, 'package.json'),
        JSON.stringify(packageJson, null, 2),
      )

      await migratePnpmSettings({
        cwd: TEST_DIR,
        strategy: 'discard',
      })

      const workspaceContent = await fsReadFile(
        join(TEST_DIR, 'pnpm-workspace.yaml'),
      )
      const workspace = parse(workspaceContent)

      expect(workspace.packages).toEqual(['packages/*'])
      expect(workspace.overrides).toEqual({
        bar: '2.0.0',
        foo: '1.0.0',
      })
    })

    it('should use overwrite strategy to replace with incoming values', async () => {
      const existingWorkspace = `packages:
  - packages/*

overrides:
  foo: 1.0.0
`

      await writeFile(join(TEST_DIR, 'pnpm-workspace.yaml'), existingWorkspace)

      const packageJson = {
        name: 'test-workspace',
        pnpm: {
          packages: ['apps/*'],
          overrides: {
            bar: '2.0.0',
          },
        },
      }

      await writeFile(
        join(TEST_DIR, 'package.json'),
        JSON.stringify(packageJson, null, 2),
      )

      await migratePnpmSettings({
        cwd: TEST_DIR,
        strategy: 'overwrite',
      })

      const workspaceContent = await fsReadFile(
        join(TEST_DIR, 'pnpm-workspace.yaml'),
      )
      const workspace = parse(workspaceContent)

      expect(workspace.packages).toEqual(['apps/*'])
      expect(workspace.overrides).toEqual({
        bar: '2.0.0',
        foo: '1.0.0',
      })
    })

    it('should use merge strategy to combine arrays with deduplication', async () => {
      const existingWorkspace = `packages:
  - packages/*
  - common

overrides:
  foo: 1.0.0

shamefullyHoist: true
`

      await writeFile(join(TEST_DIR, 'pnpm-workspace.yaml'), existingWorkspace)

      const packageJson = {
        name: 'test-workspace',
        pnpm: {
          packages: ['apps/*', 'common'],
          overrides: {
            bar: '2.0.0',
          },
        },
      }

      await writeFile(
        join(TEST_DIR, 'package.json'),
        JSON.stringify(packageJson, null, 2),
      )

      await migratePnpmSettings({
        cwd: TEST_DIR,
        strategy: 'merge',
      })

      const workspaceContent = await fsReadFile(
        join(TEST_DIR, 'pnpm-workspace.yaml'),
      )
      const workspace = parse(workspaceContent)

      expect(workspace.packages).toEqual(['packages/*', 'common', 'apps/*'])
      expect(workspace.overrides).toEqual({
        bar: '2.0.0',
        foo: '1.0.0',
      })
      expect(workspace.shamefullyHoist).toBe(true)
    })
  })
})
