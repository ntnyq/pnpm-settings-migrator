import process from 'node:process'
import { migratePnpmSettings } from '../core'
import type { Options } from '../types'
import { red } from '../utils/color'
import { createCli } from './options'
import { formatMigrationOutput } from './output'
import { formatCliError } from './redaction'

/**
 * Command-line parser configured with the executable's migration action.
 */
const cli = createCli()

cli
  .command('')
  .usage('[options]')
  .action(async (options: Options) => {
    const result = await migratePnpmSettings(options)
    process.stdout.write(
      `${formatMigrationOutput(result, options.showChanges)}\n`,
    )
  })

try {
  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
} catch (error) {
  process.stderr.write(`${red('✖')} ${formatCliError(error)}\n`)
  process.exitCode = 1
}
