import { describe, expect, it } from 'vitest'
import { sortFrames } from '../src/shared'
import { nativeFrames, nativeOrder } from './fixtures/native-frame-order'

describe('canvas reading order', () => {
  it('matches the user-confirmed native PDF sequence on Page 8', () => {
    expect(sortFrames(nativeFrames).map((frame) => frame.id)).toEqual(nativeOrder)
  })

  it.each([0.01, 0.5, 2, 100])('keeps native reference order after scaling by %s and moving the page', (scale) => {
    const frames = nativeFrames.map((frame, index) => ({
      ...frame,
      name: `Renamed ${index}`,
      x: frame.x * scale - 2000,
      y: frame.y * scale + 1000,
      height: frame.height * scale,
    }))
    expect(sortFrames(frames).map((frame) => frame.id)).toEqual(nativeOrder)
  })

  it('reads slightly misaligned rows left to right, regardless of layer order or names', () => {
    const frames = [
      { name: 'A', x: 500, y: 390, height: 300 },
      { name: 'B', x: 500, y: -10, height: 300 },
      { name: 'C', x: -100, y: 400, height: 300 },
      { name: 'D', x: -100, y: 0, height: 300 },
    ]
    // Every possible layer order must produce the same spatial order.
    function permutations<T>(items: T[]): T[][] {
      if (!items.length) return [[]]
      return items.flatMap((item, index) =>
        permutations(items.filter((_, other) => other !== index)).map((rest) => [item, ...rest]),
      )
    }
    for (const input of permutations(frames)) {
      expect(sortFrames(input).map((frame) => frame.name)).toEqual(['D', 'B', 'C', 'A'])
    }
  })

  it('uses full vertical spans for substantially staggered frames', () => {
    const frames = [
      { name: 'third', x: 0, y: 800, height: 1000 },
      { name: 'second', x: 100, y: 400, height: 1000 },
      { name: 'first', x: 200, y: 0, height: 1000 },
    ]
    expect(sortFrames(frames).map((frame) => frame.name)).toEqual(['third', 'second', 'first'])
  })

  it('keeps nearby rows of small frames separate', () => {
    const frames = [
      { name: 'bottom left', x: 0, y: 12, height: 10 },
      { name: 'top right', x: 50, y: 0, height: 10 },
      { name: 'top left', x: 0, y: 0.5, height: 10 },
    ]
    expect(sortFrames(frames).map((frame) => frame.name)).toEqual(['top left', 'top right', 'bottom left'])
  })

  it('handles intersecting frames with mixed heights without a fixed tolerance', () => {
    const frames = [
      { name: 'small', x: 0, y: 10, height: 40 },
      { name: 'large', x: 200, y: 0, height: 1000 },
    ]
    expect(sortFrames(frames).map((frame) => frame.name)).toEqual(['small', 'large'])
  })

  it('places vertically separated and just-touching frames in different rows', () => {
    const frames = [
      { name: 'bottom', x: -100, y: 100, height: 50 },
      { name: 'top right', x: 200, y: 0, height: 100 },
      { name: 'top left', x: 0, y: 0, height: 40 },
    ]
    expect(sortFrames(frames).map((frame) => frame.name)).toEqual(['top left', 'top right', 'bottom'])
  })

  it('orders a single column vertically and preserves coincident frames without using names', () => {
    const frames = [
      { name: 'Z', x: -10, y: -100, height: 100 },
      { name: 'A', x: -10, y: -100, height: 100 },
      { name: 'B', x: -10, y: -99.5, height: 100 },
    ]
    const original = [...frames]
    expect(sortFrames(frames)).toEqual(original)
    expect(frames).toEqual(original)
    expect(sortFrames(frames)).not.toBe(frames)
  })

  it('sorts exact horizontal coordinates without a fuzzy comparator', () => {
    const frames = [{ x: 0.006, y: 0, height: 100 }, { x: 0.003, y: 0, height: 100 }, { x: 0, y: 0, height: 100 }]
    expect(sortFrames(frames).map((frame) => frame.x)).toEqual([0, 0.003, 0.006])
  })

  it('handles empty and single-frame pages', () => {
    expect(sortFrames([])).toEqual([])
    const frame = { x: 0, y: 0, height: 100 }
    expect(sortFrames([frame])).toEqual([frame])
  })
})
