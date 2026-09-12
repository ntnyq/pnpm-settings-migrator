/**
 * Plain package names, optionally scoped, that need no pnpm selector rewriting.
 */
export const YARN_PACKAGE_SELECTOR_PATTERN =
  /^(?:@[a-z\d._~-]+\/)?[a-z\d._~-]+$/iu
