import { UserFacingError, type ExportWarning, type TextNodeMeta } from '../shared'
import { cumulativeTransform, IDENTITY_MATRIX, type Matrix } from './matrix'

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

function pathFallbackRun(meta: TextNodeMeta, container: Element | null, root: SVGSVGElement): SvgTextRun | null {
  const segment = meta.segments[0]
  if (!segment || !meta.characters) return null
  const styleElement = container?.querySelector('text') ?? container
  const fill = parseColor(styleElement ? inheritedStyle(styleElement, 'fill', root) : null, root) ?? {
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  }
  const radians = (-meta.fallback.rotation * Math.PI) / 180
  return {
    nodeKey: meta.key,
    text: meta.characters,
    fontKey: segment.fontKey,
    fontSize: segment.fontSize,
    x: meta.fallback.x,
    y: meta.fallback.y + segment.fontSize,
    dx: 0,
    dy: 0,
    letterSpacing: 0,
    transform: {
      a: Math.cos(radians),
      b: Math.sin(radians),
      c: -Math.sin(radians),
      d: Math.cos(radians),
      e: 0,
      f: 0,
    },
    fill,
    stroke: null,
    strokeWidth: 0,
    opacity: 1,
    textAnchor: 'start',
  }
}

export function parseSvgText(svg: string, textNodes: TextNodeMeta[]): ParsedSvgText {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const parserError = document.querySelector('parsererror')
  if (parserError) throw new UserFacingError('SVG_PARSE', 'Figma 文字定位数据无法解析，请重新扫描后重试。')
  const root = document.documentElement as unknown as SVGSVGElement
  const runs: SvgTextRun[] = []
  const warnings: ExportWarning[] = []

  for (const meta of textNodes) {
    const container = findNodeContainer(root, meta.key)
    if (meta.nodeType === 'TEXT_PATH') {
      const fallback = pathFallbackRun(meta, container, root)
      if (fallback) runs.push(fallback)
      continue
    }
    if (!container) continue
    let textOffset = 0
    const leaves = textLeaves(container)
    for (const leaf of leaves) {
      const text = leaf.textContent ?? ''
      if (!text) continue
      const segment = segmentForOffset(meta, textOffset)
      if (!segment) continue
      const fontSize = parseLength(inheritedStyle(leaf, 'font-size', root), segment.fontSize, segment.fontSize)
      const fillOpacity = Number.parseFloat(inheritedStyle(leaf, 'fill-opacity', root) ?? '1')
      const strokeOpacity = Number.parseFloat(inheritedStyle(leaf, 'stroke-opacity', root) ?? '1')
      const fill = parseColor(inheritedStyle(leaf, 'fill', root) ?? '#000000', root)
      const stroke = parseColor(inheritedStyle(leaf, 'stroke', root), root)
      if (fill) fill.a *= Number.isFinite(fillOpacity) ? clamp(fillOpacity) : 1
      if (stroke) stroke.a *= Number.isFinite(strokeOpacity) ? clamp(strokeOpacity) : 1
      const anchorValue = inheritedStyle(leaf, 'text-anchor', root)
      const textAnchor = anchorValue === 'middle' || anchorValue === 'end' ? anchorValue : 'start'
      runs.push({
        nodeKey: meta.key,
        text,
        fontKey: segment.fontKey,
        fontSize,
        x: firstNumber(leaf.getAttribute('x')) ?? firstNumber(container.getAttribute('x')),
        y: firstNumber(leaf.getAttribute('y')) ?? firstNumber(container.getAttribute('y')),
        dx: parseLength(leaf.getAttribute('dx'), fontSize),
        dy: parseLength(leaf.getAttribute('dy'), fontSize),
        letterSpacing: parseLength(inheritedStyle(leaf, 'letter-spacing', root), fontSize),
        transform: cumulativeTransform(leaf, root),
        fill,
        stroke,
        strokeWidth: parseLength(inheritedStyle(leaf, 'stroke-width', root), fontSize),
        opacity: cumulativeOpacity(leaf, root),
        textAnchor,
      })
      textOffset += text.length
    }
    if (leaves.length === 0 && meta.characters) {
      warnings.push({
        code: 'SVG_TEXT_FALLBACK',
        severity: 'warning',
        nodeKey: meta.key,
        message: `文字层 ${meta.key} 未产生标准 SVG 文本，将使用边界框简化定位。`,
      })
      const segment = meta.segments[0]
      if (segment) {
        runs.push({
          nodeKey: meta.key,
          text: meta.characters,
          fontKey: segment.fontKey,
          fontSize: segment.fontSize,
          x: meta.fallback.x,
          y: meta.fallback.y + segment.fontSize,
          dx: 0,
          dy: 0,
          letterSpacing: 0,
          transform: { ...IDENTITY_MATRIX },
          fill: { r: 0, g: 0, b: 0, a: 1 },
          stroke: null,
          strokeWidth: 0,
          opacity: 1,
          textAnchor: 'start',
        })
      }
    }
  }

  return { viewBox: parseViewBox(root), runs, warnings }
}
