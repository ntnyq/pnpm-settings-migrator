/**
 * Maximum dynamic-programming cells used for an exact line diff.
 */
export const MAX_LCS_CELLS = 1_000_000

/**
 * Match URL userinfo through its final @, including whitespace and @
 * characters accepted by URL parsers. Stop at authority boundaries.
 */
export const URL_USERINFO_PATTERN =
  /(?<scheme>(?:[a-z][a-z\d+.-]*:)?\/\/)[^/?#]*@/giu
