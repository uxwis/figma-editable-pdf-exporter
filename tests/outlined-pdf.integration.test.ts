import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PDFArray, PDFRawStream, concatTransformationMatrix, popGraphicsState, pushGraphicsState, rgb } from 'pdf-lib'
import { expect, it } from 'vitest'
import { generateEditablePdf } from '../src/export/pdf'
import type { FontMapping } from '../src/export/font'
import type { PageExportAssets } from '../src/shared'

const fontPath = 'C:\\Windows\\Fonts\\arial.ttf'

it.skipIf(!existsSync(fontPath))('preserves native outlined glyphs and overlays ordinary editable text once', async () => {
  const bytes = new Uint8Array(readFileSync(fontPath))
  const font = fontkit.create(bytes)
  const background = await PDFDocument.create()
  const nativePage = background.addPage([600, 300])
  // A vector-only fixture represents the text retained in Figma's native PDF.
  nativePage.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, -1, 0, 300))
  for (const [text, y, filled] of [['OUTLINE', 75, false], ['FILL + STROKE', 150, true]] as const) {
    const scale = 48 / font.unitsPerEm
    const layout = font.layout(text)
    let x = 32
    layout.glyphs.forEach((glyph, index) => {
      nativePage.drawSvgPath(glyph.path.toSVG(), {
        x, y, scale,
        color: filled ? rgb(0.85, 0.93, 1) : undefined,
        borderColor: rgb(0.08, 0.35, 0.8), borderWidth: 1.2 / scale,
      })
      x += layout.positions[index].xAdvance * scale
    })
  }
  nativePage.pushOperators(popGraphicsState())
  const backgroundBytes = await background.save()
  const requirement = { key: 'Arial\u0000Regular', family: 'Arial', style: 'Regular', characters: 'Editable text stays editable', pages: [1], hasMissingFont: false }
  const mapping: FontMapping = {
    kind: 'embedded', requirement,
    font: { fileName: 'arial.ttf', bytes, familyName: 'Arial', subfamilyName: 'Regular', postScriptName: 'ArialMT',
      version: 'test', sha256: 'arial-fixture', embeddingPermission: 'editable', fsType: 8, variable: false,
      collection: false, characterSet: new Set(Array.from(requirement.characters, (character) => character.codePointAt(0)!)) },
  }
  const assets: PageExportAssets = {
    frameId: 'frame', frameName: 'Outline regression', pageNumber: 1, backgroundPdf: backgroundBytes,
    // A native text element is deliberately present in SVG but excluded from
    // editable metadata: rebuilding it would duplicate the native outlines.
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><text id="native" x="32" y="75">OUTLINE</text><text id="normal" x="32" y="245" fill="#222222" font-size="24">Editable text stays editable</text></svg>',
    textNodes: [{ key: 'normal', nodeType: 'TEXT', characters: requirement.characters,
      segments: [{ start: 0, end: requirement.characters.length, characters: requirement.characters, fontKey: requirement.key, fontSize: 24, fontWeight: 400, fontStyle: 'REGULAR' }],
      fallback: { x: 32, y: 221, width: 350, height: 28, rotation: 0 } }],
    warnings: [{ code: 'TEXT_OUTLINED_STYLE', severity: 'warning', message: 'Outlined text is retained natively.' }],
  }
  const result = await generateEditablePdf([assets], new Map([[requirement.key, mapping]]))
  const exported = await PDFDocument.load(result.bytes)
  expect(exported.getPageCount()).toBe(1)
  const source = await PDFDocument.load(backgroundBytes)
  const sourceContents = source.getPage(0).node.Contents() as PDFArray
  const nativeStream = (source.context.lookup(sourceContents.get(0)) as PDFRawStream).getContents()
  const outputContents = exported.getPage(0).node.Contents() as PDFArray
  const outputStreams = Array.from({ length: outputContents.size() }, (_, index) =>
    (exported.context.lookup(outputContents.get(index)) as PDFRawStream).getContents(),
  )
  expect(outputStreams).toContainEqual(nativeStream)
  expect(result.warnings.some((warning) => warning.code === 'TEXT_OUTLINED_STYLE')).toBe(true)
  const dir = resolve('tmp/pdfs')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'smoke-outlined-text.pdf'), result.bytes)
})

it('refuses to silently omit text when assets bypassed native-outline validation', async () => {
  const background = await PDFDocument.create()
  background.addPage([100, 100])
  await expect(generateEditablePdf([{
    frameId: 'frame', frameName: 'Unsafe', pageNumber: 1,
    svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', backgroundPdf: await background.save(), warnings: [],
    textNodes: [{ key: 'missing', nodeType: 'TEXT', characters: 'Missing', segments: [],
      fallback: { x: 0, y: 0, width: 100, height: 20, rotation: 0 } }],
  }], new Map())).rejects.toThrow('未完成转曲')
})
