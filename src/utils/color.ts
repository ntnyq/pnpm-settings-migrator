import { getColor } from 'consola/utils'
import type { ColorFunction } from 'consola/utils'

/**
 * Apply cyan terminal styling to a value.
 */
export const cyan: ColorFunction = getColor('cyan')

/**
 * Apply yellow terminal styling to a value.
 */
export const yellow: ColorFunction = getColor('yellow')

/**
 * Apply dim terminal styling to a value.
 */
export const dim: ColorFunction = getColor('dim')

/**
 * Apply green terminal styling to a value.
 */
export const green: ColorFunction = getColor('green')

/**
 * Apply red terminal styling to a value.
 */
export const red: ColorFunction = getColor('red')

/**
 * Apply bold terminal styling to a value.
 */
export const bold: ColorFunction = getColor('bold')

/**
 * Apply magenta terminal styling to a value.
 */
export const magenta: ColorFunction = getColor('magenta')
