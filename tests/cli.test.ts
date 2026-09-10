import { describe, expect, it, vi } from 'vitest'
import { createCli } from '../src/cli/options'

describe('cli options', () => {
  it('parses an exact target version', () => {
    const parsed = createCli().parse(
      ['node', 'cli', '--target-version', '12.4.0'],
      { run: false },
    )
    expect(parsed.options.targetVersion).toBe('12.4.0')
  })

  it('requires a value for --target-version', () => {
    const cli = createCli()
    cli.command('').action(() => {})
    expect(() => cli.parse(['node', 'cli', '--target-version'])).toThrow(
      'option `--target-version <version>` value is missing',
    )
  })

  it('requires a value for --cwd', () => {
    const cli = createCli()
    cli.command('').action(() => {})

    expect(() => cli.parse(['node', 'cli', '--cwd'])).toThrow(
      'option `--cwd <cwd>` value is missing',
    )
  })

  it('parses a supplied --cwd value', () => {
    const parsed = createCli().parse(['node', 'cli', '--cwd', '/tmp/project'], {
      run: false,
    })

    expect(parsed.options.cwd).toBe('/tmp/project')
  })

  it('does not show a blank default command in help', () => {
    const cli = createCli()
    cli.command('').action(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    try {
      cli.parse(['node', 'cli', '--help'])

      const help = info.mock.calls
        .map(([message]) => String(message))
        .join('\n')
      expect(help).toContain('Options:')
      expect(help).not.toContain('Commands:')
      expect(help).not.toContain('For more info')
    } finally {
      info.mockRestore()
    }
  })
})
