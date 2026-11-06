/**
 * Architecture spellings accepted by pnpm's platform list before 12.18.
 */
export const LEGACY_PLATFORM_CPU_PATTERN =
  /^(?:x64|x86_64|amd64|arm64|aarch64|ia32|i686|x86|arm|armv7l|armv7|ppc64le|powerpc64le|ppc64be|powerpc64|ppc64|s390x|riscv64|riscv64gc)$/u

/**
 * Node.js system names accepted by pnpm 12.18's platform list.
 */
export const NODE_PLATFORM_OS_PATTERN =
  /^(?:aix|android|darwin|freebsd|linux|netbsd|openbsd|openharmony|sunos|win32)$/u

/**
 * Additional Node.js machine architectures accepted from pnpm 12.18.
 */
export const ADDITIONAL_PLATFORM_CPU_PATTERN = /^(?:loong64|mips64el)$/u

/**
 * Largest decimal floor or ABI component accepted by pnpm's u32 tag parser.
 */
export const MAX_PLATFORM_TAG_NUMBER = 4_294_967_295

/**
 * Optional floor tokens following the CPU in each supported platform tag.
 */
export const PLATFORM_FLOOR_PATTERNS: Readonly<Record<string, string>> = {
  linux: '(?:musl|manylinux_\\d+_\\d+)',
  darwin: 'macos_\\d+_\\d+',
  win32: 'windows_\\d+_\\d+',
}
