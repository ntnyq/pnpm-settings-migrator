import { describe, expect, it } from 'vitest'
import { migratePnpmSettings } from '../src/core'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/schema validation', () => {
  const { readWorkspaceFile, testDir, writeWorkspaceYaml } =
    createTestWorkspace('schema-validation')

  it.each([
    [
      'v12-only settings in v11',
      'globalShims:\n  node: always',
      'other pnpm major: "globalShims"',
    ],
    [
      'project-refused settings',
      'globalDir: .pnpm-global',
      'refused: "globalDir"',
    ],
    [
      'non-camelCase settings',
      'node-linker: isolated',
      'not camelCase: "node-linker"',
    ],
    [
      'unknown settings',
      'thirdPartySetting: true',
      'unrecognized: "thirdPartySetting"',
    ],
    [
      'unsafe registry URLs',
      'registries:\n  "https://fake:secret@registry.invalid/":\n    prefix: corp',
      'unsafe registry URL: "registries"',
    ],
  ] as const)(
    'rejects %s without changing the workspace',
    async (_, yaml, error) => {
      const original = `packages: []\n${yaml}\n`
      await writeWorkspaceYaml(original)

      await expect(
        migratePnpmSettings({ compatibility: 'v11', cwd: testDir }),
      ).rejects.toThrow(error)
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
    },
  )

  it.each([
    [
      'a scalar entry',
      'packageConfigs:\n  app: true',
      'app must contain a project settings object',
    ],
    [
      'a scalar array entry',
      'packageConfigs:\n  - true',
      'packageConfigs[0] must be an object with a match array',
    ],
    [
      'an array entry without match',
      'packageConfigs:\n  - saveExact: true',
      'packageConfigs[0].match must be an array of package names',
    ],
    [
      'a non-string match',
      'packageConfigs:\n  - match: [42]\n    saveExact: true',
      'packageConfigs[0].match must be an array of package names',
    ],
    [
      'an unsupported project field',
      'packageConfigs:\n  app:\n    nodeLinker: hoisted',
      'app contains unsupported project settings: "nodeLinker"',
    ],
  ] as const)('rejects packageConfigs with %s', async (_, yaml, error) => {
    const original = `packages: []\n${yaml}\n`
    await writeWorkspaceYaml(original)

    await expect(
      migratePnpmSettings({ compatibility: 'v11', cwd: testDir }),
    ).rejects.toThrow(error)
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })

  it.each([
    ['record form', 'packageConfigs:\n  app:\n    saveExact: true'],
    ['array form', 'packageConfigs:\n  - match: [app]\n    savePrefix: "^"'],
  ] as const)('accepts valid packageConfigs in %s', async (_, yaml) => {
    const original = `packages: []\n${yaml}\n`
    await writeWorkspaceYaml(original)

    await expect(
      migratePnpmSettings({ compatibility: 'v11', cwd: testDir }),
    ).resolves.toBeUndefined()
    await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
      original,
    )
  })
})
