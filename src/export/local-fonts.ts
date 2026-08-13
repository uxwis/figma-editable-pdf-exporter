import { UserFacingError, type ExportWarning, type FontRequirement } from '../shared'
import {
  isFontEmbeddingAllowed,
  missingCodePoints,
  parseFontFile,
  type FontMapping,
  type FontResolution,
  type ParsedFontFile,
} from './font'

export interface LocalFontData {
  family: string
  fullName: string
  postscriptName: string
  style: string
  blob(): Promise<Blob>
}

interface LocalFontWindow extends Window {
  queryLocalFonts?: (options?: { postscriptNames?: string[] }) => Promise<LocalFontData[]>
}

export interface LocalFontResolution extends FontResolution {
  unresolved: FontRequirement[]
}

interface ParsedCandidate {
  data: LocalFontData
  parsed: ParsedFontFile
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function styleWeight(value: string): number {
  const name = normalized(value)
  if (/thin|hairline|100/.test(name)) return 100
  if (/extralight|ultralight|200/.test(name)) return 200
  if (/light|300/.test(name)) return 300
  if (/medium|500/.test(name)) return 500
  if (/semibold|demibold|600/.test(name)) return 600
  if (/extrabold|ultrabold|800/.test(name)) return 800
  if (/black|heavy|900/.test(name)) return 900
  if (/bold|700/.test(name)) return 700
  return 400
}

function isItalic(value: string): boolean {
  return /italic|oblique/i.test(value)
}

function familyMatches(requirement: FontRequirement, font: LocalFontData): boolean {
  const family = normalized(requirement.family)
  const candidates = [font.family, font.fullName, font.postscriptName].map(normalized)
  return candidates.some(
    (candidate) => candidate === family || candidate.startsWith(family) || family.startsWith(candidate),
  )
}

export function localFontMatchScore(requirement: FontRequirement, font: LocalFontData): number {
  if (!familyMatches(requirement, font)) return Number.POSITIVE_INFINITY
  const wantedStyle = normalized(requirement.style)
  const actualStyle = normalized(font.style)
  const exactStyle = wantedStyle === actualStyle ? 0 : 1_000
  const weightDistance = Math.abs(styleWeight(requirement.style) - styleWeight(font.style))
  const italicPenalty = isItalic(requirement.style) === isItalic(font.style) ? 0 : 10_000
  const exactFamily = normalized(requirement.family) === normalized(font.family) ? 0 : 100
  return exactStyle + weightDistance + italicPenalty + exactFamily
}

export function rankLocalFonts(
  requirement: FontRequirement,
  fonts: readonly LocalFontData[],
): LocalFontData[] {
  return fonts
    .map((font) => ({ font, score: localFontMatchScore(requirement, font) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score || left.font.fullName.localeCompare(right.font.fullName))
    .map((entry) => entry.font)
}

function fileExtension(blob: Blob): 'otf' | 'ttf' {
  return /opentype|otf/i.test(blob.type) ? 'otf' : 'ttf'
}

async function parseLocalFont(font: LocalFontData): Promise<ParsedFontFile> {
  const blob = await font.blob()
  const file = new File([blob], `${font.postscriptName}.${fileExtension(blob)}`, { type: blob.type })
  return parseFontFile(file)
}

function safeFontErrorMessage(error: unknown): string {
  return error instanceof UserFacingError ? error.message : '字体文件无法读取或解析'
}

export function supportsLocalFontAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as LocalFontWindow).queryLocalFonts === 'function'
}

export async function resolveLocalFonts(
  requirements: readonly FontRequirement[],
): Promise<LocalFontResolution> {
  if (requirements.length === 0) return { mappings: new Map(), warnings: [], unresolved: [] }
  if (!supportsLocalFontAccess()) {
    throw new UserFacingError(
      'FONT_UNAVAILABLE',
      '无法读取系统字体，请使用最新版 Figma Desktop，并确认设计稿字体已安装。',
    )
  }
  const queryLocalFonts = (window as LocalFontWindow).queryLocalFonts!

  let available: LocalFontData[]
  try {
    available = await queryLocalFonts.call(window)
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new UserFacingError('FONT_UNAVAILABLE', 'Figma 未允许读取系统字体，请允许本地字体访问后重试。')
    }
    throw new UserFacingError('FONT_UNAVAILABLE', '自动读取系统字体失败，请重新打开 Figma Desktop 后重试。')
  }

  const mappings = new Map<string, FontMapping>()
  const warnings: ExportWarning[] = []
  const unresolved: FontRequirement[] = []
  const parsedByPostScriptName = new Map<string, Promise<ParsedFontFile>>()

  for (const requirement of requirements) {
    const candidates = rankLocalFonts(requirement, available)
    if (candidates.length === 0) {
      unresolved.push(requirement)
      continue
    }

    let selected: ParsedCandidate | null = null
    let lastFailure = ''
    for (const candidate of candidates) {
      try {
        let pending = parsedByPostScriptName.get(candidate.postscriptName)
        if (!pending) {
          pending = parseLocalFont(candidate)
          parsedByPostScriptName.set(candidate.postscriptName, pending)
        }
        const parsed = await pending
        if (!isFontEmbeddingAllowed(parsed.embeddingPermission)) {
          lastFailure = `字体许可为 ${parsed.embeddingPermission}`
          continue
        }
        const missing = missingCodePoints(requirement, parsed)
        if (missing.length > 0) {
          lastFailure = `缺少 ${missing.length} 个字形`
          continue
        }
        selected = { data: candidate, parsed }
        break
      } catch (error) {
        lastFailure = safeFontErrorMessage(error)
      }
    }

    if (!selected) {
      unresolved.push(requirement)
      warnings.push({
        code: 'LOCAL_FONT_UNAVAILABLE',
        severity: 'warning',
        message: `${requirement.family} ${requirement.style} 无法使用本机字体：${lastFailure || '没有可用字体文件'}。`,
      })
      continue
    }

    mappings.set(requirement.key, { kind: 'embedded', requirement, font: selected.parsed })
    appendCandidateWarnings(requirement, selected, warnings)
  }

  return { mappings, warnings, unresolved }
}

function appendCandidateWarnings(
  requirement: FontRequirement,
  selected: ParsedCandidate,
  warnings: ExportWarning[],
): void {
  if (normalized(requirement.style) !== normalized(selected.data.style)) {
    warnings.push({
      code: 'LOCAL_FONT_STYLE_FALLBACK',
      severity: 'warning',
      message: `${requirement.family} ${requirement.style} 自动匹配为 ${selected.data.fullName} (${selected.data.style})。`,
    })
  }
  if (selected.parsed.embeddingPermission === 'unknown') {
    warnings.push({
      code: 'FONT_PERMISSION_UNKNOWN',
      severity: 'warning',
      message: `${selected.data.fullName} 未声明 OS/2 嵌入权限，请自行核对字体授权。`,
    })
  }
}
