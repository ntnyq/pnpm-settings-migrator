/**
 * Authentication and registry keys that must remain in `.npmrc`.
 */
export const NPMRC_AUTH_OR_REGISTRY_KEYS: string[] = [
  '_auth',
  '_authtoken',
  '_password',
  'always-auth',
  'ca',
  'cafile',
  'cert',
  'certfile',
  'email',
  'key',
  'keyfile',
  'otp',
  'tokenhelper',
  'username',
]

/**
 * Pattern for pnpm's channel-specific Node.js mirror keys.
 */
export const NODE_MIRROR_KEY_PATTERN = /^node-mirror:(?<channel>.+)$/iu
