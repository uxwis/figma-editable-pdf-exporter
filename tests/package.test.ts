import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildDeliveryZip } from '../src/export/package'
import type { FontMapping, ParsedFontFile } from '../src/export/font'
import { createSystemFontMapping } from '../src/export/system-font'

describe('delivery ZIP', () => {
  it('contains the PDF, font manifest and human README without font files', () => {
    const font: ParsedFontFile = {
      fileName: 'Example.ttf',
      bytes: new Uint8Array([1, 2, 3]),
      familyName: 'Example',
      subfamilyName: 'Regular',
      postScriptName: 'Example-Regular',
      version: '1.0',
      sha256: 'abc',
      embeddingPermission: 'editable',
      fsType: 8,
      variable: false,
      collection: false,
      characterSet: new Set([65]),
    }
    const mapping: FontMapping = {
      kind: 'embedded',
      requirement: {
        key: 'Example\u0000Regular',
        family: 'Example',
        style: 'Regular',
        characters: 'A',
        pages: [1],
        hasMissingFont: false,
      },
      font,
    }
    const result = buildDeliveryZip({
      pdfBytes: new Uint8Array([37, 80, 68, 70]),
      pageName: '产品/页面',
      frames: [
        { id: '1', name: 'Cover', pageNumber: 1, x: 0, y: 0, width: 100, height: 200, textCount: 1, hidden: false },
      ],
      mappings: new Map([[mapping.requirement.key, mapping]]),
      warnings: [],
    })
    const files = unzipSync(result.bytes)
    expect(Object.keys(files).sort()).toEqual([
      'README.txt',
      'editable.pdf',
      'font-manifest.json',
    ])
    const manifest = JSON.parse(strFromU8(files['font-manifest.json']))
    expect(manifest.schemaVersion).toBe(4)
    expect(manifest.fonts[0].embedded).toBe(true)
    expect(manifest.fonts[0].sha256).toBe('abc')
    expect(manifest.fonts[0]).not.toHaveProperty('file')
    expect(strFromU8(files['README.txt'])).toContain('不会包含或重新分发任何本机字体')
    expect(result.fileName).toBe('产品_页面-editable-pdf.zip')
  })

  it('does not redistribute local font files', () => {
    const font: ParsedFontFile = {
      fileName: 'Commercial.ttf',
      bytes: new Uint8Array([9, 8, 7]),
      familyName: 'Commercial',
      subfamilyName: 'Regular',
      postScriptName: 'Commercial-Regular',
      version: '2.0',
      sha256: 'local-sha',
      embeddingPermission: 'editable',
      fsType: 8,
      variable: false,
      collection: false,
      characterSet: new Set([65]),
    }
    const mapping: FontMapping = {
      kind: 'embedded',
      requirement: {
        key: 'Commercial\u0000Regular',
        family: 'Commercial',
        style: 'Regular',
        characters: 'A',
        pages: [1],
        hasMissingFont: false,
      },
      font,
    }
    const result = buildDeliveryZip({
      pdfBytes: new Uint8Array([37, 80, 68, 70]),
      pageName: 'Page',
      frames: [],
      mappings: new Map([[mapping.requirement.key, mapping]]),
      warnings: [],
    })
    const files = unzipSync(result.bytes)
    expect(Object.keys(files).some((name) => name.endsWith('Commercial.ttf'))).toBe(false)
    expect(result.manifest.fonts[0]).toMatchObject({
      postScriptName: 'Commercial-Regular',
      version: '2.0',
      sha256: 'local-sha',
    })
    expect(result.manifest.warnings).toEqual([])
    expect(strFromU8(files['README.txt'])).toContain('不会包含或重新分发任何本机字体')
  })

  it('records unembedded system-font references without fake hashes', () => {
    const mapping = createSystemFontMapping({
      key: 'Microsoft YaHei\u0000Regular',
      family: 'Microsoft YaHei',
      style: 'Regular',
      characters: '中文',
      pages: [1],
      hasMissingFont: false,
    })
    const result = buildDeliveryZip({
      pdfBytes: new Uint8Array([37, 80, 68, 70]),
      pageName: 'Page',
      frames: [],
      mappings: new Map([[mapping.requirement.key, mapping]]),
      warnings: [],
    })

    expect(result.manifest.fonts[0]).toMatchObject({
      postScriptName: 'MicrosoftYaHei',
      embedded: false,
      version: null,
      sha256: null,
      embeddingPermission: 'not-embedded',
    })
    expect(strFromU8(unzipSync(result.bytes)['README.txt'])).toContain('系统字体引用，未嵌入')
  })
})
