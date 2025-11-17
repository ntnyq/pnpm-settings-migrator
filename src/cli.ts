import process from 'node:process'
import { cac } from 'cac'
import { consola } from 'consola'
import { name, version } from '../package.json'
import { migratePnpmSettings } from './core'
import { bold, dim, green, magenta, red } from './utils'
import type { Options } from './options'

const cli = cac(name)

cli
  .version(version)
  .option('--cwd [cwd]', 'Current working directory')
  .option('--sort-keys', 'Sort keys when write pnpm-workspace.yaml')
  .option(
    '--no-yarn-resolutions',
    'Disable migrating resolutions field in package.json',
  )
  .option(
    '--no-newline-between',
    'Disable adding newlines between each root keys',
  )
  .option('--no-clean-npmrc', 'Disable removing pnpm settings in .npmrc file')
  .option(
    '--no-clean-package-json',
    'Disable removing pnpm fields in package.json',
  )
  .help()

cli.command('').action(async (options: Options) => {
  try {
    consola.log(`\n${bold(magenta(name))} ${dim(`v${version}`)}`)
    consola.log(dim('\n--------------\n'))

    await migratePnpmSettings(options)

    consola.success(green('pnpm settings migrate has finished'))
  } catch (err) {
    consola.fail(red(String(err)))

    if (err instanceof Error && err.stack) {
      consola.fail(dim(err.stack?.split('\n').slice(1).join('\n')))
    }

    process.exit(1)
  }
})

cli.parse()
