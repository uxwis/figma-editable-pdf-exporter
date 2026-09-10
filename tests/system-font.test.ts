import { describe, expect, it } from 'vitest'
import { createSystemFontMapping, derivePostScriptName, systemFontWeight } from '../src/export/system-font'

describe('system font references', () => {
  it('derives common Windows PostScript font names', () => {
    expect(derivePostScriptName('Arial', 'Regular')).toBe('ArialMT')
    expect(derivePostScriptName('Arial', 'Bold Italic')).toBe('Arial-BoldItalicMT')
    expect(derivePostScriptName('Microsoft YaHei', 'Bold')).toBe('MicrosoftYaHei-Bold')
  })

  it('preserves arbitrary Figma font names without bundling a substitute', () => {
    const mapping = createSystemFontMapping({
      key: 'Source Han Sans SC\u0000Medium',
      family: 'Source Han Sans SC',
      style: 'Medium',
      characters: '中文 A',
      pages: [1, 2],
      hasMissingFont: false,
    })

    expect(mapping).toMatchObject({
      kind: 'system',
      reference: {
        familyName: 'Source Han Sans SC',
        styleName: 'Medium',
        postScriptName: 'SourceHanSansSC-Medium',
        weight: 500,
      },
    })
    expect(systemFontWeight('Semi Bold')).toBe(600)
  })
})
