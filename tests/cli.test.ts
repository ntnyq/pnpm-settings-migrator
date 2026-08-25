import { describe, expect, it, vi } from 'vitest'
import { createCli } from '../src/cli-options'

describe('cli options', () => {
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
