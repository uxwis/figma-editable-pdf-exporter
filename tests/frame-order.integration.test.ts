import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { afterEach, expect, it, vi } from 'vitest'
import { createEditablePdfArtifact } from '../src/export/workflow'
import type { PluginToUiMessage, UiToPluginMessage } from '../src/shared'
import { nativeFrames, nativeOrder } from './fixtures/native-frame-order'

afterEach(() => vi.unstubAllGlobals())

it.each([
  {
    name: 'misaligned rows and moved frames',
    positions: [
      { id: 'bottom-right', name: 'A', x: 0, y: 352, width: 104, height: 240 },
      { id: 'top-right', name: 'B', x: 0, y: 0, width: 102, height: 240 },
      { id: 'bottom-left', name: 'C', x: -400, y: 360, width: 103, height: 240 },
      { id: 'top-left', name: 'D', x: -400, y: 12, width: 101, height: 240 },
    ],
    initialOrder: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    move: { id: 'top-left', y: 800 },
    expectedOrder: ['top-right', 'bottom-left', 'bottom-right', 'top-left'],
  },
  {
    name: 'user-confirmed Figma native PDF reference',
    positions: nativeFrames,
    initialOrder: nativeOrder,
    move: null,
    expectedOrder: nativeOrder,
  },
])('preserves $name through scanning and PDF merging', async ({ positions, initialOrder, move, expectedOrder }) => {
  vi.resetModules()
  const messages: PluginToUiMessage[] = []
  const pluginUi = {
    postMessage: (message: PluginToUiMessage) => messages.push(message),
    onmessage: (_message: UiToPluginMessage) => {},
  }
  const cleanup = vi.fn()
  const frames = positions.map((position) => ({
    ...position,
    type: 'FRAME',
    visible: true,
    parent: null as unknown,
    findAll: () => [],
    clone: () => ({
      visible: true,
      removed: false,
      x: 0,
      findOne: () => null,
      findAll: () => [],
      remove: cleanup,
      exportAsync: async ({ format }: { format: string }) => {
        if (format === 'SVG_STRING') {
          return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${position.width} ${position.height}"/>`
        }
        const pdf = await PDFDocument.create()
        const pdfPage = pdf.addPage([position.width, position.height])
        pdfPage.node.set(PDFName.of('TestFrameId'), PDFString.of(position.id))
        return pdf.save()
      },
    }),
  }))
  const page = {
    id: 'page',
    name: 'Canvas order',
    children: frames,
    loadAsync: async () => {},
    findOne: (predicate: (frame: typeof frames[number]) => boolean) => frames.find(predicate),
  }
  frames.forEach((frame) => { frame.parent = page })
  vi.stubGlobal('__html__', '')
  vi.stubGlobal('figma', { showUI: vi.fn(), ui: pluginUi, currentPage: page, on: vi.fn() })
  await import('../src/code')

  async function exchange<T extends PluginToUiMessage['type']>(request: UiToPluginMessage, type: T) {
    const start = messages.length
    pluginUi.onmessage(request)
    await vi.waitFor(() => {
      expect(messages.slice(start).find((message) => message.type === 'error')).toBeUndefined()
      expect(messages.slice(start).some((message) => message.type === type)).toBe(true)
    })
    return messages.slice(start).find((message) => message.type === type) as Extract<PluginToUiMessage, { type: T }>
  }

  const initial = await exchange({ type: 'ready' }, 'scan-result')
  expect(initial.result.frames.map((frame) => frame.id)).toEqual(initialOrder)

  if (move) frames.find((frame) => frame.id === move.id)!.y = move.y
  const fresh = await exchange({ type: 'scan', requestId: 7 }, 'scan-result')
  expect(fresh.requestId).toBe(7)
  expect(fresh.result.frames.map((frame) => [frame.id, frame.pageNumber])).toEqual(
    expectedOrder.map((id, index) => [id, index + 1]),
  )
  const artifact = await createEditablePdfArtifact({
    scan: fresh.result,
    requestPage: async (frameId, pageNumber, totalPages) => (
      await exchange({ type: 'export-page', pageId: page.id, frameId, pageNumber, totalPages }, 'page-assets')
    ).assets,
    isCancelled: () => false,
    setStatus: () => {},
  })
  const exported = await PDFDocument.load(artifact.pdfBytes)
  expect(exported.getPages().map((pdfPage) => pdfPage.node.lookup(PDFName.of('TestFrameId'), PDFString).decodeText()))
    .toEqual(expectedOrder)
  expect(exported.getPages().map((pdfPage) => [pdfPage.getWidth(), pdfPage.getHeight()])).toEqual(
    expectedOrder.map((id) => {
      const frame = positions.find((position) => position.id === id)!
      return [frame.width, frame.height]
    }),
  )
  expect(cleanup).toHaveBeenCalledTimes(positions.length)
})
