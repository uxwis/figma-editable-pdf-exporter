import { UserFacingError, type ExportWarning, type TextNodeMeta } from '../shared'
import { cumulativeTransform, type Matrix } from './matrix'

export interface RgbColor {
  r: number
  g: number
  b: number
  a: number
}

export interface SvgViewBox {
  x: number
  y: number
  width: number
  height: number
}

export interface SvgTextRun {
  nodeKey: string
  text: string
  fontKey: string
  fontSize: number
  x: number | null
  y: number | null
  dx: number
  dy: number
  letterSpacing: number
  transform: Matrix
  fill: RgbColor | null
  stroke: RgbColor | null
  strokeWidth: number
  opacity: number
  textAnchor: 'start' | 'middle' | 'end'
}

export interface ParsedSvgText {
  viewBox: SvgViewBox
  runs: SvgTextRun[]
  outlinedTextKeys: string[]
  warnings: ExportWarning[]
}

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  transparent: '#00000000',
}

function parseStyleAttribute(element: Element): Map<string, string> {
  const result = new Map<string, string>()
  const value = element.getAttribute('style')
  if (!value) return result
  value.split(';').forEach((declaration) => {
    const separator = declaration.indexOf(':')
    if (separator < 0) return
    const name = declaration.slice(0, separator).trim().toLowerCase()
    const content = declaration.slice(separator + 1).trim()
    if (name && content) result.set(name, content)
  })
  return result
}

function ownStyle(element: Element, property: string): string | null {
  return parseStyleAttribute(element).get(property) ?? element.getAttribute(property)
}

function inheritedStyle(element: Element, property: string, stopAt: Element): string | null {
  let current: Element | null = element
  while (current) {
    const value = ownStyle(current, property)
    if (value !== null) return value
    if (current === stopAt) break
    current = current.parentElement
  }
  return null
}

function firstNumber(value: string | null): number | null {
  if (!value) return null
  const number = Number(value.trim().split(/[\s,]+/)[0])
  return Number.isFinite(number) ? number : null
}

function parseLength(value: string | null, fontSize: number, fallback = 0): number {
  if (!value) return fallback
  const trimmed = value.trim()
  const number = Number.parseFloat(trimmed)
  if (!Number.isFinite(number)) return fallback
  if (trimmed.endsWith('em')) return number * fontSize
  if (trimmed.endsWith('%')) return (number / 100) * fontSize
  return number
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function parseHexColor(value: string): RgbColor | null {
  const hex = value.slice(1)
  if (![3, 4, 6, 8].includes(hex.length)) return null
  const expanded = hex.length <= 4 ? Array.from(hex, (character) => character + character).join('') : hex
  const hasAlpha = expanded.length === 8
  const number = Number.parseInt(expanded, 16)
  if (!Number.isFinite(number)) return null
  return {
    r: ((number >>> (hasAlpha ? 24 : 16)) & 255) / 255,
    g: ((number >>> (hasAlpha ? 16 : 8)) & 255) / 255,
    b: ((number >>> (hasAlpha ? 8 : 0)) & 255) / 255,
    a: hasAlpha ? (number & 255) / 255 : 1,
  }
}

function parseFunctionalColor(value: string): RgbColor | null {
  const match = value.match(/^rgba?\((.*)\)$/i)
  if (!match) return null
  const parts = match[1].split(/[\s,\/]+/).filter(Boolean)
  if (parts.length < 3) return null
  const channels = parts.slice(0, 3).map((part) => {
    const number = Number.parseFloat(part)
    return part.endsWith('%') ? (number / 100) * 255 : number
  })
  if (channels.some((channel) => !Number.isFinite(channel))) return null
  const alpha = parts[3] === undefined ? 1 : Number.parseFloat(parts[3])
  return {
    r: clamp(channels[0] / 255),
    g: clamp(channels[1] / 255),
    b: clamp(channels[2] / 255),
    a: Number.isFinite(alpha) ? clamp(alpha) : 1,
  }
}

function gradientFallback(value: string, root: SVGSVGElement): string | null {
  const match = value.match(/^url\(#([^)]+)\)$/)
  if (!match) return null
  const gradient = root.querySelector(`[id="${match[1].replace(/"/g, '\\"')}"]`)
  const stop = gradient?.querySelector('stop')
  return stop ? ownStyle(stop, 'stop-color') ?? '#000000' : null
}

export function parseColor(value: string | null, root?: SVGSVGElement): RgbColor | null {
  if (!value || value === 'none') return null
  let normalized = value.trim().toLowerCase()
  if (root && normalized.startsWith('url(')) normalized = gradientFallback(normalized, root) ?? '#000000'
  normalized = NAMED_COLORS[normalized] ?? normalized
  if (normalized.startsWith('#')) return parseHexColor(normalized)
  return parseFunctionalColor(normalized)
}

function cumulativeOpacity(element: Element, stopAt: Element): number {
  let opacity = 1
  let current: Element | null = element
  while (current) {
    const own = ownStyle(current, 'opacity')
    if (own !== null) {
      const parsed = Number.parseFloat(own)
      if (Number.isFinite(parsed)) opacity *= clamp(parsed)
    }
    if (current === stopAt) break
    current = current.parentElement
  }
  return clamp(opacity)
}

function parseViewBox(root: SVGSVGElement): SvgViewBox {
  const values = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
    return { x: values[0], y: values[1], width: values[2], height: values[3] }
  }
  const width = parseLength(root.getAttribute('width'), 1, 1)
  const height = parseLength(root.getAttribute('height'), 1, 1)
  return { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) }
}

function textLeaves(container: Element): Element[] {
  const tspans = Array.from(container.querySelectorAll('tspan')).filter(
    (element) => element.querySelector('tspan') === null,
  )
  if (tspans.length > 0) return tspans
  if (container.tagName.toLowerCase() === 'text') return [container]
  return Array.from(container.querySelectorAll('text'))
}

function segmentForOffset(meta: TextNodeMeta, offset: number) {
  return (
    meta.segments.find((segment) => offset >= segment.start && offset < segment.end) ??
    meta.segments[meta.segments.length - 1]
  )
}

function findNodeContainer(root: SVGSVGElement, key: string): Element | null {
  return Array.from(root.querySelectorAll('[id]')).find((element) => element.id === key) ?? null
}

function hasUnsupportedSvgStyle(leaf: Element, root: SVGSVGElement): boolean {
  for (const property of ['fill', 'stroke', 'filter', 'mask']) {
    const value = inheritedStyle(leaf, property, root)?.trim()
    if (!value || value === 'none') continue
    if (property !== 'fill' || value.startsWith('url(')) return true
  }
  for (const property of ['rotate', 'textLength', 'lengthAdjust', 'writing-mode', 'text-decoration']) {
    const value = inheritedStyle(leaf, property, root)
    if (value && value !== 'none' && value !== '0' && value !== 'horizontal-tb') return true
  }
  // PDF cursor positioning cannot reproduce per-glyph SVG coordinate lists.
  for (const property of ['x', 'y', 'dx', 'dy']) {
    const value = inheritedStyle(leaf, property, root)?.trim()
    if (value && value.split(/[\s,]+/).length > 1) return true
  }
  return false
}

function withoutWhitespace(text: string): string {
  return text.replace(/\s/g, '')
}

export function parseSvgText(svg: string, textNodes: TextNodeMeta[]): ParsedSvgText {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (document.querySelector('parsererror')) {
    throw new UserFacingError('SVG_PARSE', 'Figma 文字定位数据无法解析，请重新扫描后重试。')
  }
  const root = document.documentElement as unknown as SVGSVGElement
  const runs: SvgTextRun[] = []
  const warnings: ExportWarning[] = []
  const outlinedTextKeys: string[] = []

  function outline(meta: TextNodeMeta): void {
    outlinedTextKeys.push(meta.key)
    warnings.push({
      code: 'TEXT_OUTLINED_SVG',
      severity: 'warning',
      nodeKey: meta.key,
      message: `文字层 ${meta.key} 无法可靠重建，将保留 Figma 原生转曲结果。`,
    })
  }

  for (const meta of textNodes) {
    if (!withoutWhitespace(meta.characters)) continue
    const container = findNodeContainer(root, meta.key)
    if (!container || meta.nodeType === 'TEXT_PATH'
      || !['g', 'text'].includes(container.tagName.toLowerCase())
      || container.querySelector('path, use, image, textPath, foreignObject')) {
      outline(meta)
      continue
    }
    const leaves = textLeaves(container)
    if (leaves.length === 0
      || withoutWhitespace(leaves.map((leaf) => leaf.textContent ?? '').join('')) !== withoutWhitespace(meta.characters)) {
      outline(meta)
      continue
    }

    // Validate the entire node before adding any runs. Partial reconstruction
    // must not cause missing glyphs or duplicate text over native outlines.
    const nodeRuns: SvgTextRun[] = []
    let textOffset = 0
    let unsupported = false
    for (const leaf of leaves) {
      const text = leaf.textContent ?? ''
      if (!text) continue
      const start = meta.characters.indexOf(text, textOffset)
      const segment = segmentForOffset(meta, start)
      if (start < 0 || withoutWhitespace(meta.characters.slice(textOffset, start))
        || !segment || hasUnsupportedSvgStyle(leaf, root)
        || meta.segments.some((other) => other.start < start + text.length && other.end > start
          && (other.fontKey !== segment.fontKey || other.fontSize !== segment.fontSize))) {
        unsupported = true
        break
      }
      const fontSize = parseLength(inheritedStyle(leaf, 'font-size', root), segment.fontSize, segment.fontSize)
      const fillOpacity = Number.parseFloat(inheritedStyle(leaf, 'fill-opacity', root) ?? '1')
      const fill = parseColor(inheritedStyle(leaf, 'fill', root) ?? '#000000', root)
      if (!fill || fontSize <= 0) {
        unsupported = true
        break
      }
      fill.a *= Number.isFinite(fillOpacity) ? clamp(fillOpacity) : 1
      const anchorValue = inheritedStyle(leaf, 'text-anchor', root)
      const textAnchor = anchorValue === 'middle' || anchorValue === 'end' ? anchorValue : 'start'
      nodeRuns.push({
        nodeKey: meta.key,
        text,
        fontKey: segment.fontKey,
        fontSize,
        x: firstNumber(inheritedStyle(leaf, 'x', container)),
        y: firstNumber(inheritedStyle(leaf, 'y', container)),
        dx: parseLength(leaf.getAttribute('dx'), fontSize),
        dy: parseLength(leaf.getAttribute('dy'), fontSize),
        letterSpacing: parseLength(inheritedStyle(leaf, 'letter-spacing', root), fontSize),
        transform: cumulativeTransform(leaf, root),
        fill,
        stroke: null,
        strokeWidth: 0,
        opacity: cumulativeOpacity(leaf, root),
        textAnchor,
      })
      textOffset = start + text.length
    }
    if (unsupported || nodeRuns.length === 0) outline(meta)
    else runs.push(...nodeRuns)
  }

  return { viewBox: parseViewBox(root), runs, outlinedTextKeys, warnings }
}
