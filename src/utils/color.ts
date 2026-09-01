import { getColor } from 'consola/utils'
import type { ColorFunction } from 'consola/utils'

/**
 * Apply dim terminal styling to a value.
 *
 * @param text - Text or number to style
 *
 * @returns ANSI-styled string
 */
export const dim: ColorFunction = getColor('dim')

/**
 * Apply green terminal styling to a value.
 *
 * @param text - Text or number to style
 *
 * @returns ANSI-styled string
 */
export const green: ColorFunction = getColor('green')

/**
 * Apply red terminal styling to a value.
 *
 * @param text - Text or number to style
 *
 * @returns ANSI-styled string
 */
export const red: ColorFunction = getColor('red')

/**
 * Apply bold terminal styling to a value.
 *
 * @param text - Text or number to style
 *
 * @returns ANSI-styled string
 */
export const bold: ColorFunction = getColor('bold')

/**
 * Apply magenta terminal styling to a value.
 *
 * @param text - Text or number to style
 *
 * @returns ANSI-styled string
 */
export const magenta: ColorFunction = getColor('magenta')
