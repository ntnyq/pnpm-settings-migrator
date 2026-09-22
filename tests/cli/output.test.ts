import { describe, expect, it } from 'vitest'
import { version } from '../../package.json'
import { createTestWorkspace } from '../helpers'
import { createTestCli } from './helpers'

describe('cli output', () => {
  const {
    testDir,
    writePackageJson,
    writeWorkspaceYaml,
    writeNpmrc,
    writeWorkspaceFile,
    readWorkspaceFile,
    readWorkspaceYaml,
  } = createTestWorkspace('cli-output')
  const runCli = createTestCli(testDir)

  it('never prints scheme-relative registry credentials', async () => {
    await writePackageJson({
      pnpm: {
        registry: '//user:review-secret@registry.example.test/',
        saveExact: true,
      },
    })

    const result = await runCli('--compatibility', 'v12')

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('unsafe registry')
    expect(`${result.stdout}${result.stderr}`).not.toContain('review-secret')
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      saveExact: true,
    })
  })

  it('retains unsupported Yarn selectors with a clear warning', async () => {
    await writePackageJson({ resolutions: { 'parent/**/child': '1.0.0' } })

    const result = await runCli()

    expect(result).toStrictEqual({
      code: 0,
      stderr: '',
      stdout:
        'WARN Kept Yarn resolution "parent/**/child" in package.json: its selector cannot be translated safely to pnpm overrides.\n\nℹ No changes needed.\n',
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')).resolutions,
    ).toStrictEqual({ 'parent/**/child': '1.0.0' })
  })

  it('migrates using --target-version through the built CLI', async () => {
    await writePackageJson({
      packageManager: 'pnpm@10.34.5',
      pnpm: { pipelineBase: 'main' },
    })
    const result = await runCli('--target-version', '12.4.0')
    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    await expect(readWorkspaceYaml()).resolves.toStrictEqual({
      pipelineBase: 'main',
    })
    expect(JSON.parse(await readWorkspaceFile('package.json'))).toStrictEqual({
      packageManager: 'pnpm@10.34.5',
    })
  })

  it('reports target-version conflicts without changing sources', async () => {
    await writeNpmrc('node-linker=isolated\n')
    const result = await runCli(
      '--compatibility',
      'v11',
      '--target-version',
      '12.4.0',
    )
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'targetVersion 12.4.0 conflicts with compatibility v11',
    )
    await expect(readWorkspaceFile('.npmrc')).resolves.toBe(
      'node-linker=isolated\n',
    )
  })

  it('prints one line when no configuration files exist', async () => {
    await expect(runCli()).resolves.toStrictEqual({
      code: 0,
      stdout: 'ℹ No configuration files found.\n',
      stderr: '',
    })
  })

  it.each([
    ['package.json', '{}'],
    ['pnpm-workspace.yaml', 'saveExact: true\n'],
    ['.npmrc', 'registry=https://registry.npmjs.org/\n'],
  ])(
    'prints one line for an unchanged workspace containing only %s',
    async (file, content) => {
      await writeWorkspaceFile(file, content)
      await expect(runCli()).resolves.toStrictEqual({
        code: 0,
        stdout: 'ℹ No changes needed.\n',
        stderr: '',
      })
    },
  )

  it('prints a summary and separated diff blocks, then one line on rerun', async () => {
    await writePackageJson({ pnpm: { saveExact: true, nodeLinker: 'hoisted' } })
    await expect(runCli()).resolves.toStrictEqual({
      code: 0,
      stdout:
        '✔ 2 settings changed\n\n+ saveExact: true\n\n+ nodeLinker: hoisted\n',
      stderr: '',
    })
    await expect(readWorkspaceYaml()).resolves.toMatchObject({
      saveExact: true,
      nodeLinker: 'hoisted',
    })
    expect(
      JSON.parse(await readWorkspaceFile('package.json')),
    ).not.toHaveProperty('pnpm')
    await expect(runCli()).resolves.toStrictEqual({
      code: 0,
      stdout: 'ℹ No changes needed.\n',
      stderr: '',
    })
  })

  it('keeps the summary when the diff is hidden', async () => {
    await writeNpmrc('save-exact=true\n')
    await expect(runCli('--no-show-changes')).resolves.toStrictEqual({
      code: 0,
      stdout: '✔ 1 setting changed\n',
      stderr: '',
    })
  })

  it('reports source cleanup when workspace settings already match', async () => {
    await writeWorkspaceYaml('saveExact: true\n')
    await writePackageJson({ pnpm: { saveExact: true } })
    await expect(runCli()).resolves.toStrictEqual({
      code: 0,
      stdout: '✔ Migration completed. Source settings cleaned up.\n',
      stderr: '',
    })
  })

  it('reports runtime-only destination changes', async () => {
    await writeWorkspaceYaml('{}\n')
    await writePackageJson({ pnpm: { useNodeVersion: '22.19.0' } })
    await expect(
      runCli('--compatibility', 'v11', '--no-clean-package-json'),
    ).resolves.toStrictEqual({
      code: 0,
      stdout:
        '✔ Migration completed. Node.js runtime updated in package.json.\n',
      stderr: '',
    })
  })

  it('reports formatting-only changes', async () => {
    await writeWorkspaceYaml('saveExact: true\nnodeLinker: hoisted\n')
    await writeNpmrc('save-exact=true\n')
    await expect(runCli('--no-clean-npmrc')).resolves.toStrictEqual({
      code: 0,
      stdout: '✔ Migration completed. Configuration files updated.\n',
      stderr: '',
    })
  })

  it('groups warnings without extra blank lines when the diff is hidden', async () => {
    await writePackageJson({
      pnpm: { thirdPartySetting: true, 'node-linker': 'hoisted' },
    })
    await expect(
      runCli('--compatibility', 'v11', '--no-show-changes'),
    ).resolves.toStrictEqual({
      code: 0,
      stdout:
        'WARN Kept non-camelCase settings in package.json#pnpm: "node-linker". Workspace manifest keys must use camelCase.\nWARN Kept settings in package.json#pnpm that pnpm 11 does not recognize: "thirdPartySetting".\n\nℹ No changes needed.\n',
      stderr: '',
    })
  })

  it.each([['--strategy', 'invalid'], ['--cwd'], ['--unknown']])(
    'prints one error and exits with code 1 for %j',
    async (...args) => {
      const result = await runCli(...args)
      expect(result.code).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toMatch(/^✖ [^\n]+\n$/u)
    },
  )

  it.each([
    ['package.json', '{'],
    ['pnpm-workspace.yaml', 'packages: ['],
  ])('reports a malformed %s once', async (file, content) => {
    await writeWorkspaceFile(file, content)
    const result = await runCli()
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr.match(/✖/gu)).toHaveLength(1)
    expect(result.stderr).not.toContain('at file:')
    expect(result.stderr).not.toContain('\n\n\n')
    await expect(readWorkspaceFile(file)).resolves.toBe(content)
  })

  it('still supports --version and --help without running migration', async () => {
    await writeWorkspaceFile('package.json', '{')
    const versionResult = await runCli('--version')
    expect(versionResult.code).toBe(0)
    expect(versionResult.stdout).toContain(version)
    expect(versionResult.stderr).toBe('')
    const helpResult = await runCli('--help')
    expect(helpResult.code).toBe(0)
    expect(helpResult.stdout).toContain('Options:')
    expect(helpResult.stdout).not.toContain('No changes')
    expect(helpResult.stderr).toBe('')
  })
})
