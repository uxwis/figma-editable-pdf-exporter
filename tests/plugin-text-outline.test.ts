import { afterEach, expect, it, vi } from 'vitest'
import { parseSvgText } from '../src/export/svg-text'
import type { PluginToUiMessage, UiToPluginMessage } from '../src/shared'

const events = new Map<string, () => void>()
afterEach(() => {
  events.get('close')?.()
  events.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function setup(options: { respond?: boolean; svgFails?: boolean; nativeOnly?: boolean } = {}) {
  vi.resetModules()
  const makeText = (name: string, outlined = false) => ({
    name, sourceName: name, type: 'TEXT', characters: name, visible: true, opacity: 0.7,
    strokes: outlined ? [{ type: 'SOLID' }] : [], fills: [{ type: 'SOLID' }],
    effects: [], blendMode: 'NORMAL', textDecoration: 'NONE', textTruncation: 'DISABLED',
    hasMissingFont: false, rotation: 0, width: 100, height: 30, parent: null as unknown,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 30 },
    getStyledTextSegments: vi.fn(() => [{
      start: 0, end: name.length, characters: name, fontName: { family: 'Arial', style: 'Regular' },
      fontSize: 20, fontWeight: 400, fontStyle: 'REGULAR',
    }]),
  })
  const originals = options.nativeOnly ? [makeText('stroke', true)] : [makeText('normal'), makeText('stroke', true), makeText('missing')]
  const clones = originals.map((node) => ({ ...node }))
  const backgroundSnapshots: number[][] = []
  const analysisSnapshots: number[][] = []
  const remove = vi.fn()
  const clone = {
    x: 0, visible: true, removed: false, effects: [], blendMode: 'NORMAL',
    absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 200 },
    findOne: () => null,
    findAll: (predicate: (node: typeof clones[number]) => boolean) => clones.filter(predicate),
    remove,
    exportAsync: vi.fn(async ({ format }: { format: string }) => {
      if (format === 'SVG_STRING') {
        if (options.svgFails) throw new Error('SVG unavailable')
        // Simulate a Figma SVG that omitted one otherwise ordinary text node.
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">${clones
          .filter((node) => node.sourceName !== 'missing')
          .map((node) => `<text id="${node.name}" fill="#000" x="0" y="30">${node.characters}</text>`).join('')}</svg>`
      }
      backgroundSnapshots.push(clones.map((node) => node.opacity))
      return new Uint8Array([1, 2, 3])
    }),
  }
  remove.mockImplementation(() => { clone.removed = true })
  clones.forEach((node) => { node.parent = clone })
  const frame = {
    id: 'frame', type: 'FRAME', name: 'Example', visible: true, x: 0, y: 0, width: 300, height: 200,
    effects: [], blendMode: 'NORMAL', parent: null as unknown,
    findAll: (predicate: (node: typeof originals[number]) => boolean) => originals.filter(predicate),
    clone: () => clone,
  }
  originals.forEach((node) => { node.parent = frame })
  const page = { id: 'page', name: 'Page', children: [frame], loadAsync: async () => {}, findOne: () => frame }
  frame.parent = page
  const messages: PluginToUiMessage[] = []
  const ui = {
    onmessage: (_message: UiToPluginMessage) => {},
    postMessage(message: PluginToUiMessage) {
      messages.push(message)
      if (message.type === 'analyze-text') {
        analysisSnapshots.push(clones.map((node) => node.opacity))
        if (options.respond !== false) {
          const parsed = parseSvgText(message.svg, message.textNodes)
          ui.onmessage({ type: 'text-analysis', requestId: message.requestId,
            editableTextKeys: message.textNodes.filter((meta) => !parsed.outlinedTextKeys.includes(meta.key)).map((meta) => meta.key) })
        }
      }
    },
  }
  vi.stubGlobal('__html__', '')
  vi.stubGlobal('figma', { mixed: Symbol(), showUI: vi.fn(), currentPage: page, ui, on: (event: string, callback: () => void) => events.set(event, callback) })
  await import('../src/code')
  const sendExport = () => ui.onmessage({ type: 'export-page', pageId: 'page', frameId: 'frame', pageNumber: 1, totalPages: 1 })
  async function waitFor<T extends PluginToUiMessage['type']>(type: T) {
    await vi.waitFor(() => expect(messages.some((message) => message.type === type)).toBe(true))
    return messages.find((message) => message.type === type) as Extract<PluginToUiMessage, { type: T }>
  }
  return { ui, originals, clones, clone, messages, remove, backgroundSnapshots, analysisSnapshots, sendExport, waitFor }
}

it('hides only confirmed editable text and leaves stroke/missing SVG text in the native PDF', async () => {
  const plugin = await setup()
  plugin.sendExport()
  const result = await plugin.waitFor('page-assets')
  expect(plugin.analysisSnapshots).toEqual([[0.7, 0.7, 0.7]])
  expect(plugin.backgroundSnapshots).toEqual([[0, 0.7, 0.7]])
  expect(result.assets.textNodes.map((node) => node.characters)).toEqual(['normal'])
  expect(result.assets.warnings.map((warning) => warning.code)).toEqual(['TEXT_OUTLINED_STYLE', 'TEXT_OUTLINED_SVG'])
  expect(plugin.originals.map((node) => node.opacity)).toEqual([0.7, 0.7, 0.7])
  expect(plugin.clones.every((node) => node.visible)).toBe(true)
  expect(plugin.remove).toHaveBeenCalledOnce()
})

it('exports all text natively if SVG export fails', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const plugin = await setup({ svgFails: true })
  plugin.sendExport()
  const result = await plugin.waitFor('page-assets')
  expect(result.assets.textNodes).toEqual([])
  expect(plugin.backgroundSnapshots).toEqual([[0.7, 0.7, 0.7]])
  expect(plugin.remove).toHaveBeenCalledOnce()
})

it('avoids SVG and font work for a native-only page', async () => {
  const plugin = await setup({ nativeOnly: true })
  plugin.ui.onmessage({ type: 'ready' })
  const scan = await plugin.waitFor('scan-result')
  expect(scan.result.fonts).toEqual([])
  expect(scan.result.warnings.every((warning) => warning.severity === 'warning')).toBe(true)
  plugin.sendExport()
  await plugin.waitFor('page-assets')
  expect(plugin.messages.some((message) => message.type === 'analyze-text')).toBe(false)
  expect(plugin.clone.exportAsync).toHaveBeenCalledTimes(1)
  expect(plugin.originals[0].getStyledTextSegments).not.toHaveBeenCalled()
})

it.each(['cancel', 'currentpagechange', 'close'])('cleans up while awaiting analysis on %s', async (action) => {
  const plugin = await setup({ respond: false })
  plugin.sendExport()
  await plugin.waitFor('analyze-text')
  if (action === 'cancel') plugin.ui.onmessage({ type: 'cancel' })
  else events.get(action)?.()
  await plugin.waitFor('cancelled')
  expect(plugin.backgroundSnapshots).toEqual([])
  expect(plugin.remove).toHaveBeenCalledOnce()
})

it('preserves native text when the analysis response times out', async () => {
  const plugin = await setup({ respond: false })
  vi.useFakeTimers()
  plugin.sendExport()
  await plugin.waitFor('analyze-text')
  await vi.advanceTimersByTimeAsync(30_000)
  const result = await plugin.waitFor('page-assets')
  expect(result.assets.textNodes).toEqual([])
  expect(plugin.backgroundSnapshots).toEqual([[0.7, 0.7, 0.7]])
  expect(plugin.remove).toHaveBeenCalledOnce()
})
