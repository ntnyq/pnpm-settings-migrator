import process from 'node:process'
import { cac } from 'cac'
import { consola } from 'consola'
import { getColor } from 'consola/utils'
import { name, version } from '../package.json'
import { migratePnpmSettings } from './core'
import type { Options } from './options'

const dim = getColor('dim')
const green = getColor('green')
const red = getColor('red')
const bold = getColor('bold')
const magenta = getColor('magenta')

const cli = cac(name)

cli
  .version(version)
  .option('--cwd [cwd]', 'Current working directory')
  .option('--no-clean-npmrc', 'Disable removing pnpm settings in .npmrc file')
  .option(
    '--no-clean-package-json',
    'Disable removing pnpm field in package.json',
  )
  .help()

cli.command('').action(async (options: Options) => {
  try {
    consola.log(`\n${bold(magenta(name))} ${dim(`v${version}`)}`)
    consola.log(dim('\n--------------\n'))

    await migratePnpmSettings(options)

    consola.success(green('pnpm settings migrate successfully!'))
  } catch (err) {
    consola.fail(red(String(err)))

    if (err instanceof Error && err.stack) {
      consola.fail(dim(err.stack?.split('\n').slice(1).join('\n')))
    }

    process.exit(1)
  }
})

cli.parse()
