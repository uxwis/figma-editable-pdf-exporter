import { describe, expect, it } from 'vitest'
import {
  localFontMatchScore,
  rankLocalFonts,
  supportsLocalFontAccess,
  type LocalFontData,
} from '../src/export/local-fonts'
import type { FontRequirement } from '../src/shared'

function localFont(family: string, style: string, fullName = `${family} ${style}`): LocalFontData {
  return {
    family,
    style,
    fullName,
    postscriptName: `${family.replace(/ /g, '')}-${style.replace(/ /g, '')}`,
    blob: async () => new Blob(),
  }
}

const requirement: FontRequirement = {
  key: 'Inter\u0000Semi Bold',
  family: 'Inter',
  style: 'Semi Bold',
  characters: 'Hello',
  pages: [1],
  hasMissingFont: false,
}

describe('automatic local font matching', () => {
  it('reports unavailable Local Font Access in the test runtime', () => {
    expect(supportsLocalFontAccess()).toBe(false)
  })

  it('prefers exact family and equivalent normalized style names', () => {
    const fonts = [
      localFont('Inter', 'Regular'),
      localFont('Inter', 'Semibold'),
      localFont('Inter', 'Bold'),
    ]
    expect(rankLocalFonts(requirement, fonts)[0].style).toBe('Semibold')
  })

  it('rejects unrelated families even when their style is exact', () => {
    expect(localFontMatchScore(requirement, localFont('Arial', 'Semi Bold'))).toBe(Number.POSITIVE_INFINITY)
  })

  it('uses the nearest weight as a deterministic fallback', () => {
    const fonts = [localFont('Inter', 'Regular'), localFont('Inter', 'Bold')]
    expect(rankLocalFonts(requirement, fonts)[0].style).toBe('Bold')
  })

  it('matches full names that contain the requested family', () => {
    const font = localFont('苹方-简', '常规体', 'PingFang SC Regular')
    expect(Number.isFinite(localFontMatchScore({ ...requirement, family: 'PingFang SC' }, font))).toBe(true)
  })
})
