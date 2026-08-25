import consola from 'consola'
import { stripAnsi } from 'consola/utils'
import { describe, expect, it, vi } from 'vitest'
import {
  collectSettingsChanges,
  createSettingsDiffLines,
  reportSettingsChanges,
} from '../../src/utils/settings-change'

describe('settings changes', () => {
  it('collects changed root settings', () => {
    const changes = collectSettingsChanges(
      {
        catalog: { vue: '^3.0.0' },
        overrides: { foo: '1.0.0' },
        packages: ['packages/*'],
      },
      {
        catalog: { vue: '^3.0.0' },
        overrides: { bar: '2.0.0', foo: '1.0.0' },
        packages: ['packages/*', 'apps/*'],
        pmOnFail: 'warn',
      },
    )

    expect(changes).toStrictEqual([
      {
        after: { bar: '2.0.0', foo: '1.0.0' },
        before: { foo: '1.0.0' },
        key: 'overrides',
      },
      {
        after: ['packages/*', 'apps/*'],
        before: ['packages/*'],
        key: 'packages',
      },
      {
        after: 'warn',
        before: undefined,
        key: 'pmOnFail',
      },
    ])
  })

  it('creates a line-based YAML diff for nested values', () => {
    expect(
      createSettingsDiffLines({
        after: { foo: '1.0.0', bar: '2.0.0' },
        before: { foo: '1.0.0' },
        key: 'overrides',
      }),
    ).toStrictEqual([
      { kind: 'unchanged', value: 'overrides:' },
      { kind: 'unchanged', value: '  foo: 1.0.0' },
      { kind: 'added', value: '  bar: 2.0.0' },
    ])
  })

  it('creates added and removed blocks for root settings', () => {
    expect(
      createSettingsDiffLines({
        after: true,
        before: undefined,
        key: 'saveExact',
      }),
    ).toStrictEqual([{ kind: 'added', value: 'saveExact: true' }])

    expect(
      createSettingsDiffLines({
        after: undefined,
        before: true,
        key: 'ignoreDepScripts',
      }),
    ).toStrictEqual([{ kind: 'removed', value: 'ignoreDepScripts: true' }])
  })

  it('reports the change count and a colored multi-line diff', () => {
    const info = vi.spyOn(consola, 'info').mockImplementation(() => {})
    const log = vi.spyOn(consola, 'log').mockImplementation(() => {})

    reportSettingsChanges([
      { after: ['apps/*'], before: ['packages/*'], key: 'packages' },
    ])

    expect(info).toHaveBeenCalledWith('1 setting changed')
    const messages = log.mock.calls.map(([message]) =>
      stripAnsi(String(message)),
    )
    expect(messages).toStrictEqual([
      '  packages:',
      '-   - packages/*',
      '+   - apps/*',
    ])

    info.mockRestore()
    log.mockRestore()
  })

  it('reports zero changes without detail lines', () => {
    const info = vi.spyOn(consola, 'info').mockImplementation(() => {})
    const log = vi.spyOn(consola, 'log').mockImplementation(() => {})

    reportSettingsChanges([])

    expect(info).toHaveBeenCalledWith('0 settings changed')
    expect(log).not.toHaveBeenCalled()

    info.mockRestore()
    log.mockRestore()
  })
})
