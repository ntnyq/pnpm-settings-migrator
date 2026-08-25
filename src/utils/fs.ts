import { randomUUID } from 'node:crypto'
import type { PathLike } from 'node:fs'
import {
  access,
  chmod,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { basename, dirname, join } from 'pathe'

/**
 * Modulus that isolates Unix permission bits from a stat mode.
 */
const FILE_PERMISSION_MODULUS = 0o1000

/**
 * Resolve a filesystem path to a string suitable for a sibling temp file.
 */
function resolvePathString(path: PathLike): string {
  if (path instanceof URL) {
    return fileURLToPath(path)
  }

  return typeof path === 'string' ? path : path.toString()
}

/**
 * Read an existing file's permission bits, if the file exists.
 */
async function resolveExistingMode(
  path: PathLike,
): Promise<number | undefined> {
  try {
    return (await stat(path)).mode % FILE_PERMISSION_MODULUS
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }

    throw error
  }
}

/**
 * Check whether a filesystem path exists.
 *
 * @param path - Filesystem path to check
 *
 * @returns `true` when the path is accessible, otherwise `false`
 */
export async function fsExists(path: PathLike): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false)
}

/**
 * Read a UTF-8 text file.
 *
 * @param path - Filesystem path to read
 *
 * @returns Text content of the file
 */
export async function fsReadFile(path: PathLike): Promise<string> {
  return await readFile(path, 'utf-8')
}

/**
 * Remove a file if it exists.
 *
 * @param path - Filesystem path to remove
 *
 * @returns A promise that resolves after the file is removed
 */
export async function fsRemoveFile(path: PathLike): Promise<void> {
  await rm(path, { force: true })
}

/**
 * Write a normalized UTF-8 text file with one trailing newline.
 *
 * @param path - Filesystem path to write
 * @param content - Text content to write
 *
 * @returns A promise that resolves after the file is written
 */
export async function fsWriteFile(
  path: PathLike,
  content: string,
): Promise<void> {
  const pathString = resolvePathString(path)
  const temporaryPath = join(
    dirname(pathString),
    `.${basename(pathString)}.${process.pid}.${randomUUID()}.tmp`,
  )
  const mode = await resolveExistingMode(path)

  try {
    await writeFile(temporaryPath, `${content.trimEnd()}\n`, {
      encoding: 'utf-8',
      mode,
    })
    if (mode !== undefined) {
      await chmod(temporaryPath, mode)
    }
    await rename(temporaryPath, pathString)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}
