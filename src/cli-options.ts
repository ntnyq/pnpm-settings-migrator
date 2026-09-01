import { cac } from 'cac'
import type { CAC } from 'cac'
import { name, version } from '../package.json'

/**
 * Create the command-line parser shared by the executable and parser tests.
 *
 * @returns Configured command-line parser
 */
export function createCli(): CAC {
  const cli = cac(name)
    .version(version)
    .option('--cwd <cwd>', 'Current working directory')
    .option('--sort-keys', 'Sort keys when write pnpm-workspace.yaml')
    .option(
      '--compatibility <compatibility>',
      'Compatibility target (auto, v10, v11, v12)',
    )
    .option(
      '--replace-deprecated',
      'Replace deprecated pnpm settings with new ones and remove old keys',
    )
    .option(
      '--strategy <strategy>',
      'Strategy to handle conflicts (discard, merge, overwrite)',
    )
    .option(
      '--no-yarn-resolutions',
      'Disable migrating resolutions field in package.json',
    )
    .option(
      '--no-newline-between',
      'Disable adding newlines between each root keys',
    )
    .option('--no-show-changes', 'Disable showing settings changes')
    .option('--no-clean-npmrc', 'Disable removing pnpm settings in .npmrc file')
    .option(
      '--no-clean-package-json',
      'Disable removing pnpm fields in package.json',
    )

  cli.help(sections => {
    const hasOnlyDefaultCommands =
      cli.commands.length > 0 &&
      cli.commands.every(command => command.isDefaultCommand)

    if (!hasOnlyDefaultCommands) {
      return sections
    }

    return sections.filter(
      section =>
        section.title !== 'Commands' &&
        !section.title?.startsWith('For more info'),
    )
  })

  return cli
}
