import * as fs from 'node:fs/promises'
import { join } from 'pathe'
import { describe, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../../../src'
import { resolvePnpmTarget } from '../../../src/features/compatibility/target'
import { readPnpmWorkspace } from '../../../src/features/sources/config'
import { readIncludedWorkspace } from '../../../src/features/sources/includes/load'
import { createTestWorkspace } from '../../helpers'

vi.mock(import('node:fs/promises'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
  }
})

/**
 * Simulate filesystem identities beyond the precision of JavaScript numbers.
 *
 * @param identities - Exact inode numbers indexed by normalized fixture path
 * @returns A spy to restore after the migration assertion
 */
async function mockFileIdentities(identities: ReadonlyMap<string, bigint>) {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return vi.spyOn(fs, 'stat').mockImplementation(async (path, options) => {
    const information = await actual.stat(path, options)
    const identity = identities.get(String(path).replaceAll('\\', '/'))
    if (!information || identity === undefined) {
      return information
    }
    return Object.assign(information, {
      ino: options?.bigint ? identity : Number(identity),
    })
  })
}

describe('include filesystem compatibility', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceFile,
    writeWorkspaceYaml,
    readWorkspaceFile,
  } = createTestWorkspace('include-filesystem')
  const targetVersion = '12.15.0'

  it('normalizes physical local include paths returned by Windows realpath', async () => {
    await writeWorkspaceYaml(
      stringify({ include: { './policy.yaml': ['saveExact'] } }),
    )
    await writeWorkspaceFile('policy.yaml', 'saveExact: true\n')
    const root = await readPnpmWorkspace(
      join(testDir, 'pnpm-workspace.yaml'),
      true,
    )
    const spy = vi
      .spyOn(fs, 'realpath')
      .mockResolvedValueOnce('C:\\workspace\\policy.yaml')
    try {
      const workspace = await readIncludedWorkspace({
        root,
        cwd: testDir,
        target: resolvePnpmTarget({ compatibility: 'auto', targetVersion }),
      })
      expect(workspace.files[1]?.path).toBe('C:/workspace/policy.yaml')
    } finally {
      spy.mockRestore()
    }
  })

  it.each(['discard', 'merge', 'overwrite'] as const)(
    'distinguishes large file identities when migrating with %s',
    async strategy => {
      await writeWorkspaceYaml(
        stringify({
          include: {
            './policy.yaml': ['saveExact'],
            '@acme/policy': ['savePrefix'],
          },
          configDependencies: { '@acme/policy': '1.0.0' },
        }),
      )
      await writeWorkspaceFile('policy.yaml', '{}\n')
      await writeWorkspaceFile(
        'node_modules/.pnpm-config/@acme/policy/package.json',
        JSON.stringify({ version: '1.0.0', pnpm: { config: 'config.yaml' } }),
      )
      const entry = 'node_modules/.pnpm-config/@acme/policy/config.yaml'
      const policy = "savePrefix: '~'\n"
      await writeWorkspaceFile(entry, policy)
      await writePackageJson({ pnpm: { saveExact: true, savePrefix: '~' } })
      // These distinct identities round to the same number on affected filesystems.
      const spy = await mockFileIdentities(
        new Map([
          [join(testDir, 'pnpm-workspace.yaml'), 2n ** 60n],
          [join(testDir, 'policy.yaml'), 2n ** 60n + 1n],
          [join(testDir, entry), 2n ** 60n + 2n],
        ]),
      )
      try {
        const result = await migratePnpmSettings({
          cwd: testDir,
          targetVersion,
          strategy,
        })
        expect(result.warnings).toStrictEqual([])
        expect(result.changedFiles).toContain(join(testDir, 'policy.yaml'))
        await expect(readWorkspaceFile('policy.yaml')).resolves.toContain(
          'saveExact: true',
        )
        await expect(readWorkspaceFile(entry)).resolves.toBe(policy)
        expect(
          JSON.parse(await readWorkspaceFile('package.json')).pnpm,
        ).toBeUndefined()
      } finally {
        spy.mockRestore()
      }
    },
  )

  it('rejects writable aliases of a read-only entry with a large file identity', async () => {
    const root = stringify({
      include: {
        './policy.yaml': ['saveExact'],
        '@acme/policy': ['savePrefix'],
      },
      configDependencies: { '@acme/policy': '1.0.0' },
    })
    await writeWorkspaceYaml(root)
    await writeWorkspaceFile(
      'node_modules/.pnpm-config/@acme/policy/package.json',
      JSON.stringify({ version: '1.0.0', pnpm: { config: 'config.yaml' } }),
    )
    const entry = 'node_modules/.pnpm-config/@acme/policy/config.yaml'
    await writeWorkspaceFile(entry, '{}\n')
    await fs.link(join(testDir, entry), join(testDir, 'policy.yaml'))
    const incoming = { saveExact: true }
    await writePackageJson({ pnpm: incoming })
    const spy = await mockFileIdentities(
      new Map([
        [join(testDir, 'pnpm-workspace.yaml'), 2n ** 60n],
        [join(testDir, 'policy.yaml'), 2n ** 60n + 1n],
        [join(testDir, entry), 2n ** 60n + 1n],
      ]),
    )
    try {
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('read-only config dependency')
      await expect(readWorkspaceFile(entry)).resolves.toBe('{}\n')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(root)
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(incoming)
    } finally {
      spy.mockRestore()
    }
  })
})
