import { describe, expect, it } from 'vitest'
import { applyMatrix, multiplyMatrices, parseTransform } from '../src/export/matrix'

describe('SVG matrix helpers', () => {
  it('parses and applies translate plus rotate', () => {
    const matrix = parseTransform('translate(10 20) rotate(90)')
    const point = applyMatrix(matrix, 2, 0)
    expect(point.x).toBeCloseTo(10)
    expect(point.y).toBeCloseTo(22)
  })

  it('multiplies affine matrices in SVG order', () => {
    const result = multiplyMatrices(parseTransform('translate(10 0)'), parseTransform('scale(2)'))
    expect(applyMatrix(result, 3, 0).x).toBeCloseTo(16)
  })
})
