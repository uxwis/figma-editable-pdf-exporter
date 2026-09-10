type SupportedTextNode = TextNode | TextPathNode

function simpleFill(paints: readonly Paint[] | PluginAPI['mixed']): boolean {
  if (paints === figma.mixed) return false
  const visible = paints.filter((paint) => paint.visible !== false && paint.opacity !== 0)
  return visible.length <= 1 && visible.every((paint) => paint.type === 'SOLID')
}

/** Return the reason to keep this text in Figma's native, outlined PDF layer. */
export function textOutlineReason(node: SupportedTextNode, root: FrameNode): string | null {
  if (node.type === 'TEXT_PATH') return '路径文字'
  if (node.hasMissingFont) return '缺失字体的文字'
  if (node.strokes.some((paint) => paint.visible !== false && paint.opacity !== 0)) return '描边文字'
  if (!simpleFill(node.fills)) return '渐变、图片或多重填充文字'
  if (node.textDecoration !== 'NONE') return '带装饰线的文字'
  if (node.textTruncation === 'ENDING') return '截断文字'

  let current: BaseNode | null = node
  while (current) {
    if ('isMask' in current && current.isMask) return '蒙版文字'
    if ('effects' in current && current.effects.some((effect) => effect.visible !== false)) {
      return '带阴影、模糊等效果的文字'
    }
    if ('blendMode' in current && current.blendMode !== 'NORMAL' && current.blendMode !== 'PASS_THROUGH') {
      return '带混合模式的文字'
    }
    if (current !== node && 'clipsContent' in current && current.clipsContent) {
      const bounds = node.absoluteBoundingBox
      const clip = current.absoluteBoundingBox
      if (bounds && clip && (
        bounds.x < clip.x || bounds.y < clip.y
        || bounds.x + bounds.width > clip.x + clip.width
        || bounds.y + bounds.height > clip.y + clip.height
      )) return '超出裁剪边界的文字'
    }
    if (current === root) break
    const parent: BaseNode | null = current.parent
    if (parent && 'children' in parent) {
      const index = parent.children.findIndex((child) => child === current)
      if (parent.children.slice(0, index).some((sibling) =>
        'isMask' in sibling && sibling.isMask && sibling.visible,
      )) return '被蒙版裁剪的文字'
    }
    current = parent
  }
  return null
}
