import { isArray, isString } from '@ntnyq/utils'
import {
  ADDITIONAL_PLATFORM_CPU_PATTERN,
  LEGACY_PLATFORM_CPU_PATTERN,
  MAX_PLATFORM_TAG_NUMBER,
  NODE_PLATFORM_OS_PATTERN,
  PLATFORM_FLOOR_PATTERNS,
  PNPM_V12_5_MINIMUM_VERSION,
  PNPM_V12_18_MINIMUM_VERSION,
} from '../../constants'
import type { ResolvedPnpmTarget } from '../../types'
import { supportsMinimumVersion } from '../compatibility/version'

/**
 * Split a platform name or a legacy Rust triple without rewriting source values.
 *
 * @param entry - Platform list entry
 * @param extended - Whether additional Node.js platforms are supported
 *
 * @returns System, architecture and remaining tag parts, or undefined
 */
function parsePlatform(entry: string, extended: boolean): string[] | undefined {
  const [head = '', cpu = '', ...parts] = entry.split('-')
  const knownOs = extended
    ? NODE_PLATFORM_OS_PATTERN.test(head)
    : ['linux', 'darwin', 'win32'].includes(head)
  if (knownOs) {
    if (
      LEGACY_PLATFORM_CPU_PATTERN.test(cpu) ||
      (extended && ADDITIONAL_PLATFORM_CPU_PATTERN.test(cpu))
    ) {
      return [head, cpu, ...parts]
    }
    return undefined
  }
  if (!LEGACY_PLATFORM_CPU_PATTERN.test(head)) {
    return undefined
  }
  const system = [cpu, ...parts].join('-')
  if (system === 'apple-darwin') {
    return ['darwin', head]
  }
  if (system === 'pc-windows-msvc') {
    return ['win32', head]
  }
  const libc = system.replace(/^unknown-linux-/u, '')
  if (/^(?:gnu|glibc|musl|(?:manylinux|musllinux)_\d+_\d+)$/u.test(libc)) {
    return ['linux', head, libc]
  }
  return undefined
}

/**
 * Validate floor and ABI numbers as canonical unsigned 32-bit decimals.
 *
 * @param part - One accepted tag part containing decimal components
 *
 * @returns Whether all its numbers fit pnpm's tag parser
 */
function hasValidTagNumbers(part: string): boolean {
  return (part.match(/\d+/gu) ?? []).every(
    number =>
      (number === '0' || !number.startsWith('0')) &&
      Number(number) <= MAX_PLATFORM_TAG_NUMBER,
  )
}

/**
 * Validate the platform tag vocabulary after normalizing legacy libc spellings.
 *
 * @param os - Recognized Node.js system name
 * @param parts - Parts after the CPU, in their original order
 *
 * @returns Whether pnpm 12.18 consumes this platform tag
 */
function hasValidExtendedParts(os: string, parts: string[]): boolean {
  let family: string | undefined = undefined
  const normalized: string[] = []
  for (const part of parts) {
    if (!part) {
      return false
    }
    const isGlibc = /^(?:gnu|glibc|manylinux_\d+_\d+)$/u.test(part)
    const isMusl = /^(?:musl|musllinux_\d+_\d+)$/u.test(part)
    if (isGlibc || isMusl) {
      const nextFamily = isGlibc ? 'glibc' : 'musl'
      if (os !== 'linux' || (family && family !== nextFamily)) {
        return false
      }
      family = nextFamily
    }
    if (!['gnu', 'glibc'].includes(part)) {
      normalized.push(part.startsWith('musllinux_') && isMusl ? 'musl' : part)
    }
  }
  const suffix = normalized.join('-')
  const abi = '(?:napi|node|electron)\\d+'
  const floor = PLATFORM_FLOOR_PATTERNS[os]
  const pattern = floor ? `^(?:${floor}(?:-${abi})?|${abi})?$` : `^(?:${abi})?$`
  return (
    new RegExp(pattern, 'u').test(suffix) &&
    normalized.every(hasValidTagNumbers)
  )
}

/**
 * Validate one entry using the exact target's platform vocabulary.
 *
 * @param entry - Untrusted array item
 * @param extended - Whether floor, ABI and additional Node.js platforms work
 *
 * @returns Whether the selected release accepts the complete entry
 */
function isSupportedPlatform(entry: unknown, extended: boolean): boolean {
  if (!isString(entry) || /\s/u.test(entry)) {
    return false
  }
  if (entry === 'current') {
    return true
  }
  const parsed = parsePlatform(entry, extended)
  if (!parsed) {
    return false
  }
  const [os = '', , ...parts] = parsed
  if (extended) {
    return hasValidExtendedParts(os, parts)
  }
  return (
    parts.length === 0 ||
    (os === 'linux' &&
      parts.length === 1 &&
      /^(?:gnu|glibc|musl|(?:manylinux|musllinux)_\d+_\d+)$/u.test(
        parts[0] ?? '',
      ))
  )
}

/**
 * Reject an entire platform list when any entry cannot be consumed by the target.
 * Legacy OS/CPU/libc axis objects keep their existing migration behavior.
 *
 * @param key - Canonical setting name
 * @param value - Incoming or existing workspace value
 * @param target - Confirmed target version and major schema
 *
 * @returns Whether the list must remain in its source
 */
export function hasIncompatiblePlatformList(
  key: string,
  value: unknown,
  target: ResolvedPnpmTarget,
): boolean {
  if (key !== 'supportedArchitectures' || !isArray(value)) {
    return false
  }
  const extended = supportsMinimumVersion(
    target.version,
    PNPM_V12_18_MINIMUM_VERSION,
  )
  return (
    !supportsMinimumVersion(target.version, PNPM_V12_5_MINIMUM_VERSION) ||
    !value.every(entry => isSupportedPlatform(entry, extended))
  )
}
