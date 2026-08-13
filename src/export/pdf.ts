import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSpacing,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  type PDFHexString,
  type PDFFont,
  type PDFName,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib'
import { UserFacingError, type ExportWarning, type PageExportAssets } from '../shared'
import type { FontMapping } from './font'
import { applyMatrix } from './matrix'
import { parseSvgText, type RgbColor, type SvgTextRun } from './svg-text'
import { createReferencedPdfFont } from './system-font'

export interface PdfGenerationResult {
  bytes: Uint8Array
  warnings: ExportWarning[]
}

function alpha(color: RgbColor | null, opacity: number): number | undefined {
  return color ? Math.max(0, Math.min(1, color.a * opacity)) : undefined
}

function renderingMode(run: SvgTextRun): TextRenderingMode | null {
  if (run.fill && run.stroke && run.strokeWidth > 0) return TextRenderingMode.FillAndOutline
  if (run.stroke && run.strokeWidth > 0) return TextRenderingMode.Outline
  if (run.fill) return TextRenderingMode.Fill
  return null
}

function addOpacityState(
  page: PDFPage,
  fillOpacity: number | undefined,
  strokeOpacity: number | undefined,
): PDFName | undefined {
  if (fillOpacity === undefined && strokeOpacity === undefined) return undefined
  const state = page.doc.context.obj({
    Type: 'ExtGState',
    ca: fillOpacity,
    CA: strokeOpacity,
  })
  return page.node.newExtGState('GS', state)
}

interface PdfTextFont {
  ref: PDFRef
  encodeText(text: string): PDFHexString
  widthOfTextAtSize(text: string, size: number): number
}

function localTextWidth(run: SvgTextRun, font: PdfTextFont): number {
  const glyphCount = Array.from(run.text).length
  return font.widthOfTextAtSize(run.text, run.fontSize) + Math.max(0, glyphCount - 1) * run.letterSpacing
}

function drawRun(
  page: PDFPage,
  run: SvgTextRun,
  font: PdfTextFont,
  fontResource: PDFName,
  viewBox: { x: number; y: number; width: number; height: number },
  cursor: { x: number; y: number },
): { x: number; y: number } {
  const mode = renderingMode(run)
  if (mode === null || !run.text) return cursor
  const pageWidth = page.getWidth()
  const pageHeight = page.getHeight()
  const scaleX = pageWidth / viewBox.width
  const scaleY = pageHeight / viewBox.height
  const textWidth = localTextWidth(run, font)
  let x = (run.x ?? cursor.x) + run.dx
  const y = (run.y ?? cursor.y) + run.dy
  if (run.textAnchor === 'middle') x -= textWidth / 2
  if (run.textAnchor === 'end') x -= textWidth

  const point = applyMatrix(run.transform, x, y)
  const matrix = run.transform
  const pdfA = scaleX * matrix.a
  const pdfB = -scaleY * matrix.b
  const pdfC = -scaleX * matrix.c
  const pdfD = scaleY * matrix.d
  const pdfE = scaleX * (point.x - viewBox.x)
  const pdfF = pageHeight - scaleY * (point.y - viewBox.y)
  const fillOpacity = alpha(run.fill, run.opacity)
  const strokeOpacity = alpha(run.stroke, run.opacity)
  const graphicsState = addOpacityState(page, fillOpacity, strokeOpacity)

  const operators = [pushGraphicsState()]
  if (graphicsState) operators.push(setGraphicsState(graphicsState))
  if (run.fill) operators.push(setFillingRgbColor(run.fill.r, run.fill.g, run.fill.b))
  if (run.stroke) operators.push(setStrokingRgbColor(run.stroke.r, run.stroke.g, run.stroke.b))
  if (run.stroke && run.strokeWidth > 0) {
    operators.push(setLineWidth(run.strokeWidth * (scaleX + scaleY) * 0.5))
  }
  operators.push(
    beginText(),
    setFontAndSize(fontResource, run.fontSize),
    setCharacterSpacing(run.letterSpacing),
    setTextRenderingMode(mode),
    setTextMatrix(pdfA, pdfB, pdfC, pdfD, pdfE, pdfF),
    showText(font.encodeText(run.text)),
    endText(),
    popGraphicsState(),
  )
  page.pushOperators(...operators)
  return { x: x + textWidth, y }
}

export async function generateEditablePdf(
  pages: PageExportAssets[],
  mappings: Map<string, FontMapping>,
): Promise<PdfGenerationResult> {
  const output = await PDFDocument.create()
  output.registerFontkit(fontkit)
  output.setTitle('Editable PDF exported from Figma')
  output.setCreator('Editable PDF Exporter for Figma')
  output.setProducer('pdf-lib')

  const pdfFonts = new Map<string, PdfTextFont>()
  const embeddedByHash = new Map<string, PDFFont>()
  for (const [key, mapping] of mappings) {
    if (mapping.kind === 'system') {
      pdfFonts.set(key, createReferencedPdfFont(output, mapping))
      continue
    }
    let embedded = embeddedByHash.get(mapping.font.sha256)
    if (!embedded) {
      embedded = await output.embedFont(mapping.font.bytes, {
        subset: false,
        customName: mapping.font.postScriptName,
      })
      embeddedByHash.set(mapping.font.sha256, embedded)
    }
    pdfFonts.set(key, embedded)
  }

  const warnings: ExportWarning[] = []
  for (const sourcePage of pages.sort((left, right) => left.pageNumber - right.pageNumber)) {
    const background = await PDFDocument.load(sourcePage.backgroundPdf)
    if (background.getPageCount() !== 1) {
      throw new UserFacingError('PDF_GENERATION', `画板「${sourcePage.frameName}」的背景 PDF 生成异常，请重试。`)
    }
    const [copiedPage] = await output.copyPages(background, [0])
    const page = output.addPage(copiedPage)
    const parsed = parseSvgText(sourcePage.svg, sourcePage.textNodes)
    warnings.push(...sourcePage.warnings, ...parsed.warnings)
    const pageFontResources = new Map<string, PDFName>()
    const cursors = new Map<string, { x: number; y: number }>()

    for (const run of parsed.runs) {
      const font = pdfFonts.get(run.fontKey)
      if (!font) {
        throw new UserFacingError('FONT_UNAVAILABLE', `未找到文字所需字体：${run.fontKey.replace('\u0000', ' / ')}`)
      }
      let resource = pageFontResources.get(run.fontKey)
      if (!resource) {
        resource = page.node.newFontDictionary('F', font.ref)
        pageFontResources.set(run.fontKey, resource)
      }
      const cursor = cursors.get(run.nodeKey) ?? { x: 0, y: 0 }
      cursors.set(run.nodeKey, drawRun(page, run, font, resource, parsed.viewBox, cursor))
    }
  }

  return {
    bytes: await output.save({ useObjectStreams: false, addDefaultPage: false }),
    warnings,
  }
}
