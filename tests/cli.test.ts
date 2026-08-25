import { describe, expect, it } from 'vitest'
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
})
