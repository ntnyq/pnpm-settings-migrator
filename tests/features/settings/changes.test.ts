import { describe, expect, it } from 'vitest'
import { collectSettingsChanges } from '../../../src/features/settings/changes'

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
})
