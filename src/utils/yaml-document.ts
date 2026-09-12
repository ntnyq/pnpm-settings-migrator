import { isDeepStrictEqual } from 'node:util'
import type { Alias, Node, Document } from 'yaml'
import { isMap, isScalar, isNode, isSeq, visit } from 'yaml'
import type { UpdateYamlDocumentOptions } from '../types'

/**
 * Sort every mapping in a YAML node without replacing its comments or anchors.
 *
 * @param node - YAML node whose nested mappings should be sorted
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
 *
 * @param document - Parsed YAML document to update in place
 * @param options - Before/after settings and sorting preference
 *
 * @returns Nothing; the document is updated in place
 */
export function updateYamlDocument(
  document: Document,
  options: UpdateYamlDocumentOptions,
): void {
  const { after, before, sortKeys } = options
  const replacedNodes = new Set<Node>()
  for (const key of Object.keys(before)) {
    if (
      !Object.hasOwn(after, key) ||
      !isDeepStrictEqual(Reflect.get(before, key), Reflect.get(after, key))
    ) {
      const node = document.get(key, true)
      if (isNode(node)) {
        visit(node, {
          Node: (_, child) => {
            replacedNodes.add(child)
          },
        })
      }
    }
  }
  const aliasTargets = new Map<Alias, ReturnType<Alias['resolve']>>()
  const aliasValues = new Map<Alias, Node>()
  visit(document, {
    Alias: (_, node) => {
      aliasTargets.set(node, node.resolve(document))
      const value = document.createNode(node.toJS(document), {
        aliasDuplicateObjects: false,
      })
      value.comment = node.comment
      value.commentBefore = node.commentBefore
      value.spaceBefore = node.spaceBefore
      aliasValues.set(node, value)
    },
  })

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

  // Keep valid aliases, but materialize the original value if their target was
  // replaced, removed, or moved after them. Reusing a changed anchor would also
  // silently change settings in otherwise untouched roots.
  visit(document, {
    Alias: (_, node) => {
      const target = aliasTargets.get(node)
      if (
        node.resolve(document) !== target ||
        (target && replacedNodes.has(target))
      ) {
        const value = aliasValues.get(node)
        if (value && sortKeys) {
          sortYamlMappings(value)
        }
        return value
      }
    },
  })
}

/**
 * Normalize blank lines immediately before root mapping keys.
 *
 * @param content - Serialized workspace YAML
 * @param newlineBetween - Whether root keys should be separated by blank lines
 *
 * @returns YAML with normalized root-key spacing
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
