import type { Alias, Node, Document } from 'yaml'
import { isAlias, isMap, isScalar, isNode, isSeq, visit } from 'yaml'
import type { UpdateYamlDocumentOptions } from '../types'
import { hasOrderedSelectors, isSameSetting } from './setting-value'

/**
 * Identify a YAML merge directive, including the distinction from a quoted key.
 *
 * @param key - Mapping key from the parsed YAML document
 *
 * @returns Whether the key inherits entries from another mapping
 */
function isMergeKey(key: unknown): boolean {
  return (
    isScalar(key) &&
    typeof key.value === 'symbol' &&
    key.value.description === '<<'
  )
}

/**
 * Locate order-sensitive overrides, including anchors shared with other
 * settings and copies used to repair aliases after sorting.
 *
 * @param document - YAML document before keys are reordered
 * @param aliases - Materialized values of aliases in the original document
 *
 * @returns Mapping nodes that must retain their selector order
 */
function findOrderedOverrides(
  document: Document,
  aliases: Map<Alias, Node>,
): Set<Node> {
  const ordered = new Set<Node>()
  const protect = (node: unknown): void => {
    if (!isNode(node) || ordered.has(node)) {
      return
    }
    if (isAlias(node)) {
      ordered.add(node)
      protect(node.resolve(document))
      protect(aliases.get(node))
    } else if (isSeq(node)) {
      ordered.add(node)
      node.items.forEach(protect)
    } else if (isMap(node)) {
      const merges = node.items.filter(pair => isMergeKey(pair.key))
      const keys = node.items.map(item =>
        String(isScalar(item.key) ? item.key.value : item.key),
      )
      if (merges.length || hasOrderedSelectors(keys)) {
        ordered.add(node)
        merges.forEach(pair => protect(pair.value))
      }
    }
  }
  for (const root of [document, ...aliases.values()]) {
    visit(root, {
      Pair(_, pair) {
        if ((isScalar(pair.key) ? pair.key.value : pair.key) === 'overrides') {
          protect(pair.value)
        }
      },
    })
  }
  return ordered
}

/**
 * Sort YAML mappings while preserving override precedence, comments and anchors.
 *
 * @param node - YAML node whose nested mappings should be sorted
 * @param ordered - Override maps whose selector order is significant
 */
function sortYamlMappings(node: Node | null, ordered: ReadonlySet<Node>): void {
  if (isMap(node)) {
    if (ordered.has(node)) {
      return
    }
    node.items.sort((left, right) => {
      const leftKey = String(isScalar(left.key) ? left.key.value : left.key)
      const rightKey = String(isScalar(right.key) ? right.key.value : right.key)

      return leftKey.localeCompare(rightKey)
    })

    for (const pair of node.items) {
      if (isNode(pair.value)) {
        sortYamlMappings(pair.value, ordered)
      }
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      if (isNode(item)) {
        sortYamlMappings(item, ordered)
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
      !isSameSetting(key, Reflect.get(before, key), Reflect.get(after, key))
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

  // Removing an inherited root key requires expanding the merge; deleting a
  // direct key alone would leave the original value effective on the next run.
  if (
    isMap(document.contents) &&
    Object.keys(before).some(
      key => !Object.hasOwn(after, key) && !document.has(key),
    )
  ) {
    const merges = document.contents.items.filter(pair => isMergeKey(pair.key))
    for (const pair of merges) {
      if (isNode(pair.key) && pair.key.commentBefore) {
        document.commentBefore = [
          document.commentBefore,
          pair.key.commentBefore,
        ]
          .filter(Boolean)
          .join('\n')
      }
      if (isNode(pair.value)) {
        visit(pair.value, {
          Node: (_, child) => {
            replacedNodes.add(child)
          },
        })
      }
    }
    document.contents.items = document.contents.items.filter(
      pair => !merges.includes(pair),
    )
    for (const [key, value] of Object.entries(before)) {
      if (!document.has(key)) {
        document.set(key, value)
      }
    }
  }

  for (const key of Object.keys(before)) {
    if (!Object.hasOwn(after, key)) {
      document.delete(key)
    }
  }

  for (const [key, value] of Object.entries(after)) {
    if (
      !Object.hasOwn(before, key) ||
      !isSameSetting(key, Reflect.get(before, key), value)
    ) {
      document.set(key, value)
    }
  }

  const ordered = sortKeys
    ? findOrderedOverrides(document, aliasValues)
    : undefined
  if (ordered) {
    sortYamlMappings(document.contents, ordered)
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
        if (value && ordered) {
          sortYamlMappings(value, ordered)
        }
        return value
      }
    },
  })
}

/**
 * Set root-key spacing without changing whitespace inside scalar values.
 *
 * @param document - Workspace YAML document to update in place
 * @param newlineBetween - Whether root keys should be separated by blank lines
 *
 * @returns Nothing; root key metadata is updated before serialization
 */
export function formatRootSpacing(
  document: Document,
  newlineBetween: boolean,
): void {
  if (!isMap(document.contents)) {
    return
  }
  for (const [index, pair] of document.contents.items.entries()) {
    if (index > 0) {
      const key = isNode(pair.key) ? pair.key : document.createNode(pair.key)
      key.spaceBefore = newlineBetween
      pair.key = key
    }
  }
}
