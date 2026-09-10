import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  embeddingPermissionFromFsType,
  missingCodePoints,
  readFsType,
  readSfntTables,
  sha256Hex,
  type ParsedFontFile,
} from '../src/export/font'
import type { FontRequirement } from '../src/shared'

function syntheticFont(fsType: number, includeFvar = false): Uint8Array {
  const tableCount = includeFvar ? 2 : 1
  const os2Offset = 12 + tableCount * 16
  const bytes = new Uint8Array(os2Offset + 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x00010000, false)
  view.setUint16(4, tableCount, false)
  ;['O', 'S', '/', '2'].forEach((letter, index) => view.setUint8(12 + index, letter.charCodeAt(0)))
  view.setUint32(20, os2Offset, false)
  view.setUint32(24, 12, false)
  view.setUint16(os2Offset + 8, fsType, false)
  if (includeFvar) {
    ;['f', 'v', 'a', 'r'].forEach((letter, index) => view.setUint8(28 + index, letter.charCodeAt(0)))
    view.setUint32(36, os2Offset, false)
  }
  return bytes
}

describe('font validation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads OS/2 embedding flags from an SFNT directory', () => {
    const bytes = syntheticFont(0x0008)
    expect(readSfntTables(bytes).has('OS/2')).toBe(true)
    expect(readFsType(bytes)).toBe(0x0008)
    expect(embeddingPermissionFromFsType(readFsType(bytes))).toBe('editable')
  })

  it('classifies restricted and preview-only fonts', () => {
    expect(embeddingPermissionFromFsType(0x0002)).toBe('restricted')
    expect(embeddingPermissionFromFsType(0x0004)).toBe('preview-print')
    expect(embeddingPermissionFromFsType(0)).toBe('installable')
  })

  it('reports missing glyphs while ignoring newlines', () => {
    const requirement: FontRequirement = {
      key: 'Test\u0000Regular',
      family: 'Test',
      style: 'Regular',
      characters: 'A中\n',
      pages: [1],
      hasMissingFont: false,
    }
    const font = {
      characterSet: new Set([0x41]),
    } as ParsedFontFile
    expect(missingCodePoints(requirement, font)).toEqual([0x4e2d])
  })

  it('computes SHA-256 when SubtleCrypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined)
    const digest = await sha256Hex(new TextEncoder().encode('abc'))
    expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes large font-sized inputs without SubtleCrypto', async () => {
    const bytes = new Uint8Array(1_000_000)
    bytes.forEach((_, index) => { bytes[index] = index % 251 })
    const expected = createHash('sha256').update(bytes).digest('hex')
    vi.stubGlobal('crypto', undefined)
    expect(await sha256Hex(bytes)).toBe(expected)
  })
})
