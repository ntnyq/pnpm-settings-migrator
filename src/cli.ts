import process from 'node:process'
import { consola } from 'consola'
import { name, version } from '../package.json'
import { createCli } from './cli-options'
import { migratePnpmSettings } from './core'
import type { Options } from './types'
import { bold, dim, green, magenta, red } from './utils'

const cli = createCli()

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
