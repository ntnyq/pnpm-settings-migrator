import type { PathLike } from 'node:fs'
import { access, readFile, rm, writeFile } from 'node:fs/promises'

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
  await writeFile(path, `${content.trimEnd()}\n`, 'utf-8')
}
