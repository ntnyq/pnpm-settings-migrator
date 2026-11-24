import { isString } from '@ntnyq/utils'

/**
 * Maximum clock skew pnpm permits for a workspace reference time.
 */
const CLOCK_SKEW_MS = 600_000

/**
 * Validate pnpm's reference timestamp without rewriting the source value.
 *
 * @param value - Untrusted workspace timestamp
 *
 * @returns Whether pnpm would reject the timestamp
 */
export function hasInvalidReferenceTime(value: unknown): boolean {
  if (!isString(value)) {
    return true
  }
  const match =
    /^(?<date>\d{4}-\d\d-\d\d)[Tt ](?<time>\d\d:\d\d):(?<seconds>[0-5]\d|60)(?<suffix>(?:\.\d+)?(?:[Zz]|[+-]\d\d:\d\d))$/u.exec(
      value,
    )
  if (!match?.groups || match[0] !== value) {
    return true
  }
  const { date, time, seconds, suffix } = match.groups
  const midnight = new Date(`${date}T00:00:00Z`)
  if (
    Number.isNaN(midnight.getTime()) ||
    !midnight.toISOString().startsWith(`${date}T`) ||
    time?.startsWith('24:')
  ) {
    return true
  }
  const leapSecond = seconds === '60'
  const timestamp = Date.parse(
    `${date}T${time}:${leapSecond ? '59' : seconds}${suffix}`,
  )
  return (
    !Number.isFinite(timestamp) ||
    timestamp + (leapSecond ? 1_000 : 0) > Date.now() + CLOCK_SKEW_MS
  )
}
