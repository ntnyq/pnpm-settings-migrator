import { access, readFile, writeFile } from 'node:fs/promises'
import type { PathLike } from 'node:fs'

/**
 * Check if a path exists
 * @param path - given path
 * @returns `true` if exists, false otherwise
 */
export async function fsExists(path: PathLike): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false)
}

/**
 * Read file content
 * @param path - file path
 * @returns content of given file
 */
export async function fsReadFile(path: PathLike): Promise<string> {
  return await readFile(path, 'utf-8')
}

/**
 * Write file
 * @param path - file path
 * @param content - file content
 */
export async function fsWriteFile(
  path: PathLike,
  content: string,
): Promise<void> {
  await writeFile(path, `${content.trimEnd()}\n`, 'utf-8')
}
