import process from 'node:process'
import { createCli } from './cli-options'
import { formatMigrationOutput } from './cli-output'
import { migratePnpmSettings } from './core'
import type { Options } from './types'
import { red } from './utils'

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
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${red('✖')} ${message.trim()}\n`)
  process.exitCode = 1
}
