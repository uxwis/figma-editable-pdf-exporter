import { describe, expect, it } from 'vitest'
import { parseColor, parseSvgText } from '../src/export/svg-text'
import type { TextNodeMeta } from '../src/shared'

const meta: TextNodeMeta = {
  key: 'epdf_p1_t0',
  nodeType: 'TEXT',
  characters: 'Hello',
  segments: [
    {
      start: 0,
      end: 5,
      characters: 'Hello',
      fontKey: 'Inter\u0000Regular',
      fontSize: 20,
      fontWeight: 400,
      fontStyle: 'REGULAR',
    },
  ],
  fallback: { x: 0, y: 0, width: 60, height: 24, rotation: 0 },
}

describe('SVG text extraction', () => {
  it('extracts positioned tspans, inherited style, spacing and transforms', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
        <g id="epdf_p1_t0" transform="translate(4 5)" fill="#336699" opacity="0.5">
          <text font-size="20" letter-spacing="0.1em"><tspan x="10" y="30">Hello</tspan></text>
        </g>
      </svg>`
    const parsed = parseSvgText(svg, [meta])
    expect(parsed.viewBox).toEqual({ x: 0, y: 0, width: 200, height: 100 })
    expect(parsed.runs).toHaveLength(1)
    expect(parsed.runs[0]).toMatchObject({
      text: 'Hello',
      x: 10,
      y: 30,
      fontSize: 20,
      letterSpacing: 2,
      opacity: 0.5,
    })
    expect(parsed.runs[0].fill).toMatchObject({ r: 0.2, g: 0.4, b: 0.6, a: 1 })
    expect(parsed.runs[0].transform.e).toBe(4)
    expect(parsed.runs[0].transform.f).toBe(5)
  })

  it('requests native outlines for gradient text instead of flattening its color', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs><linearGradient id="g"><stop stop-color="#ff0000"/></linearGradient></defs>
        <text id="epdf_p1_t0" fill="url(#g)"><tspan x="0" y="20">Hello</tspan></text>
      </svg>`
    const parsed = parseSvgText(svg, [meta])
    expect(parsed.runs).toEqual([])
    expect(parsed.outlinedTextKeys).toEqual([meta.key])
  })

  it('parses rgba colors', () => {
    expect(parseColor('rgba(255, 128, 0, .25)')).toMatchObject({ r: 1, b: 0, a: 0.25 })
  })
})
