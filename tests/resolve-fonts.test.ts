import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FontMapping, ParsedFontFile } from '../src/export/font'
import { resolveLocalFonts, supportsLocalFontAccess } from '../src/export/local-fonts'
import { resolveFonts } from '../src/export/resolve-fonts'
import type { FontRequirement } from '../src/shared'

vi.mock('../src/export/local-fonts', () => ({
  resolveLocalFonts: vi.fn(),
  supportsLocalFontAccess: vi.fn(),
}))

const regular: FontRequirement = {
  key: 'Example\u0000Regular',
  family: 'Example',
  style: 'Regular',
  characters: 'A',
  pages: [1],
  hasMissingFont: false,
}
const bold: FontRequirement = { ...regular, key: 'Example\u0000Bold', style: 'Bold', characters: 'B' }

function embeddedMapping(requirement: FontRequirement): FontMapping {
  return {
    kind: 'embedded',
    requirement,
    font: { postScriptName: requirement.style, sha256: requirement.key } as ParsedFontFile,
  }
}

describe('font resolution strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supportsLocalFontAccess).mockReturnValue(false)
  })

  it('uses system-font references when Figma does not expose raw local fonts', async () => {
    const result = await resolveFonts([regular, bold])

    expect(resolveLocalFonts).not.toHaveBeenCalled()
    expect(result.mappings.get(regular.key)).toMatchObject({
      kind: 'system',
      reference: { familyName: 'Example', styleName: 'Regular' },
    })
    expect(result.mappings.get(bold.key)).toMatchObject({
      kind: 'system',
      reference: { familyName: 'Example', styleName: 'Bold', weight: 700 },
    })
    expect(result.warnings).toHaveLength(2)
  })

  it('fully embeds readable fonts and references only unresolved styles', async () => {
    vi.mocked(supportsLocalFontAccess).mockReturnValue(true)
    vi.mocked(resolveLocalFonts).mockResolvedValue({
      mappings: new Map([[regular.key, embeddedMapping(regular)]]),
      warnings: [],
      unresolved: [bold],
    })

    const result = await resolveFonts([regular, bold])
    expect(result.mappings.get(regular.key)?.kind).toBe('embedded')
    expect(result.mappings.get(bold.key)?.kind).toBe('system')
    expect(result.warnings).toHaveLength(1)
  })

  it('falls back to system references when local font access is denied or fails', async () => {
    vi.mocked(supportsLocalFontAccess).mockReturnValue(true)
    vi.mocked(resolveLocalFonts).mockRejectedValue(new DOMException('denied', 'NotAllowedError'))

    const result = await resolveFonts([regular])
    expect(result.mappings.get(regular.key)?.kind).toBe('system')
    expect(result.warnings[0].code).toBe('FONT_REFERENCED_NOT_EMBEDDED')
  })
})
