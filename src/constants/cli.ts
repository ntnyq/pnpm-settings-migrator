/**
 * Maximum dynamic-programming cells used for an exact line diff.
 */
export const MAX_LCS_CELLS = 1_000_000

/**
 * URL userinfo can contain proxy usernames and passwords. It must never be
 * printed in a migration report.
 */
export const URL_USERINFO_PATTERN =
  /(?<scheme>[a-z][a-z\d+.-]*:\/\/)[^/\s@]+@/giu
