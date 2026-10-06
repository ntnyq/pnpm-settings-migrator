import { YAMLParseError } from 'yaml'
import { URL_USERINFO_PATTERN } from '../constants'

/**
 * Remove complete URL credentials from a terminal message.
 *
 * @param value - Unformatted terminal text
 *
 * @returns Text with URL userinfo replaced by a placeholder
 */
export function redactUrlCredentials(value: string): string {
  return value.replace(URL_USERINFO_PATTERN, '$<scheme>***@')
}

/**
 * Format a CLI failure without exposing configuration source excerpts.
 *
 * @param error - Failure from argument parsing or migration
 *
 * @returns Sanitized diagnostic, retaining parser locations when available
 */
export function formatCliError(error: unknown): string {
  if (error instanceof YAMLParseError) {
    return redactUrlCredentials(error.message.split('\n', 1)[0]).trim()
  }

  if (error instanceof SyntaxError) {
    const location = error.message.match(
      /\bposition \d+(?: \(line \d+ column \d+\))?/u,
    )?.[0]
    return `Invalid JSON configuration${location ? ` at ${location}` : ''}.`
  }

  const message = error instanceof Error ? error.message : String(error)
  return redactUrlCredentials(message).trim()
}
