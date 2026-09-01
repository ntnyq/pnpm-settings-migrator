import consola from 'consola'
import { stripAnsi } from 'consola/utils'
import { describe, expect, it, vi } from 'vitest'
import { migratePnpmSettings } from '../src/core'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/deprecated settings', () => {
  const { readWorkspaceFile, readWorkspaceYaml, testDir, writePackageJson } =
    createTestWorkspace('deprecated-settings')

  it('keeps canonical values when aliases are also declared', async () => {
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        audit: {
          ignore: ['GHSA-current'],
          level: 'moderate',
        },
        auditConfig: { ignoreGhsas: ['GHSA-legacy'] },
        auditLevel: 'high',
        catalogPrune: false,
        cleanupUnusedCatalogs: true,
        enableGlobalVirtualStore: true,
        remoteSideEffectsCache: { org: 'legacy' },
        sideEffectsCache: { read: false, write: true },
        sideEffectsCacheReadonly: true,
        update: {
          changeset: false,
          ignoreDeps: ['react'],
        },
        updateConfig: {
          changeset: true,
          githubActions: true,
          ignoreDependencies: ['eslint'],
        },
        virtualStoreType: 'project',
      },
    })

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      audit: {
        ignore: ['GHSA-current'],
        level: 'moderate',
      },
      catalogPrune: false,
      sideEffectsCache: {
        read: false,
        remote: { org: 'legacy' },
        write: true,
      },
      update: {
        changeset: false,
        githubActions: true,
        ignoreDeps: ['react'],
      },
      virtualStoreType: 'project',
    })
    const packageJson = JSON.parse(await readWorkspaceFile('package.json'))
    expect(packageJson.pnpm).toBeUndefined()
  })

  it.each([
    [
      'disabled global virtual store',
      { enableGlobalVirtualStore: false },
      { virtualStoreType: 'project' },
    ],
    [
      'writable shorthand cache',
      { sideEffectsCache: true, sideEffectsCacheReadonly: false },
      { sideEffectsCache: { read: true, write: true } },
    ],
    [
      'disabled read-only cache',
      { sideEffectsCacheReadonly: false },
      { sideEffectsCache: { read: false } },
    ],
  ] as const)('preserves explicit false for %s', async (_, pnpm, expected) => {
    await writePackageJson({ name: 'test-workspace', pnpm })

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual(expected)
  })

  it('keeps conflicting named registry prefixes for manual resolution', async () => {
    const registryUrl = 'https://registry.example.com/'
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        namedRegistries: { corp: registryUrl },
        registries: {
          [registryUrl]: { prefix: 'mirror', scopes: ['@internal'] },
        },
      },
    })
    const warn = vi.spyOn(consola, 'warn').mockImplementation(() => {})

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      namedRegistries: { corp: registryUrl },
      registries: {
        [registryUrl]: { prefix: 'mirror', scopes: ['@internal'] },
      },
    })
    const messages = warn.mock.calls.map(([message]) =>
      stripAnsi(String(message)),
    )
    expect(messages).toContain(
      `namedRegistries was kept because ${registryUrl} already declares prefix mirror.`,
    )

    warn.mockRestore()
  })

  it('merges default and scoped registry declarations by URL', async () => {
    const registryUrl = 'https://registry.example.com/'
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        namedRegistries: { corp: registryUrl },
        registries: {
          '@internal': registryUrl,
          default: registryUrl,
        },
      },
    })

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      registries: {
        [registryUrl]: {
          prefix: 'corp',
          scopes: ['@internal', '@'],
        },
      },
    })
  })

  it('allows registry aliases whose names resemble credential fields', async () => {
    const registryUrl = 'https://registry.example.com/'
    await writePackageJson({
      name: 'test-workspace',
      pnpm: {
        namedRegistries: { token: registryUrl },
      },
    })

    await migratePnpmSettings({
      compatibility: 'v11',
      cwd: testDir,
      replaceDeprecated: true,
    })

    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      registries: {
        [registryUrl]: { prefix: 'token' },
      },
    })
  })
})
