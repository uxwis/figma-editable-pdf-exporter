import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import {
  type ExportProgress,
  type ExportWarning,
  type PageExportAssets,
  type PluginToUiMessage,
  type ScanResult,
  type UiToPluginMessage,
  EXPORT_CANCELLED,
  UserFacingError,
  sanitizeFileName,
  toUserFacingError,
} from './shared'
import { buildDeliveryZip } from './export/package'
import { createEditablePdfArtifact } from './export/workflow'
import { parseSvgText } from './export/svg-text'

type ExportMode = 'pdf' | 'zip'

function Icon({ name }: { name: 'refresh' | 'download' }) {
  const paths = {
    refresh: 'M13 6A5.2 5.2 0 1 0 13 10M13 2v4H9',
    download: 'M8 2v8m-3-3 3 3 3-3M3 11v3h10v-3',
  }
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={paths[name]} stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function send(message: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*')
}

function bytesToBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function triggerDownload(bytes: Uint8Array, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([bytesToBlobPart(bytes)], { type: mimeType }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

function progressText(progress: ExportProgress | null): string {
  if (!progress) return '准备导出'
  const phase = {
    preparing: '准备临时画板',
    svg: '提取可编辑文字',
    background: '生成原生背景',
    done: '页面资源完成',
  }[progress.phase]
  return `第 ${progress.pageNumber}/${progress.totalPages} 页 · ${phase} · ${progress.frameName}`
}

function App() {
  const appRef = useRef<HTMLElement>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [status, setStatus] = useState('正在读取当前 Figma 页面…')
  const [lastWarnings, setLastWarnings] = useState<ExportWarning[]>([])
  const pendingPage = useRef<{
    resolve: (assets: PageExportAssets) => void
    reject: (error: Error) => void
  } | null>(null)
  const pendingScan = useRef<{
    requestId: number
    resolve: (result: ScanResult) => void
    reject: (error: Error) => void
  } | null>(null)
  const nextScanRequestId = useRef(1)
  const cancelled = useRef(false)

  useEffect(() => {
    const app = appRef.current
    if (!app) return
    // Measure the expanded height without painting it, then keep the window steady.
    const frame = requestAnimationFrame(() => {
      const instructions = app.querySelector<HTMLDetailsElement>('.instructions-panel')
      const wasOpen = instructions?.open ?? false
      if (instructions) instructions.open = true
      const height = Math.max(180, Math.min(600, Math.ceil(app.scrollHeight)))
      if (instructions) instructions.open = wasOpen
      send({ type: 'resize', width: 420, height })
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
      const message = event.data.pluginMessage
      if (!message) return
      if (message.type === 'analyze-text') {
        let editableTextKeys: string[] = []
        try {
          const parsed = parseSvgText(message.svg, message.textNodes)
          const outlined = new Set(parsed.outlinedTextKeys)
          editableTextKeys = message.textNodes.filter((meta) => !outlined.has(meta.key)).map((meta) => meta.key)
        } catch (error) {
          console.warn('[Editable PDF Exporter] Preserving native text after SVG analysis failed', error)
        }
        send({ type: 'text-analysis', requestId: message.requestId, editableTextKeys })
        return
      }
      if (message.type === 'scan-result') {
        setScan(message.result)
        setScanning(false)
        setLastWarnings([])
        const request = pendingScan.current
        if (request && message.requestId === request.requestId) {
          request.resolve(message.result)
          pendingScan.current = null
          return
        }
        setStatus(
          message.result.warnings.find((warning) => warning.severity === 'error')?.message
          ?? (message.result.frames.length
            ? '已准备好，可以直接导出。'
            : '当前页面没有顶层 Frame。'),
        )
        return
      }
      if (message.type === 'progress') {
        setProgress(message.progress)
        return
      }
      if (message.type === 'page-assets') {
        pendingPage.current?.resolve(message.assets)
        pendingPage.current = null
        return
      }
      if (message.type === 'cancelled') {
        pendingPage.current?.reject(new Error(EXPORT_CANCELLED))
        pendingPage.current = null
        return
      }
      if (message.type === 'error') {
        setScanning(false)
        const error = new UserFacingError(message.code, message.message)
        const request = pendingScan.current
        if (request && message.requestId === request.requestId) {
          request.reject(error)
          pendingScan.current = null
        } else {
          pendingPage.current?.reject(error)
          pendingPage.current = null
        }
        setStatus(`错误：${message.message}`)
      }
    }
    window.addEventListener('message', onMessage)
    send({ type: 'ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const blockingScanError = scan?.warnings.some((warning) => warning.severity === 'error') ?? false
  const canExport = Boolean(
    scan
      && scan.frames.length > 0
      && !blockingScanError
      && !scanning
      && !exporting,
  )

  function rescan(): void {
    setScanning(true)
    setStatus('正在刷新当前页面…')
    send({ type: 'rescan' })
  }

  function requestFreshScan(): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const requestId = nextScanRequestId.current
      nextScanRequestId.current += 1
      pendingScan.current = { requestId, resolve, reject }
      send({ type: 'scan', requestId })
    })
  }

  function requestPage(
    pageId: string,
    frameId: string,
    pageNumber: number,
    totalPages: number,
  ): Promise<PageExportAssets> {
    return new Promise((resolve, reject) => {
      pendingPage.current = { resolve, reject }
      send({ type: 'export-page', pageId, frameId, pageNumber, totalPages })
    })
  }

  async function startExport(mode: ExportMode): Promise<void> {
    if (!scan || !canExport) return
    setExporting(true)
    setLastWarnings([])
    cancelled.current = false
    setStatus('正在刷新当前页面…')
    try {
      const freshScan = await requestFreshScan()
      if (freshScan.frames.length === 0) {
        throw new UserFacingError('NO_FRAMES', '当前页面没有可导出的顶层 Frame。')
      }
      const blockingWarning = freshScan.warnings.find((warning) => warning.severity === 'error')
      if (blockingWarning) {
        throw new UserFacingError('SCAN_BLOCKED', blockingWarning.message)
      }
      setStatus(mode === 'pdf' ? '正在生成可编辑 PDF…' : '正在生成字体交接包…')
      const artifact = await createEditablePdfArtifact({
        scan: freshScan,
        requestPage: (frameId, pageNumber, totalPages) => requestPage(
          freshScan.pageId,
          frameId,
          pageNumber,
          totalPages,
        ),
        isCancelled: () => cancelled.current,
        setStatus,
      })

      setLastWarnings(artifact.warnings)
      if (mode === 'pdf') {
        const fileName = `${sanitizeFileName(freshScan.pageName)}-editable.pdf`
        triggerDownload(artifact.pdfBytes, fileName, 'application/pdf')
        setStatus(`PDF 已导出：${fileName}`)
      } else {
        setStatus('正在打包交接说明和字体清单…')
        const delivery = buildDeliveryZip({
          pdfBytes: artifact.pdfBytes,
          pageName: freshScan.pageName,
          frames: freshScan.frames,
          mappings: artifact.mappings,
          warnings: artifact.warnings,
        })
        triggerDownload(delivery.bytes, delivery.fileName, 'application/zip')
        setStatus(`交接包已导出：${delivery.fileName}`)
      }
    } catch (error) {
      if (error instanceof Error && error.message === EXPORT_CANCELLED) {
        setStatus('导出已取消，Figma 原文件未修改。')
      } else {
        console.error('[Editable PDF Exporter]', error)
        const safe = toUserFacingError(error)
        setStatus(`导出失败：${safe.message}`)
      }
    } finally {
      setExporting(false)
      setProgress(null)
      pendingPage.current = null
      pendingScan.current = null
    }
  }

  function cancelExport(): void {
    cancelled.current = true
    send({ type: 'cancel' })
    setStatus('正在安全取消，将在当前 Figma 导出步骤结束后停止…')
  }

  return (
    <main ref={appRef} className="app-shell">
      <section className="export-card" aria-labelledby="page-title">
        <p className="scan-status" role="status">
          {scanning || status === '正在刷新当前页面…' ? status : ''}
        </p>
        <button className="refresh-button" type="button" title={scanning ? '正在读取当前页面' : '刷新当前页面'} aria-label="刷新当前页面" disabled={exporting || scanning} onClick={rescan}>
          <Icon name="refresh" />
        </button>
        <header className="page-header">
          <h1 id="page-title" title={scan?.pageName}>{scan?.pageName ?? '读取中…'}</h1>
          <p className="muted-label">{scan ? `${scan.frames.length} 个画板 · ${scan.fonts.length} 种字体样式` : '正在扫描…'}</p>
        </header>
        <div className="export-actions">
          {exporting ? (
            <button className="danger-button" type="button" onClick={cancelExport}>取消导出</button>
          ) : (
            <>
              <button className="primary-button" type="button" disabled={!canExport} onClick={() => void startExport('pdf')}>
                <Icon name="download" />
                导出 PDF
              </button>
              <button className="secondary-button" type="button" title="包含 PDF、字体清单和跨电脑编辑说明" disabled={!canExport} onClick={() => void startExport('zip')}>
                交接包
              </button>
            </>
          )}
        </div>

      {exporting && (
        <section className="progress-section">
          <div className="progress-bar" role="progressbar" aria-label="导出进度" aria-valuemin={0} aria-valuemax={scan?.frames.length ?? 1} aria-valuenow={progress?.pageNumber ?? 0}>
            <i style={{ width: progress ? `${(progress.pageNumber / progress.totalPages) * 100}%` : '4%' }} />
          </div>
          <span title={progressText(progress)}>{progressText(progress)}</span>
        </section>
      )}

      {lastWarnings.length > 0 && !exporting && (
        <div className="result-note">
          {lastWarnings.some((warning) => warning.code.startsWith('TEXT_OUTLINED'))
            ? '部分文字已自动转曲保留外观，其余文字保持可编辑。'
            : `检测到 ${lastWarnings.length} 条兼容性提示。`}
        </div>
      )}

        <p className="status-text" role="status">
          {scanning || status === '正在刷新当前页面…' || status === '已准备好，可以直接导出。' ? '' : status}
        </p>
      </section>

      <details className="instructions-panel">
        <summary>导出说明</summary>
        <ul>
          <li>导出当前页面的顶层画板，每个画板对应一页 PDF。</li>
          <li>普通文字保持可编辑；特殊样式或无法可靠重建的文字会自动转曲，保留外观。原 Figma 文件不受影响。</li>
          <li>未嵌入的字体需在接收电脑安装；跨电脑编辑时，已嵌入的字体也可能需要安装同版本字体。</li>
          <li>交接包包含 PDF、字体清单、兼容性提示和编辑说明，不包含字体原文件。</li>
        </ul>
      </details>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
