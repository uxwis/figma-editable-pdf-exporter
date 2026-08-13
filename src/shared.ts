export type WarningSeverity = 'warning' | 'error'
export const EXPORT_CANCELLED = '__CANCELLED__'

export type ExportErrorCode =
  | 'PAGE_CHANGED'
  | 'FRAME_UNAVAILABLE'
  | 'NO_FRAMES'
  | 'SCAN_BLOCKED'
  | 'UNSUPPORTED_CONTENT'
  | 'FONT_UNAVAILABLE'
  | 'FONT_COVERAGE'
  | 'PDF_GENERATION'
  | 'SVG_PARSE'
  | 'EXPORT_FAILED'

export class UserFacingError extends Error {
  readonly code: ExportErrorCode

  constructor(code: ExportErrorCode, message: string) {
    super(message)
    this.name = 'UserFacingError'
    this.code = code
  }
}

export function toUserFacingError(
  error: unknown,
  fallbackMessage = '导出过程中遇到兼容性问题，请重新扫描后重试。',
): UserFacingError {
  if (error instanceof UserFacingError) return error
  return new UserFacingError('EXPORT_FAILED', fallbackMessage)
}

export interface ExportWarning {
  code: string
  severity: WarningSeverity
  message: string
  frameId?: string
  frameName?: string
  nodeKey?: string
}

export interface FrameSummary {
  id: string
  name: string
  pageNumber: number
  x: number
  y: number
  width: number
  height: number
  textCount: number
  hidden: boolean
}

export interface FontRequirement {
  key: string
  family: string
  style: string
  characters: string
  pages: number[]
  hasMissingFont: boolean
}

export interface ScanResult {
  pageId: string
  pageName: string
  frames: FrameSummary[]
  fonts: FontRequirement[]
  warnings: ExportWarning[]
}

export interface TextStyleSegmentMeta {
  start: number
  end: number
  characters: string
  fontKey: string
  fontSize: number
  fontWeight: number
  fontStyle: string
}

export interface TextNodeMeta {
  key: string
  nodeType: 'TEXT' | 'TEXT_PATH'
  characters: string
  segments: TextStyleSegmentMeta[]
  fallback: {
    x: number
    y: number
    width: number
    height: number
    rotation: number
  }
}

export interface PageExportAssets {
  frameId: string
  frameName: string
  pageNumber: number
  svg: string
  backgroundPdf: Uint8Array
  textNodes: TextNodeMeta[]
  warnings: ExportWarning[]
}

export interface ExportProgress {
  pageNumber: number
  totalPages: number
  frameName: string
  phase: 'preparing' | 'svg' | 'background' | 'done'
}

export type UiToPluginMessage =
  | { type: 'ready' }
  | { type: 'rescan' }
  | { type: 'scan'; requestId: number }
  | { type: 'export-page'; pageId: string; frameId: string; pageNumber: number; totalPages: number }
  | { type: 'cancel' }
  | { type: 'resize'; width: number; height: number }

export type PluginToUiMessage =
  | { type: 'scan-result'; result: ScanResult; requestId?: number }
  | { type: 'page-assets'; assets: PageExportAssets }
  | { type: 'progress'; progress: ExportProgress }
  | { type: 'cancelled' }
  | { type: 'error'; code: ExportErrorCode; message: string; requestId?: number }

export interface SortableFrame {
  x: number
  y: number
  name?: string
}

export function sortFrames<T extends SortableFrame>(frames: readonly T[]): T[] {
  return [...frames].sort((left, right) => {
    const byY = left.y - right.y
    if (Math.abs(byY) > 0.01) return byY
    const byX = left.x - right.x
    if (Math.abs(byX) > 0.01) return byX
    return (left.name ?? '').localeCompare(right.name ?? '')
  })
}

export function makeFontKey(family: string, style: string): string {
  return `${family.trim()}\u0000${style.trim()}`
}

export function splitFontKey(key: string): { family: string; style: string } {
  const separator = key.indexOf('\u0000')
  if (separator < 0) return { family: key, style: 'Regular' }
  return { family: key.slice(0, separator), style: key.slice(separator + 1) }
}

export function uniqueCharacters(value: string): string {
  return Array.from(new Set(Array.from(value))).join('')
}

export function sanitizeFileName(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  return cleaned || 'figma-page'
}
