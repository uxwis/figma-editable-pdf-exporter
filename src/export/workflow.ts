import { EXPORT_CANCELLED, type ExportWarning, type PageExportAssets, type ScanResult } from '../shared'
import type { FontMapping } from './font'
import { generateEditablePdf } from './pdf'
import { resolveFonts } from './resolve-fonts'

export interface EditablePdfArtifact {
  pdfBytes: Uint8Array
  mappings: Map<string, FontMapping>
  warnings: ExportWarning[]
}

interface WorkflowOptions {
  scan: ScanResult
  requestPage(frameId: string, pageNumber: number, totalPages: number): Promise<PageExportAssets>
  isCancelled(): boolean
  setStatus(status: string): void
}

function dedupeWarnings(warnings: readonly ExportWarning[]): ExportWarning[] {
  const seen = new Set<string>()
  return warnings.filter((warning) => {
    const key = `${warning.code}\u0000${warning.frameId ?? ''}\u0000${warning.nodeKey ?? ''}\u0000${warning.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function createEditablePdfArtifact(
  options: WorkflowOptions,
): Promise<EditablePdfArtifact> {
  const { scan, requestPage, isCancelled, setStatus } = options
  if (isCancelled()) throw new Error(EXPORT_CANCELLED)
  setStatus('正在自动准备可编辑文字…')
  const fonts = await resolveFonts(scan.fonts)

  const pages: PageExportAssets[] = []
  for (const frame of scan.frames) {
    if (isCancelled()) throw new Error(EXPORT_CANCELLED)
    pages.push(await requestPage(frame.id, frame.pageNumber, scan.frames.length))
  }
  if (isCancelled()) throw new Error(EXPORT_CANCELLED)

  setStatus('正在写入可编辑文字并合并 PDF…')
  const pdf = await generateEditablePdf(pages, fonts.mappings)
  return {
    pdfBytes: pdf.bytes,
    mappings: fonts.mappings,
    warnings: dedupeWarnings([...scan.warnings, ...fonts.warnings, ...pdf.warnings]),
  }
}
