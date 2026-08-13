import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  type PDFRef,
} from 'pdf-lib'
import type { FontRequirement } from '../shared'
import type { SystemFontMapping, SystemFontReference } from './font'

export interface ReferencedPdfFont {
  ref: PDFRef
  encodeText(text: string): PDFHexString
  widthOfTextAtSize(text: string, size: number): number
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

export function systemFontWeight(style: string): number {
  const value = normalized(style)
  if (/thin|hairline|100/.test(value)) return 100
  if (/extralight|ultralight|200/.test(value)) return 200
  if (/light|300/.test(value)) return 300
  if (/medium|500/.test(value)) return 500
  if (/semibold|demibold|600/.test(value)) return 600
  if (/extrabold|ultrabold|800/.test(value)) return 800
  if (/black|heavy|900/.test(value)) return 900
  if (/bold|700/.test(value)) return 700
  return 400
}

function isItalic(style: string): boolean {
  return /italic|oblique/i.test(style)
}

function compactName(value: string): string {
  return value.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '') || 'FigmaFont'
}

export function derivePostScriptName(family: string, style: string): string {
  const familyKey = normalized(family)
  const styleKey = normalized(style)
  const bold = systemFontWeight(style) >= 700
  const italic = isItalic(style)

  if (familyKey === 'arial') {
    if (bold && italic) return 'Arial-BoldItalicMT'
    if (bold) return 'Arial-BoldMT'
    if (italic) return 'Arial-ItalicMT'
    return 'ArialMT'
  }
  if (familyKey === 'timesnewroman') {
    if (bold && italic) return 'TimesNewRomanPS-BoldItalicMT'
    if (bold) return 'TimesNewRomanPS-BoldMT'
    if (italic) return 'TimesNewRomanPS-ItalicMT'
    return 'TimesNewRomanPSMT'
  }
  if (familyKey === 'microsoftyahei' || familyKey === '微软雅黑') {
    if (/light|300/.test(styleKey)) return 'MicrosoftYaHeiLight'
    return bold ? 'MicrosoftYaHei-Bold' : 'MicrosoftYaHei'
  }
  if (familyKey === 'segoeui') {
    if (bold && italic) return 'SegoeUI-BoldItalic'
    if (bold) return 'SegoeUI-Bold'
    if (italic) return 'SegoeUI-Italic'
    return 'SegoeUI'
  }

  const base = compactName(family)
  const regular = !styleKey || /^(regular|normal|roman|book|400)$/.test(styleKey)
  return regular ? base : `${base}-${compactName(style)}`
}

export function createSystemFontMapping(requirement: FontRequirement): SystemFontMapping {
  return {
    kind: 'system',
    requirement,
    reference: {
      familyName: requirement.family,
      styleName: requirement.style,
      postScriptName: derivePostScriptName(requirement.family, requirement.style),
      weight: systemFontWeight(requirement.style),
      italic: isItalic(requirement.style),
    },
  }
}

function unicodeHex(character: string): string {
  const codePoint = character.codePointAt(0) ?? 0xfffd
  if (codePoint <= 0xffff) return codePoint.toString(16).padStart(4, '0').toUpperCase()
  const adjusted = codePoint - 0x10000
  const high = 0xd800 + (adjusted >>> 10)
  const low = 0xdc00 + (adjusted & 0x3ff)
  return `${high.toString(16).padStart(4, '0')}${low.toString(16).padStart(4, '0')}`.toUpperCase()
}

function uniqueCharacters(value: string): string[] {
  return Array.from(new Set(Array.from(value))).filter((character) => character !== '\u0000')
}

interface CharacterMap {
  characterToCid: Map<string, number>
  cidToCharacter: Array<{ cid: number; character: string }>
}

function buildCharacterMap(characters: string): CharacterMap {
  const values = uniqueCharacters(characters)
  const used = new Set<number>()
  const characterToCid = new Map<string, number>()
  const pending: string[] = []

  for (const character of values) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint > 0 && codePoint <= 0xffff) {
      characterToCid.set(character, codePoint)
      used.add(codePoint)
    } else {
      pending.push(character)
    }
  }

  let nextCid = 1
  for (const character of pending) {
    while (used.has(nextCid) && nextCid < 0xffff) nextCid += 1
    characterToCid.set(character, nextCid)
    used.add(nextCid)
    nextCid += 1
  }

  return {
    characterToCid,
    cidToCharacter: Array.from(characterToCid, ([character, cid]) => ({ cid, character }))
      .sort((left, right) => left.cid - right.cid),
  }
}

function cmapSections(entries: Array<{ cid: number; character: string }>): string {
  const sections: string[] = []
  for (let offset = 0; offset < entries.length; offset += 100) {
    const chunk = entries.slice(offset, offset + 100)
    sections.push(`${chunk.length} beginbfchar`)
    for (const entry of chunk) {
      const source = entry.cid.toString(16).padStart(4, '0').toUpperCase()
      sections.push(`<${source}> <${unicodeHex(entry.character)}>`)
    }
    sections.push('endbfchar')
  }
  return sections.join('\n')
}

function toUnicodeCmap(fontName: string, entries: Array<{ cid: number; character: string }>): string {
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /${compactName(fontName)}-ToUnicode def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${cmapSections(entries)}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`
}

let measurementContext: CanvasRenderingContext2D | null | undefined

function getMeasurementContext(): CanvasRenderingContext2D | null {
  if (measurementContext !== undefined) return measurementContext
  try {
    measurementContext = typeof document === 'undefined' || /jsdom/i.test(globalThis.navigator?.userAgent ?? '')
      ? null
      : document.createElement('canvas').getContext('2d')
  } catch {
    measurementContext = null
  }
  return measurementContext
}

function fallbackCharacterWidth(character: string): number {
  if (/\s/u.test(character)) return 0.33
  const codePoint = character.codePointAt(0) ?? 0
  if (codePoint >= 0x2e80 || codePoint > 0xffff) return 1
  if (/[ilI1.,'`:;|!]/.test(character)) return 0.28
  if (/[mwMW@#%&]/.test(character)) return 0.85
  return 0.56
}

function measureAtSize(
  text: string,
  size: number,
  reference: SystemFontReference,
): number {
  const context = getMeasurementContext()
  if (context) {
    const escapedFamily = reference.familyName.replace(/["\\]/g, '\\$&')
    context.font = `${reference.italic ? 'italic' : 'normal'} ${reference.weight} ${size}px "${escapedFamily}"`
    const measured = context.measureText(text).width
    if (Number.isFinite(measured) && measured > 0) return measured
  }
  return Array.from(text).reduce((total, character) => total + fallbackCharacterWidth(character) * size, 0)
}

export function createReferencedPdfFont(
  document: PDFDocument,
  mapping: SystemFontMapping,
): ReferencedPdfFont {
  const context = document.context
  const reference = mapping.reference
  const characterMap = buildCharacterMap(mapping.requirement.characters)
  const descriptor = context.obj({
    Type: 'FontDescriptor',
    FontName: PDFName.of(reference.postScriptName),
    FontFamily: PDFString.of(reference.familyName),
    FontStretch: 'Normal',
    FontWeight: reference.weight,
    Flags: 32 + (reference.italic ? 64 : 0),
    FontBBox: [-250, -300, 1500, 1200],
    ItalicAngle: reference.italic ? -12 : 0,
    Ascent: 950,
    Descent: -250,
    CapHeight: 700,
    StemV: reference.weight >= 700 ? 120 : 80,
    MissingWidth: 1000,
  })
  const descriptorRef = context.register(descriptor)
  const widths: Array<number | number[]> = []
  for (const entry of characterMap.cidToCharacter) {
    widths.push(entry.cid, [measureAtSize(entry.character, 1000, reference)])
  }
  const cidFont = context.obj({
    Type: 'Font',
    Subtype: 'CIDFontType2',
    BaseFont: PDFName.of(reference.postScriptName),
    CIDSystemInfo: {
      Registry: PDFString.of('Adobe'),
      Ordering: PDFString.of('Identity'),
      Supplement: 0,
    },
    FontDescriptor: descriptorRef,
    DW: 1000,
    W: widths,
  })
  const cidFontRef = context.register(cidFont)
  const cmap = context.flateStream(
    toUnicodeCmap(reference.postScriptName, characterMap.cidToCharacter),
  )
  const cmapRef = context.register(cmap)
  const font = context.obj({
    Type: 'Font',
    Subtype: 'Type0',
    BaseFont: PDFName.of(reference.postScriptName),
    Encoding: 'Identity-H',
    DescendantFonts: [cidFontRef],
    ToUnicode: cmapRef,
  })
  const ref = context.register(font)

  return {
    ref,
    encodeText(text: string): PDFHexString {
      const hex = Array.from(text, (character) => {
        const cid = characterMap.characterToCid.get(character)
        return (cid ?? 0).toString(16).padStart(4, '0').toUpperCase()
      }).join('')
      return PDFHexString.of(hex)
    },
    widthOfTextAtSize(text: string, size: number): number {
      return measureAtSize(text, size, reference)
    },
  }
}
