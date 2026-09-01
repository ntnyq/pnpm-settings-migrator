import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { relative, resolve } from 'pathe'
import { glob } from 'tinyglobby'

const EXPORTED_ARROW_FUNCTION_PATTERN =
  /^[\t ]*export\s+const\s+(?<name>[$\w]+)[^=]*=\s*(?:async\s*)?(?:\([^)]*\)|[$\w]+)\s*=>/gmu
const EXPORTED_FUNCTION_PATTERN =
  /^[\t ]*export\s+(?:default\s+)?(?:async\s+)?function\s+(?<name>[$\w]+)/gmu
const JSDOC_OPEN = '/**'
const SINGLE_LINE_BLOCK_COMMENT_PATTERN = /\/\*[^\r\n]*\*\//gu
const SOURCE_PATTERN = '**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}'
const cwd = resolve(import.meta.dirname, '..')

function getLineNumber(source, position) {
  return source.slice(0, position).split('\n').length
}

function isCodePosition(source, position) {
  const lineStart = source.lastIndexOf('\n', position - 1) + 1
  const prefix = source.slice(lineStart, position)
  let quote = undefined
  for (let index = 0; index < prefix.length; index++) {
    const character = prefix[index]
    if (quote) {
      if (character === '\\') {
        index++
      } else if (character === quote) {
        quote = undefined
      }
    } else if (character === "'" || character === '"' || character === '`') {
      quote = character
    } else if (character === '/' && prefix[index + 1] === '/') {
      return false
    }
  }

  return quote === undefined
}

function hasLeadingJSDoc(source, position) {
  const prefix = source.slice(0, position)
  const commentEnd = prefix.lastIndexOf('*/')
  const commentStart = prefix.lastIndexOf(JSDOC_OPEN, commentEnd)
  if (
    commentStart < 0 ||
    commentEnd < commentStart ||
    prefix.slice(commentEnd + 2).trim() ||
    prefix.slice(commentStart + JSDOC_OPEN.length, commentEnd).includes('*/')
  ) {
    return false
  }

  return prefix.slice(commentStart, commentEnd + 2).includes('\n')
}

function checkSourceFile(path, source) {
  const errors = []
  for (const match of source.matchAll(SINGLE_LINE_BLOCK_COMMENT_PATTERN)) {
    if (match.index !== undefined && isCodePosition(source, match.index)) {
      errors.push({
        line: getLineNumber(source, match.index),
        message: 'Single-line block comments are forbidden',
      })
    }
  }

  for (const pattern of [
    EXPORTED_FUNCTION_PATTERN,
    EXPORTED_ARROW_FUNCTION_PATTERN,
  ]) {
    for (const match of source.matchAll(pattern)) {
      if (match.index !== undefined && !hasLeadingJSDoc(source, match.index)) {
        errors.push({
          line: getLineNumber(source, match.index),
          message: `Exported function ${match.groups?.name ?? 'default'} requires JSDoc`,
        })
      }
    }
  }

  return errors.map(
    error => `${relative(cwd, path)}:${error.line} ${error.message}`,
  )
}

const paths = await glob(SOURCE_PATTERN, {
  absolute: true,
  cwd,
  ignore: ['**/dist/**', '**/node_modules/**'],
  onlyFiles: true,
})
const errors = (
  await Promise.all(
    paths.map(async path => {
      const source = await readFile(path, 'utf8')

      return checkSourceFile(path, source)
    }),
  )
).flat()

if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Checked comments in ${paths.length} files\n`)
}
