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

type ExportMode = 'pdf' | 'zip'

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
    let frame = 0
    let lastHeight = 0
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = Math.max(260, Math.min(600, Math.ceil(app.scrollHeight)))
        if (Math.abs(height - lastHeight) < 2) return
        lastHeight = height
        send({ type: 'resize', width: 420, height })
      })
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(app)
    window.addEventListener('resize', resize)
    resize()
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
      const message = event.data.pluginMessage
      if (!message) return
      if (message.type === 'scan-result') {
        setScan(message.result)
        const request = pendingScan.current
        if (request && message.requestId === request.requestId) {
          request.resolve(message.result)
          pendingScan.current = null
          return
        }
        setStatus(
          message.result.frames.length
            ? '已准备好，可以直接导出。'
            : '当前页面没有顶层 Frame。',
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
      && !exporting,
  )

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
      <section className="summary-card">
        <div>
          <span className="eyebrow">当前页面</span>
          <strong>{scan?.pageName ?? '读取中…'}</strong>
        </div>
        <button className="ghost-button" type="button" disabled={exporting} onClick={() => send({ type: 'rescan' })}>
          重新扫描
        </button>
      </section>

      {scan && scan.warnings.length > 0 && (
        <section className="section warning-panel">
          <div className="section-title"><span>导出前检查</span></div>
          <ul>
            {scan.warnings.slice(0, 8).map((warning, index) => (
              <li className={warning.severity} key={`${warning.code}-${index}`}>{warning.message}</li>
            ))}
          </ul>
          {scan.warnings.length > 8 && <small>其余 {scan.warnings.length - 8} 项可在交接包报告中查看。</small>}
        </section>
      )}

      {exporting && (
        <section className="progress-card">
          <div className="progress-bar"><i style={{ width: progress ? `${(progress.pageNumber / progress.totalPages) * 100}%` : '4%' }} /></div>
          <span>{progressText(progress)}</span>
        </section>
      )}

      {lastWarnings.length > 0 && !exporting && (
        <div className="result-note">检测到 {lastWarnings.length} 条兼容性提示。</div>
      )}

      <section className="export-card">
        <div className="export-copy">
          <strong>{status}</strong>
          <span>
            {scan ? `${scan.frames.length} 个画板 · ${scan.fonts.length} 种字体样式` : '正在扫描页面'}
          </span>
        </div>
        {exporting ? (
          <button className="danger-button" type="button" onClick={cancelExport}>取消导出</button>
        ) : (
          <div className="export-actions">
            <button
              className="secondary-button"
              type="button"
              title="包含 PDF、字体清单和跨电脑编辑说明"
              disabled={!canExport}
              onClick={() => void startExport('zip')}
            >
              交接包
            </button>
            <button className="primary-button" type="button" disabled={!canExport} onClick={() => void startExport('pdf')}>
              导出 PDF
            </button>
          </div>
        )}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
