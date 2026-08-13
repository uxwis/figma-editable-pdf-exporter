import fontkit from '@pdf-lib/fontkit'
import { UserFacingError, type ExportWarning, type FontRequirement } from '../shared'

export type EmbeddingPermission =
  | 'installable'
  | 'editable'
  | 'preview-print'
  | 'restricted'
  | 'bitmap-only'
  | 'unknown'

export interface ParsedFontFile {
  fileName: string
  bytes: Uint8Array
  familyName: string
  subfamilyName: string
  postScriptName: string
  version: string
  sha256: string
  embeddingPermission: EmbeddingPermission
  fsType: number | null
  variable: boolean
  collection: boolean
  characterSet: Set<number>
}

export interface EmbeddedFontMapping {
  kind: 'embedded'
  requirement: FontRequirement
  font: ParsedFontFile
}

export interface SystemFontReference {
  familyName: string
  styleName: string
  postScriptName: string
  weight: number
  italic: boolean
}

export interface SystemFontMapping {
  kind: 'system'
  requirement: FontRequirement
  reference: SystemFontReference
}

export type FontMapping = EmbeddedFontMapping | SystemFontMapping

export interface FontResolution {
  mappings: Map<string, FontMapping>
  warnings: ExportWarning[]
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

export function readSfntTables(bytes: Uint8Array): Map<string, { offset: number; length: number }> {
  const tables = new Map<string, { offset: number; length: number }>()
  if (bytes.byteLength < 12) return tables
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (readTag(view, 0) === 'ttcf') return tables
  const numTables = view.getUint16(4, false)
  if (12 + numTables * 16 > bytes.byteLength) return tables
  for (let index = 0; index < numTables; index += 1) {
    const recordOffset = 12 + index * 16
    const tag = readTag(view, recordOffset)
    const offset = view.getUint32(recordOffset + 8, false)
    const length = view.getUint32(recordOffset + 12, false)
    if (offset + length <= bytes.byteLength) tables.set(tag, { offset, length })
  }
  return tables
}

export function readFsType(bytes: Uint8Array): number | null {
  const table = readSfntTables(bytes).get('OS/2')
  if (!table || table.length < 10) return null
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(table.offset + 8, false)
}

export function embeddingPermissionFromFsType(fsType: number | null): EmbeddingPermission {
  if (fsType === null) return 'unknown'
  if ((fsType & 0x0200) !== 0) return 'bitmap-only'
  if ((fsType & 0x0002) !== 0) return 'restricted'
  if ((fsType & 0x0008) !== 0) return 'editable'
  if ((fsType & 0x0004) !== 0) return 'preview-print'
  if ((fsType & 0x000f) === 0) return 'installable'
  return 'unknown'
}

export function isFontEmbeddingAllowed(permission: EmbeddingPermission): boolean {
  return permission === 'installable' || permission === 'editable' || permission === 'unknown'
}

export function missingCodePoints(requirement: FontRequirement, font: ParsedFontFile): number[] {
  const ignored = new Set([0x0009, 0x000a, 0x000d, 0x200b, 0x200c, 0x200d, 0xfe0e, 0xfe0f])
  return Array.from(requirement.characters)
    .map((character) => character.codePointAt(0)!)
    .filter((codePoint, index, all) => !ignored.has(codePoint) && all.indexOf(codePoint) === index)
    .filter((codePoint) => !font.characterSet.has(codePoint))
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

function sha256Fallback(bytes: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const paddedView = new DataView(padded.buffer)
  const bitLength = bytes.length * 8
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false)
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0, false)

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const words = new Uint32Array(64)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = paddedView.getUint32(offset + index * 4, false)
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]
      const right = words[index - 2]
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }

    let a = state[0]
    let b = state[1]
    let c = state[2]
    let d = state[3]
    let e = state[4]
    let f = state[5]
    let g = state[6]
    let h = state[7]

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }

    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }

  const digest = new Uint8Array(32)
  const digestView = new DataView(digest.buffer)
  state.forEach((value, index) => digestView.setUint32(index * 4, value, false))
  return digest
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    try {
      return bytesToHex(new Uint8Array(await subtle.digest('SHA-256', source)))
    } catch {
      // Some Figma plugin runtimes expose `crypto` without a working SubtleCrypto implementation.
    }
  }
  return bytesToHex(sha256Fallback(bytes))
}

export async function parseFontFile(file: File): Promise<ParsedFontFile> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'ttf' && extension !== 'otf') {
    throw new UserFacingError('FONT_UNAVAILABLE', '首版仅支持静态 TTF/OTF 字体。')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.byteLength < 12) throw new UserFacingError('FONT_UNAVAILABLE', '字体文件过小或已损坏。')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const collection = readTag(view, 0) === 'ttcf'
  if (collection) throw new UserFacingError('FONT_UNAVAILABLE', '首版不支持 TTC 字体集合，请使用独立 TTF/OTF。')
  const tables = readSfntTables(bytes)
  const variable = tables.has('fvar')
  if (variable) throw new UserFacingError('FONT_UNAVAILABLE', '首版不支持可变字体，请使用对应字重的静态 TTF/OTF。')

  const fontkitApi = fontkit as typeof import('@pdf-lib/fontkit')
  let parsed: ReturnType<typeof fontkitApi.create>
  try {
    parsed = fontkitApi.create(bytes)
  } catch {
    throw new UserFacingError('FONT_UNAVAILABLE', '字体文件无法解析，请确认其为有效的 TTF/OTF。')
  }
  const fsType = readFsType(bytes)
  return {
    fileName: file.name,
    bytes,
    familyName: parsed.familyName ?? 'Unknown',
    subfamilyName: parsed.subfamilyName ?? 'Regular',
    postScriptName: parsed.postscriptName ?? `${parsed.familyName ?? 'Font'}-${parsed.subfamilyName ?? 'Regular'}`,
    version: parsed.version ?? 'Unknown',
    sha256: await sha256Hex(bytes),
    embeddingPermission: embeddingPermissionFromFsType(fsType),
    fsType,
    variable,
    collection,
    characterSet: new Set(parsed.characterSet),
  }
}
