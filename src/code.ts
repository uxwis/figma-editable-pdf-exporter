import {
  EXPORT_CANCELLED,
  UserFacingError,
  makeFontKey,
  sortFrames,
  toUserFacingError,
  uniqueCharacters,
  type ExportWarning,
  type FontRequirement,
  type FrameSummary,
  type PageExportAssets,
  type PluginToUiMessage,
  type ScanResult,
  type TextNodeMeta,
  type TextStyleSegmentMeta,
  type UiToPluginMessage,
} from './shared'
import { textOutlineReason } from './text-compatibility'

figma.showUI(__html__, { width: 420, height: 180, themeColors: true })

let cancelled = false
const temporaryNodes = new Set<SceneNode>()
let nextTextAnalysisId = 1
const pendingTextAnalyses = new Map<number, {
  resolve(keys: string[]): void
  reject(error: Error): void
}>()

type SupportedTextNode = TextNode | TextPathNode

function post(message: PluginToUiMessage): void {
  figma.ui.postMessage(message)
}

function isTextNode(node: SceneNode): node is SupportedTextNode {
  return node.type === 'TEXT' || node.type === 'TEXT_PATH'
}

function isEffectivelyVisible(node: SceneNode, root: FrameNode): boolean {
  let current: BaseNode | null = node
  while (current && current !== root) {
    if ('visible' in current && !current.visible) return false
    current = current.parent
  }
  return true
}

function sortedTopLevelFrames(page: PageNode): FrameNode[] {
  return sortFrames(
    page.children.filter((node): node is FrameNode => node.type === 'FRAME'),
  )
}

function collectNodeWarnings(
  node: SupportedTextNode,
  frame: FrameNode,
  pageNumber: number,
): ExportWarning[] {
  const prefix = `第 ${pageNumber} 页「${frame.name}」`
  const reason = textOutlineReason(node, frame)
  return reason ? [{
    frameId: frame.id,
    frameName: frame.name,
    code: 'TEXT_OUTLINED_STYLE',
    severity: 'warning',
    message: `${prefix}包含${reason}；将自动转曲保留外观，该部分不再作为可编辑文字。`,
  }] : []
}

function fontStyleName(fontName: FontName): string {
  return fontName.style || 'Regular'
}

function getTextSegments(node: SupportedTextNode): TextStyleSegmentMeta[] {
  return node
    .getStyledTextSegments(['fontName', 'fontSize', 'fontWeight', 'fontStyle'])
    .map((segment) => ({
      start: segment.start,
      end: segment.end,
      characters: segment.characters,
      fontKey: makeFontKey(segment.fontName.family, fontStyleName(segment.fontName)),
      fontSize: segment.fontSize,
      fontWeight: segment.fontWeight,
      fontStyle: segment.fontStyle,
    }))
}

function createTextNodeMeta(node: SupportedTextNode, key: string, frame: FrameNode): TextNodeMeta {
  const bounds = node.absoluteBoundingBox
  const rootBounds = frame.absoluteBoundingBox
  return {
    key,
    nodeType: node.type,
    characters: node.characters,
    segments: getTextSegments(node),
    fallback: {
      x: bounds && rootBounds ? bounds.x - rootBounds.x : 0,
      y: bounds && rootBounds ? bounds.y - rootBounds.y : 0,
      width: bounds?.width ?? node.width,
      height: bounds?.height ?? node.height,
      rotation: node.rotation,
    },
  }
}

function buildScanResult(page: PageNode): ScanResult {
  const frames = sortedTopLevelFrames(page)
  const fontMap = new Map<
    string,
    { family: string; style: string; characters: string; pages: Set<number>; hasMissingFont: boolean }
  >()
  const warnings: ExportWarning[] = []

  const summaries: FrameSummary[] = frames.map((frame, frameIndex) => {
    const pageNumber = frameIndex + 1
    const textNodes = frame
      .findAll((node) => isTextNode(node) && isEffectivelyVisible(node, frame))
      .filter(isTextNode)

    for (const textNode of textNodes) {
      warnings.push(...collectNodeWarnings(textNode, frame, pageNumber))
      if (textOutlineReason(textNode, frame)) continue
      for (const segment of getTextSegments(textNode)) {
        const family = segment.fontKey.split('\u0000')[0]
        const style = segment.fontKey.split('\u0000')[1] || 'Regular'
        const current = fontMap.get(segment.fontKey) ?? {
          family,
          style,
          characters: '',
          pages: new Set<number>(),
          hasMissingFont: false,
        }
        current.characters = uniqueCharacters(current.characters + segment.characters)
        current.pages.add(pageNumber)
        current.hasMissingFont ||= textNode.hasMissingFont
        fontMap.set(segment.fontKey, current)
      }
    }

    return {
      id: frame.id,
      name: frame.name,
      pageNumber,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      textCount: textNodes.length,
      hidden: !frame.visible,
    }
  })

  const fonts: FontRequirement[] = Array.from(fontMap, ([key, value]) => ({
    key,
    family: value.family,
    style: value.style,
    characters: value.characters,
    pages: Array.from(value.pages).sort((a, b) => a - b),
    hasMissingFont: value.hasMissingFont,
  })).sort((left, right) => `${left.family} ${left.style}`.localeCompare(`${right.family} ${right.style}`))

  return {
    pageId: page.id,
    pageName: page.name,
    frames: summaries,
    fonts,
    warnings: dedupeWarnings(warnings),
  }
}

function dedupeWarnings(warnings: ExportWarning[]): ExportWarning[] {
  const seen = new Set<string>()
  return warnings.filter((warning) => {
    const key = `${warning.code}\u0000${warning.frameId ?? ''}\u0000${warning.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function detachInstances(root: FrameNode): void {
  let guard = 0
  while (guard < 10_000) {
    const instance = root.findOne((node) => node.type === 'INSTANCE') as InstanceNode | null
    if (!instance) return
    instance.detachInstance()
    guard += 1
  }
  throw new UserFacingError('UNSUPPORTED_CONTENT', '画板中的实例层级过深，暂时无法安全导出。')
}

function removeTemporaryNode(node: SceneNode | null): void {
  if (!node) return
  temporaryNodes.delete(node)
  try {
    if (!node.removed) node.remove()
  } catch {
    // The node may already have been removed by Figma while closing the plugin.
  }
}

function removeAllTemporaryNodes(): void {
  for (const node of temporaryNodes) removeTemporaryNode(node)
  temporaryNodes.clear()
}

function cancelTextAnalyses(): void {
  for (const pending of pendingTextAnalyses.values()) pending.reject(new Error(EXPORT_CANCELLED))
}

function requestEditableTextKeys(svg: string, textNodes: TextNodeMeta[]): Promise<Set<string>> {
  if (textNodes.length === 0) return Promise.resolve(new Set())
  return new Promise((resolve, reject) => {
    const requestId = nextTextAnalysisId++
    const finish = () => {
      clearTimeout(timeout)
      pendingTextAnalyses.delete(requestId)
    }
    // If analysis cannot complete, preserve native text instead of hiding it.
    const timeout = setTimeout(() => {
      finish()
      resolve(new Set())
    }, 30_000)
    pendingTextAnalyses.set(requestId, {
      resolve: (keys) => { finish(); resolve(new Set(keys)) },
      reject: (error) => { finish(); reject(error) },
    })
    post({ type: 'analyze-text', requestId, svg, textNodes })
  })
}

async function exportFrameAssets(
  frame: FrameNode,
  pageNumber: number,
  totalPages: number,
): Promise<PageExportAssets> {
  let clone: FrameNode | null = null
  try {
    post({
      type: 'progress',
      progress: { pageNumber, totalPages, frameName: frame.name, phase: 'preparing' },
    })
    clone = frame.clone()
    temporaryNodes.add(clone)
    clone.visible = true
    clone.x = frame.x + frame.width + 10_000
    detachInstances(clone)

    const textNodes = clone
      .findAll((node) => isTextNode(node) && isEffectivelyVisible(node, clone!))
      .filter(isTextNode)
    const textMeta: TextNodeMeta[] = []
    const candidates = new Map<string, { node: SupportedTextNode; originalName: string }>()
    const warnings: ExportWarning[] = []

    textNodes.forEach((textNode, index) => {
      const reason = textOutlineReason(textNode, clone!)
      if (reason) {
        warnings.push({
          frameId: frame.id,
          frameName: frame.name,
          code: 'TEXT_OUTLINED_STYLE',
          severity: 'warning',
          message: `第 ${pageNumber} 页「${frame.name}」包含${reason}；将自动转曲保留外观，该部分不再作为可编辑文字。`,
        })
        return
      }
      const key = `epdf_p${pageNumber}_t${index}`
      candidates.set(key, { node: textNode, originalName: textNode.name })
      textNode.name = key
      textMeta.push(createTextNodeMeta(textNode, key, clone!))
    })

    if (cancelled) throw new Error(EXPORT_CANCELLED)
    post({
      type: 'progress',
      progress: { pageNumber, totalPages, frameName: frame.name, phase: 'svg' },
    })
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.width} ${frame.height}"/>`
    if (textMeta.length > 0) {
      try {
        svg = await clone.exportAsync({
          format: 'SVG_STRING',
          svgOutlineText: false,
          svgIdAttribute: true,
          svgSimplifyStroke: false,
          useAbsoluteBounds: true,
          contentsOnly: true,
          colorProfile: 'SRGB',
        })
      } catch (error) {
        // The native PDF can still preserve all text if SVG export fails.
        console.warn('[Editable PDF Exporter] Falling back to native text', error)
      }
    }

    if (cancelled) throw new Error(EXPORT_CANCELLED)
    const editableKeys = await requestEditableTextKeys(svg, textMeta)
    if (cancelled) throw new Error(EXPORT_CANCELLED)
    // Only remove text that the UI can reconstruct. Everything else stays in
    // Figma's native PDF as outlines, preserving strokes, masks and effects.
    // Opacity keeps Auto Layout geometry intact; hiding nodes would reflow it.
    for (const [key, { node, originalName }] of candidates) {
      if (editableKeys.has(key)) {
        node.opacity = 0
      } else {
        warnings.push({
          frameId: frame.id,
          frameName: frame.name,
          nodeKey: key,
          code: 'TEXT_OUTLINED_SVG',
          severity: 'warning',
          message: `第 ${pageNumber} 页「${frame.name}」的文字层「${originalName}」无法可靠重建，已自动转曲保留外观。`,
        })
      }
    }
    post({
      type: 'progress',
      progress: { pageNumber, totalPages, frameName: frame.name, phase: 'background' },
    })
    const backgroundPdf = await clone.exportAsync({
      format: 'PDF',
      useAbsoluteBounds: true,
      contentsOnly: true,
      colorProfile: 'SRGB',
    })

    if (cancelled) throw new Error(EXPORT_CANCELLED)
    post({
      type: 'progress',
      progress: { pageNumber, totalPages, frameName: frame.name, phase: 'done' },
    })
    return {
      frameId: frame.id,
      frameName: frame.name,
      pageNumber,
      svg,
      backgroundPdf,
      textNodes: textMeta.filter((meta) => editableKeys.has(meta.key)),
      warnings: dedupeWarnings(warnings),
    }
  } finally {
    removeTemporaryNode(clone)
  }
}

async function publishCurrentScan(requestId?: number, resetCancellation = true): Promise<void> {
  if (resetCancellation) cancelled = false
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const page = figma.currentPage
    await page.loadAsync()
    if (page.id !== figma.currentPage.id) continue
    post({ type: 'scan-result', result: buildScanResult(page), requestId })
    return
  }
  throw new UserFacingError('PAGE_CHANGED', '页面切换过于频繁，请停留在需要导出的页面后重试。')
}

function postUserError(error: unknown, requestId?: number): void {
  if (error instanceof Error && error.message === EXPORT_CANCELLED) {
    post({ type: 'cancelled' })
    return
  }
  console.error('[Editable PDF Exporter]', error)
  const safe = toUserFacingError(error, 'Figma 页面导出失败，请重新扫描后重试。')
  post({ type: 'error', code: safe.code, message: safe.message, requestId })
}

async function handleMessage(message: UiToPluginMessage): Promise<void> {
  if (message.type === 'text-analysis') {
    pendingTextAnalyses.get(message.requestId)?.resolve(message.editableTextKeys)
    return
  }
  if (message.type === 'resize') {
    figma.ui.resize(
      Math.max(380, Math.min(500, message.width)),
      Math.max(180, Math.min(600, message.height)),
    )
    return
  }
  if (message.type === 'cancel') {
    cancelled = true
    cancelTextAnalyses()
    return
  }
  if (message.type === 'ready' || message.type === 'rescan') {
    await publishCurrentScan()
    return
  }
  if (message.type === 'scan') {
    await publishCurrentScan(message.requestId)
    return
  }
  if (message.type === 'export-page') {
    if (cancelled) throw new Error(EXPORT_CANCELLED)
    if (figma.currentPage.id !== message.pageId) {
      throw new UserFacingError('PAGE_CHANGED', '导出期间页面发生切换，请返回目标页面后重新导出。')
    }
    const frame = figma.currentPage.findOne(
      (node) => node.id === message.frameId && node.parent === figma.currentPage && node.type === 'FRAME',
    ) as FrameNode | null
    if (!frame) throw new UserFacingError('FRAME_UNAVAILABLE', '目标画板已被删除或移动，请重新扫描。')
    const assets = await exportFrameAssets(frame, message.pageNumber, message.totalPages)
    post({ type: 'page-assets', assets })
  }
}

figma.ui.onmessage = (message: UiToPluginMessage) => {
  void handleMessage(message).catch((error: unknown) => {
    postUserError(error, message.type === 'scan' ? message.requestId : undefined)
  })
}

figma.on('currentpagechange', () => {
  cancelled = true
  cancelTextAnalyses()
  void publishCurrentScan(undefined, false).catch((error: unknown) => postUserError(error))
})

figma.on('close', () => {
  cancelled = true
  cancelTextAnalyses()
  removeAllTemporaryNodes()
})
