import { isDeepStrictEqual } from 'node:util'
import { isMap, isNode, isScalar, isSeq } from 'yaml'
import type { Document, Node } from 'yaml'
import type { PnpmWorkspace } from '../types'

/**
 * Inputs used to apply semantic workspace changes to a YAML document.
 */
export interface UpdateYamlDocumentOptions {
  after: PnpmWorkspace
  before: PnpmWorkspace
  sortKeys: boolean
}

/**
 * Sort every mapping in a YAML node without replacing its comments or anchors.
 */
function sortYamlMappings(node: Node | null): void {
  if (isMap(node)) {
    node.items.sort((left, right) => {
      const leftKey = isScalar(left.key) ? String(left.key.value) : ''
      const rightKey = isScalar(right.key) ? String(right.key.value) : ''

      return leftKey.localeCompare(rightKey)
    })

    for (const pair of node.items) {
      if (isNode(pair.value)) {
        sortYamlMappings(pair.value)
      }
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      if (isNode(item)) {
        sortYamlMappings(item)
      }
    }
  }
}

/**
 * Apply semantic root changes to the parsed document while retaining untouched
 * YAML nodes and their source metadata.
 */
export function updateYamlDocument(
  document: Document,
  options: UpdateYamlDocumentOptions,
): void {
  const { after, before, sortKeys } = options

  for (const key of Object.keys(before)) {
    if (!Object.hasOwn(after, key)) {
      document.delete(key)
    }
  }

  for (const [key, value] of Object.entries(after)) {
    if (
      !Object.hasOwn(before, key) ||
      !isDeepStrictEqual(Reflect.get(before, key), value)
    ) {
      document.set(key, value)
    }
  }

  if (sortKeys) {
    sortYamlMappings(document.contents)
  }
}

/**
 * Normalize blank lines immediately before root mapping keys.
 */
export function formatRootSpacing(
  content: string,
  newlineBetween: boolean,
): string {
  return content.replace(
    /\n+(?=[^\s#][^:\n]*:)/gu,
    newlineBetween ? '\n\n' : '\n',
  )
}
