import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSvgText } from '../src/export/svg-text'
import { textOutlineReason } from '../src/text-compatibility'
import type { TextNodeMeta } from '../src/shared'

const meta: TextNodeMeta = {
  key: 'text', nodeType: 'TEXT', characters: 'Hello',
  segments: [{ start: 0, end: 5, characters: 'Hello', fontKey: 'Inter\u0000Regular', fontSize: 20, fontWeight: 400, fontStyle: 'REGULAR' }],
  fallback: { x: 0, y: 0, width: 100, height: 30, rotation: 0 },
}
const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">${body}</svg>`

describe('SVG native-outline safety', () => {
  it.each([
    ['missing node', '<g/>'],
    ['vector-only text', '<g id="text"><path d="M0 0L10 10"/></g>'],
    ['stroke-only text', '<text id="text" fill="none" stroke="#000" stroke-width="2">Hello</text>'],
    ['fill plus stroke', '<text id="text" fill="#fff" stroke="#000" stroke-width="2">Hello</text>'],
    ['partial text', '<text id="text">Hell</text>'],
    ['partial vectors', '<g id="text"><text>Hello</text><path d="M0 0L10 10"/></g>'],
    ['masked text', '<g mask="url(#m)"><text id="text">Hello</text></g>'],
    ['filtered text', '<text id="text" filter="url(#f)">Hello</text>'],
    ['unparsed paint', '<text id="text" fill="currentColor">Hello</text>'],
    ['position lists', '<text id="text" x="0 10 25 40 60">Hello</text>'],
    ['per-glyph rotations', '<text id="text" rotate="0 20 0 30 0">Hello</text>'],
  ])('preserves %s as outlines instead of dropping or approximating it', (_label, body) => {
    const parsed = parseSvgText(wrap(body), [meta])
    expect(parsed.runs).toEqual([])
    expect(parsed.outlinedTextKeys).toEqual(['text'])
  })

  it('keeps valid neighboring text editable when a different node needs outlines', () => {
    const parsed = parseSvgText(wrap('<text id="good" x="10" y="30">Hello</text>'), [meta, { ...meta, key: 'good' }])
    expect(parsed.outlinedTextKeys).toEqual(['text'])
    expect(parsed.runs.map((run) => run.nodeKey)).toEqual(['good'])
  })

  it('maps styles correctly after SVG omits a line break', () => {
    const multiline: TextNodeMeta = {
      ...meta, characters: 'Hello\nWorld', segments: [
        meta.segments[0],
        { ...meta.segments[0], start: 6, end: 11, characters: 'World', fontKey: 'Inter\u0000Bold' },
      ],
    }
    const parsed = parseSvgText(wrap('<g id="text"><text x="10"><tspan y="25">Hello</tspan><tspan y="50">World</tspan></text></g>'), [multiline])
    expect(parsed.outlinedTextKeys).toEqual([])
    expect(parsed.runs.map((run) => [run.x, run.y, run.fontKey])).toEqual([
      [10, 25, 'Inter\u0000Regular'], [10, 50, 'Inter\u0000Bold'],
    ])
  })

  it('does not reconstruct part of a text node when a later run is unsupported', () => {
    const parsed = parseSvgText(wrap('<text id="text"><tspan>He</tspan><tspan stroke="red">llo</tspan></text>'), [meta])
    expect(parsed.runs).toEqual([])
    expect(parsed.outlinedTextKeys).toEqual(['text'])
  })
})

describe('Figma text compatibility', () => {
  afterEach(() => vi.unstubAllGlobals())

  function reason(overrides: Record<string, unknown>, rootOverrides: Record<string, unknown> = {}) {
    vi.stubGlobal('figma', { mixed: Symbol('mixed') })
    const root = { type: 'FRAME', effects: [], blendMode: 'PASS_THROUGH', ...rootOverrides }
    const node = {
      type: 'TEXT', hasMissingFont: false, strokes: [], fills: [{ type: 'SOLID' }],
      textDecoration: 'NONE', textTruncation: 'DISABLED', effects: [], blendMode: 'NORMAL',
      parent: root, ...overrides,
    }
    return textOutlineReason(node as unknown as TextNode, root as unknown as FrameNode)
  }

  it('keeps ordinary solid text editable', () => expect(reason({})).toBeNull())
  it.each([
    [{ strokes: [{ type: 'SOLID' }] }, '描边文字'],
    [{ strokes: [{ type: 'SOLID' }], fills: [] }, '描边文字'],
    [{ fills: [{ type: 'GRADIENT_LINEAR' }] }, '渐变、图片或多重填充文字'],
    [{ type: 'TEXT_PATH' }, '路径文字'],
    [{ hasMissingFont: true }, '缺失字体的文字'],
    [{ effects: [{ type: 'DROP_SHADOW' }] }, '带阴影、模糊等效果的文字'],
    [{ textDecoration: 'UNDERLINE' }, '带装饰线的文字'],
    [{ isMask: true }, '蒙版文字'],
  ])('retains unsupported styles in the native PDF', (overrides, expected) => {
    expect(reason(overrides)).toBe(expected)
  })
  it('ignores disabled strokes', () => expect(reason({ strokes: [{ visible: false }] })).toBeNull())
  it('preserves parent effects', () => expect(reason({}, { effects: [{ type: 'LAYER_BLUR' }] })).toContain('效果'))
})
