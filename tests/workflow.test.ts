import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateEditablePdf } from '../src/export/pdf'
import { resolveFonts } from '../src/export/resolve-fonts'
import { createEditablePdfArtifact } from '../src/export/workflow'
import { EXPORT_CANCELLED, type PageExportAssets, type ScanResult } from '../src/shared'

vi.mock('../src/export/resolve-fonts', () => ({ resolveFonts: vi.fn() }))
vi.mock('../src/export/pdf', () => ({ generateEditablePdf: vi.fn() }))

const scan: ScanResult = {
  pageId: 'page',
  pageName: 'Example',
  frames: [
    { id: 'a', name: 'A', pageNumber: 1, x: 0, y: 0, width: 100, height: 100, textCount: 1, hidden: false },
    { id: 'b', name: 'B', pageNumber: 2, x: 0, y: 100, width: 100, height: 100, textCount: 1, hidden: false },
  ],
  fonts: [],
  warnings: [{ code: 'DUPLICATE', severity: 'warning', message: 'same warning' }],
}

function page(frameId: string, pageNumber: number): PageExportAssets {
  return {
    frameId,
    frameName: frameId,
    pageNumber,
    svg: '<svg/>',
    backgroundPdf: new Uint8Array(),
    textNodes: [],
    warnings: [],
  }
}

describe('editable PDF workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveFonts).mockResolvedValue({
      mappings: new Map(),
      warnings: [{ code: 'DUPLICATE', severity: 'warning', message: 'same warning' }],
    })
    vi.mocked(generateEditablePdf).mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      warnings: [],
    })
  })

  it('requests every frame in page order and deduplicates warnings', async () => {
    const requestPage = vi.fn(async (frameId: string, pageNumber: number) => page(frameId, pageNumber))
    const statuses: string[] = []

    const artifact = await createEditablePdfArtifact({
      scan,
      requestPage,
      isCancelled: () => false,
      setStatus: (status) => statuses.push(status),
    })

    expect(requestPage.mock.calls.map((call) => call.slice(0, 2))).toEqual([['a', 1], ['b', 2]])
    expect(generateEditablePdf).toHaveBeenCalledWith([page('a', 1), page('b', 2)], new Map())
    expect(artifact.warnings).toHaveLength(1)
    expect(statuses[statuses.length - 1]).toBe('正在写入可编辑文字并合并 PDF…')
  })

  it('stops before font work when already cancelled', async () => {
    await expect(createEditablePdfArtifact({
      scan,
      requestPage: vi.fn(),
      isCancelled: () => true,
      setStatus: vi.fn(),
    })).rejects.toThrow(EXPORT_CANCELLED)
    expect(resolveFonts).not.toHaveBeenCalled()
  })

  it('resolves fonts only for confirmed editable text in exported page assets', async () => {
    const requestPage = vi.fn(async (frameId: string, pageNumber: number) => ({
      ...page(frameId, pageNumber),
      textNodes: pageNumber === 1 ? [{
        key: 'editable', nodeType: 'TEXT' as const, characters: 'New',
        segments: [{ start: 0, end: 3, characters: 'New', fontKey: 'Updated font\u0000Bold', fontSize: 20, fontWeight: 700, fontStyle: 'BOLD' }],
        fallback: { x: 0, y: 0, width: 50, height: 24, rotation: 0 },
      }] : [],
    }))
    await createEditablePdfArtifact({
      scan: { ...scan, fonts: [{ key: 'Outlined font\u0000Regular', family: 'Outlined font', style: 'Regular', characters: 'Old', pages: [2], hasMissingFont: false }] },
      requestPage, isCancelled: () => false, setStatus: vi.fn(),
    })
    expect(resolveFonts).toHaveBeenCalledWith([{
      key: 'Updated font\u0000Bold', family: 'Updated font', style: 'Bold', characters: 'New', pages: [1], hasMissingFont: false,
    }])
  })
})
