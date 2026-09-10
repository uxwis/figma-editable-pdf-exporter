import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { generateEditablePdf } from '../src/export/pdf'
import type { FontMapping, ParsedFontFile } from '../src/export/font'
import { createSystemFontMapping } from '../src/export/system-font'
import type { PageExportAssets } from '../src/shared'

const fontPath = 'C:\\Windows\\Fonts\\arial.ttf'
const cjkFontPath = 'C:\\Windows\\Fonts\\HuXiaoBoKuHei.ttf'

describe('editable PDF integration', () => {
  it('creates searchable text with an unembedded system-font reference', async () => {
    const background = await PDFDocument.create()
    background.addPage([300, 100])
    const requirement = {
      key: 'Microsoft YaHei\u0000Regular',
      family: 'Microsoft YaHei',
      style: 'Regular',
      characters: 'Editable 中文 PDF',
      pages: [1],
      hasMissingFont: false,
    }
    const page: PageExportAssets = {
      frameId: 'system-font',
      frameName: 'System font',
      pageNumber: 1,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><text id="epdf_p1_t0" fill="#111827" font-size="22"><tspan x="12" y="45">Editable 中文 PDF</tspan></text></svg>`,
      backgroundPdf: await background.save(),
      warnings: [],
      textNodes: [{
        key: 'epdf_p1_t0',
        nodeType: 'TEXT',
        characters: requirement.characters,
        segments: [{
          start: 0,
          end: requirement.characters.length,
          characters: requirement.characters,
          fontKey: requirement.key,
          fontSize: 22,
          fontWeight: 400,
          fontStyle: 'REGULAR',
        }],
        fallback: { x: 12, y: 20, width: 220, height: 30, rotation: 0 },
      }],
    }

    const mapping = createSystemFontMapping(requirement)
    const result = await generateEditablePdf([page], new Map([[requirement.key, mapping]]))
    const source = new TextDecoder('latin1').decode(result.bytes)
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1)
    expect(source).toContain('/BaseFont /MicrosoftYaHei')
    expect(source).not.toContain('/FontFile')
    expect(result.bytes.byteLength).toBeLessThan(50_000)
    const outputDir = resolve('tmp/pdfs')
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(resolve(outputDir, 'smoke-system-reference.pdf'), result.bytes)
  })

  it.skipIf(!existsSync(fontPath))('overlays a real custom-font text object on a native PDF page', async () => {
    const background = await PDFDocument.create()
    background.addPage([200, 100])
    const backgroundBytes = await background.save()
    const fontBytes = new Uint8Array(readFileSync(fontPath))
    const font: ParsedFontFile = {
      fileName: 'arial.ttf',
      bytes: fontBytes,
      familyName: 'Arial',
      subfamilyName: 'Regular',
      postScriptName: 'ArialMT',
      version: 'system-test',
      sha256: 'system-test',
      embeddingPermission: 'editable',
      fsType: 8,
      variable: false,
      collection: false,
      characterSet: new Set(Array.from({ length: 128 }, (_, index) => index),
      ),
    }
    const requirement = {
      key: 'Arial\u0000Regular',
      family: 'Arial',
      style: 'Regular',
      characters: 'Editable Hello',
      pages: [1],
      hasMissingFont: false,
    }
    const mapping: FontMapping = { kind: 'embedded', requirement, font }
    const page: PageExportAssets = {
      frameId: '1',
      frameName: 'Smoke',
      pageNumber: 1,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text id="epdf_p1_t0" fill="#111827" font-size="20"><tspan x="12" y="40">Editable Hello</tspan></text></svg>`,
      backgroundPdf: backgroundBytes,
      warnings: [],
      textNodes: [
        {
          key: 'epdf_p1_t0',
          nodeType: 'TEXT',
          characters: 'Editable Hello',
          segments: [
            { start: 0, end: 14, characters: 'Editable Hello', fontKey: requirement.key, fontSize: 20, fontWeight: 400, fontStyle: 'REGULAR' },
          ],
          fallback: { x: 12, y: 20, width: 140, height: 24, rotation: 0 },
        },
      ],
    }
    const result = await generateEditablePdf([page], new Map([[requirement.key, mapping]]))
    const reopened = await PDFDocument.load(result.bytes)
    expect(reopened.getPageCount()).toBe(1)
    expect(result.bytes.byteLength).toBeGreaterThan(100_000)
    const outputDir = resolve('tmp/pdfs')
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(resolve(outputDir, 'smoke-editable.pdf'), result.bytes)
  }, 30_000)

  it.skipIf(!existsSync(cjkFontPath))('preserves Chinese unicode text with a full embedded TTF', async () => {
    const background = await PDFDocument.create()
    background.addPage([260, 100])
    const requirement = {
      key: 'HuXiaoBo_KuHei\u0000Regular',
      family: 'HuXiaoBo_KuHei',
      style: 'Regular',
      characters: '可编辑中文 PDF',
      pages: [1],
      hasMissingFont: false,
    }
    const font: ParsedFontFile = {
      fileName: 'HuXiaoBoKuHei.ttf',
      bytes: new Uint8Array(readFileSync(cjkFontPath)),
      familyName: 'HuXiaoBo_KuHei',
      subfamilyName: 'Regular',
      postScriptName: 'HuXiaoBo-KuHei',
      version: 'system-test',
      sha256: 'system-test-cjk',
      embeddingPermission: 'editable',
      fsType: 8,
      variable: false,
      collection: false,
      characterSet: new Set(Array.from(requirement.characters, (character) => character.codePointAt(0)!)),
    }
    const page: PageExportAssets = {
      frameId: '2',
      frameName: 'Chinese smoke',
      pageNumber: 1,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 100"><text id="epdf_p1_t0" fill="#312e81" font-size="24" letter-spacing="0.05em"><tspan x="12" y="48">可编辑中文 PDF</tspan></text></svg>`,
      backgroundPdf: await background.save(),
      warnings: [],
      textNodes: [
        {
          key: 'epdf_p1_t0',
          nodeType: 'TEXT',
          characters: requirement.characters,
          segments: [
            { start: 0, end: requirement.characters.length, characters: requirement.characters, fontKey: requirement.key, fontSize: 24, fontWeight: 400, fontStyle: 'REGULAR' },
          ],
          fallback: { x: 12, y: 20, width: 220, height: 30, rotation: 0 },
        },
      ],
    }
    const result = await generateEditablePdf(
      [page],
      new Map([[requirement.key, { kind: 'embedded' as const, requirement, font }]]),
    )
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1)
    const outputDir = resolve('tmp/pdfs')
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(resolve(outputDir, 'smoke-cjk.pdf'), result.bytes)
  }, 30_000)
})
