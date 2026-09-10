import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { migratePnpmSettings } from '../src'
import { createTestWorkspace } from './helpers'

describe('migratePnpmSettings/dynamic proxy values', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
    writeNpmrc,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('dynamic-proxies')
  const proxies = {
    httpProxy: 'http://$' + '{PROXY_HOST}:8080',
    httpsProxy: '$' + '{HTTPS_PROXY}',
    noProxy: '$' + '{NO_PROXY}',
    proxy: '$' + '{PROXY}',
    noproxy: '$' + '{no_proxy}',
  }

  it.each(['10.34.5', '11.26.0', '12.3.4', '12.4.0'] as const)(
    'retains proxy placeholders from both source types in %s',
    async targetVersion => {
      await writePackageJson({ pnpm: { ...proxies, nodeLinker: 'isolated' } })
      await writeNpmrc(
        [
          `http-proxy=${proxies.httpProxy}`,
          `https-proxy=${proxies.httpsProxy}`,
          `no-proxy=${proxies.noProxy}`,
          `proxy=${proxies.proxy}`,
          `noproxy=${proxies.noproxy}`,
          '',
        ].join('\n'),
      )
      const original = await readWorkspaceFile('.npmrc')
      const result = await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual({
        nodeLinker: 'isolated',
      })
      expect(
        JSON.parse(await readWorkspaceFile('package.json')).pnpm,
      ).toStrictEqual(proxies)
      await expect(readWorkspaceFile('.npmrc')).resolves.toBe(original)
      expect(result.warnings.join()).toContain(
        'trusted global configuration or environment variables',
      )
      expect(result.warnings.join()).not.toContain('PROXY_HOST')
    },
  )

  it.each(['10.34.5', '11.26.0', '12.3.4', '12.4.0'] as const)(
    'rejects existing dynamic proxies without writes in %s',
    async targetVersion => {
      const original = stringify(proxies)
      await writeWorkspaceYaml(original)
      await expect(
        migratePnpmSettings({ cwd: testDir, targetVersion }),
      ).rejects.toThrow('dynamic proxy settings')
      await expect(readWorkspaceFile('pnpm-workspace.yaml')).resolves.toBe(
        original,
      )
    },
  )

  it.each(['10.34.5', '11.26.0', '12.3.4', '12.4.0'] as const)(
    'preserves literal proxy values in %s',
    async targetVersion => {
      const literals = {
        httpProxy: 'http://proxy.example.invalid:8080',
        httpsProxy: 'http://proxy.example.invalid:8080',
        noProxy: 'localhost,.example.invalid',
        proxy: 'http://proxy.example.invalid:8080',
        noproxy: 'localhost',
      }
      await writePackageJson({ pnpm: literals })
      await migratePnpmSettings({ cwd: testDir, targetVersion })
      await expect(readWorkspaceYaml()).resolves.toStrictEqual(literals)
    },
  )
})
