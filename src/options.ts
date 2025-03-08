import process from 'node:process'

export interface Options {
  /**
   * Whether to remove pnpm settings in `.npmrc` file
   *
   * @default true
   */
  cleanNpmrc?: boolean

  /**
   * Whether to remove `pnpm` field in `package.json`
   *
   * @default true
   */
  cleanPackageJson?: boolean

  /**
   * Current working directory
   *
   * @default process.cwd()
   */
  cwd?: string

  /**
   * Sort keys when write `pnpm-workspace.yaml`
   *
   * @default false
   */
  sortKeys?: boolean

  /**
   * Strategy to handle conflicts
   */
  strategy?: 'discard' | 'merge' | 'overwrite'

  /**
   * Whether to migrate `resolutions` filed in `package.json`
   *
   * @default true
   */
  yarnResolutions?: boolean
}

export function resolveOptions(options: Options = {}): Required<Options> {
  return {
    cleanNpmrc: options.cleanNpmrc ?? true,
    cleanPackageJson: options.cleanPackageJson ?? true,
    cwd: options.cwd ?? process.cwd(),
    sortKeys: options.sortKeys ?? false,
    strategy: options.strategy ?? 'merge',
    yarnResolutions: options.yarnResolutions ?? true,
  }
}
