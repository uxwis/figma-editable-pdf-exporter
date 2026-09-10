import { describe, expect, it } from 'vitest'
import {
  UserFacingError,
  makeFontKey,
  sanitizeFileName,
  sortFrames,
  toUserFacingError,
  uniqueCharacters,
} from '../src/shared'

describe('shared helpers', () => {
  it('sorts frames from top to bottom and then left to right', () => {
    const frames = [
      { name: 'C', x: 300, y: 100, height: 80 },
      { name: 'A', x: 10, y: 10, height: 80 },
      { name: 'B', x: 200, y: 10, height: 80 },
    ]
    expect(sortFrames(frames).map((frame) => frame.name)).toEqual(['A', 'B', 'C'])
  })

  it('creates stable font keys and unique unicode character lists', () => {
    expect(makeFontKey('Inter', 'Regular')).toBe('Inter\u0000Regular')
    expect(uniqueCharacters('A中A文中')).toBe('A中文')
  })

  it('sanitizes Windows file names', () => {
    expect(sanitizeFileName('A/B:*?')).toBe('A_B___')
  })

  it('preserves approved user messages and masks unexpected implementation errors', () => {
    const approved = new UserFacingError('PAGE_CHANGED', '页面已切换。')
    expect(toUserFacingError(approved)).toBe(approved)

    const masked = toUserFacingError(new TypeError("Cannot read properties of undefined (reading 'digest')"))
    expect(masked.code).toBe('EXPORT_FAILED')
    expect(masked.message).not.toContain('digest')
    expect(masked.message).toContain('重新扫描')
  })
})
