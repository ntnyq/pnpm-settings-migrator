import { isString } from '@ntnyq/utils'
import {
  PNPM_V11_29_MINIMUM_VERSION,
  PNPM_V12_23_MINIMUM_VERSION,
  PROJECT_REFUSED_SETTINGS,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'

/**
 * Determine whether a target refuses a project-level setting.
 *
 * @param key - Canonical workspace setting name
 * @param value - Untrusted workspace value
 * @param target - Compatibility and exact version when available
 *
 * @returns Whether pnpm reserves the setting for a non-project source
 */
export function isRefusedProjectSetting(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (PROJECT_REFUSED_SETTINGS.has(key)) {
    return true
  }
  if (key === 'editor') {
    return (
      isString(value) &&
      supportsMinimumVersion(target.version, PNPM_V12_23_MINIMUM_VERSION)
    )
  }
  return (
    key === 'otp' &&
    (supportsMinimumVersion(target.version, PNPM_V11_29_MINIMUM_VERSION) ||
      supportsMinimumVersion(target.version, PNPM_V12_23_MINIMUM_VERSION))
  )
}
